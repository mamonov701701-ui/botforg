import uuid
from datetime import datetime, timezone
from typing import Optional, Tuple

import requests
from backend.database import SessionLocal
from backend.models.bot import BotInstance
from backend.models.bot_user_state import BotUserState
from backend.models.constructor_core import CtorBotUser
from backend.models.payment import Payment
from backend.models.template import Template
from backend.services.scenario_flow.input_block import (
    apply_input_success_to_ctor_user,
    pick_error_target_id,
    pick_success_target_id,
)
from backend.services.constructor.repositories.ctor_sessions_repository import (
    CtorSessionsRepository,
)
from backend.services.message_template.runtime_outbound import render_outbound_message_text
from backend.utils.ctor_bot_resolve import resolve_ctor_bot_id
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


TELEGRAM_API = "https://api.telegram.org/bot"


def _telegram_template_text_from_node(node: dict) -> str:
    """Текст исходящего сообщения: editor v2 (`settings.text`) или legacy (`data.label`)."""
    data = node.get("data") or {}
    settings = data.get("settings") or {}
    raw = settings.get("text")
    if isinstance(raw, str) and raw.strip():
        return raw
    lab = data.get("label")
    if isinstance(lab, str):
        return lab
    return ""


def _resolve_ctor_telegram_user(
    db: Session,
    *,
    platform_bot_id: int,
    chat_id,
    username: Optional[str] = None,
    first_name: Optional[str] = None,
    last_name: Optional[str] = None,
    create_if_missing: bool = False,
) -> Tuple[Optional[int], Optional[int]]:
    """
    ctor_bot_users для Telegram: связка ctor-бота с platform Bot.id и chat_id.
    Возвращает (bot_user_id, session_id) или (None, None).
    """
    ctor_bid = resolve_ctor_bot_id(db, platform_bot_id)
    if not ctor_bid:
        return None, None
    external = str(chat_id)
    bu = (
        db.query(CtorBotUser)
        .filter(
            CtorBotUser.bot_id == ctor_bid,
            CtorBotUser.channel == "telegram",
            CtorBotUser.external_user_id == external,
        )
        .first()
    )
    if not bu and create_if_missing:
        bu = CtorBotUser(
            bot_id=ctor_bid,
            channel="telegram",
            external_user_id=external,
            username=username,
            first_name=first_name,
            last_name=last_name,
            status="active",
        )
        db.add(bu)
        db.commit()
        db.refresh(bu)
    if not bu:
        return None, None
    sess = CtorSessionsRepository(db).find_active_for_bot_user(bu.id)
    return bu.id, (sess.id if sess else None)


@router.post("/webhook/{bot_id}")
async def telegram_webhook(
    bot_id: int, request: Request, db: Session = Depends(get_db)
):
    update = await request.json()
    bot = (
        db.query(BotInstance)
        .filter(BotInstance.id == bot_id, BotInstance.is_active == True)
        .first()
    )
    if not bot:
        raise HTTPException(status_code=404, detail="Бот не найден или неактивен")
    token = bot.token
    message = update.get("message") or update.get("callback_query", {}).get("message")
    chat_id = message["chat"]["id"] if message else None
    telegram_user_id = str(chat_id) if chat_id else None
    state = (
        db.query(BotUserState)
        .filter_by(telegram_user_id=telegram_user_id, bot_id=bot_id)
        .first()
        if telegram_user_id
        else None
    )
    tpl = db.query(Template).filter(Template.id == bot.template_id).first()
    content = tpl.content or {}
    nodes = content.get("nodes", [])
    edges = content.get("edges", [])

    def find_node(node_id):
        return next((n for n in nodes if n["id"] == node_id), None)

    def find_start_node():
        return next((n for n in nodes if n.get("data", {}).get("is_start")), None) or (
            nodes[0] if nodes else None
        )

    def find_edges_from(node_id):
        return [e for e in edges if e["source"] == node_id]

    def find_edge_by_label(node_id, label):
        return next(
            (
                e
                for e in edges
                if e["source"] == node_id and e.get("data", {}).get("label") == label
            ),
            None,
        )

    # --- Telegram Payments: pre_checkout_query ---
    if "pre_checkout_query" in update:
        pre = update["pre_checkout_query"]
        # Всегда подтверждаем
        requests.post(
            f"{TELEGRAM_API}{token}/answerPreCheckoutQuery",
            json={"pre_checkout_query_id": pre["id"], "ok": True},
        )
        return {"ok": True}
    # --- Telegram Payments: successful_payment ---
    if message and "successful_payment" in message:
        payment_info = message["successful_payment"]
        # Найти payment по reference
        reference = payment_info["invoice_payload"]
        payment = (
            db.query(Payment).filter_by(bot_id=bot_id, reference=reference).first()
        )
        if payment:
            payment.status = "paid"
            db.commit()
        # Найти state по reference
        if state:
            state.last_interaction_at = datetime.now(timezone.utc)
            node = find_node(state.current_node_id)
            if node and node["type"] == "payment":
                next_node = find_node(node["data"]["config"].get("success_node_id"))
                if next_node:
                    state.current_node_id = next_node["id"]
                    db.commit()
                    send_node_message(
                        db,
                        token,
                        chat_id,
                        next_node,
                        find_edges_from(next_node["id"]),
                        platform_bot_id=bot_id,
                    )
        return {"ok": True}
    # Проверяем статус пользователя - если забанен или отписался, не обрабатываем
    if state and state.status in ("banned", "unsubscribed"):
        return {"ok": True}
    
    # Обновляем last_interaction_at при любом взаимодействии
    now = datetime.now(timezone.utc)
    if state:
        state.last_interaction_at = now
        # Если был inactive, активируем при новом взаимодействии
        if state.status == "inactive":
            state.status = "active"
    
    text = update.get("message", {}).get("text")
    tg_from = (message or {}).get("from", {}) if message else {}
    tg_username = tg_from.get("username")
    tg_first_name = tg_from.get("first_name")
    tg_last_name = tg_from.get("last_name")
    is_start = text == "/start" or (text and text.startswith("/start")) or not state
    
    # Извлекаем UTM-параметры и entry_point из команды /start
    entry_point = None
    utm_source = None
    utm_campaign = None
    
    if text and text.startswith("/start"):
        # Парсим /start?entry_point=promo1&utm_source=google&utm_campaign=summer
        parts = text.split(" ", 1)
        if len(parts) > 1:
            params_str = parts[1]
            # Простой парсинг параметров (можно улучшить)
            params = {}
            for param in params_str.split("&"):
                if "=" in param:
                    key, value = param.split("=", 1)
                    params[key] = value
            entry_point = params.get("entry_point") or params.get("ref") or params.get("start")
            utm_source = params.get("utm_source")
            utm_campaign = params.get("utm_campaign")
    
    # Получаем имя пользователя из Telegram (если доступно)
    user_name = None
    if message:
        user = message.get("from", {})
        first_name = user.get("first_name")
        last_name = user.get("last_name")
        if first_name:
            user_name = f"{first_name} {last_name}".strip() if last_name else first_name
    
    if is_start:
        node = find_start_node()
        if not node:
            requests.post(
                f"{TELEGRAM_API}{token}/sendMessage",
                json={"chat_id": chat_id, "text": "Сценарий не найден."},
            )
            return {"ok": True}
        if not state:
            state = BotUserState(
                telegram_user_id=telegram_user_id,
                bot_id=bot_id,
                channel="telegram",
                status="active",
                last_interaction_at=now,
                name=user_name,
                entry_point=entry_point,
                utm_source=utm_source,
                utm_campaign=utm_campaign
            )
            db.add(state)
        else:
            # Обновляем имя и UTM при повторном /start (если еще не заполнены)
            if not state.name and user_name:
                state.name = user_name
            if not state.entry_point and entry_point:
                state.entry_point = entry_point
            if not state.utm_source and utm_source:
                state.utm_source = utm_source
            if not state.utm_campaign and utm_campaign:
                state.utm_campaign = utm_campaign
        state.current_node_id = node["id"]
        state.history = [
            {"node_id": node["id"], "entered_at": str(now)}
        ]
        state.last_interaction_at = now
        db.commit()
        send_node_message(
            db, token, chat_id, node, find_edges_from(node["id"]), platform_bot_id=bot_id
        )
        return {"ok": True}
    node = find_node(state.current_node_id)
    if not node:
        requests.post(
            f"{TELEGRAM_API}{token}/sendMessage",
            json={"chat_id": chat_id, "text": "Ошибка сценария: блок не найден."},
        )
        return {"ok": True}
    button_label = update.get("callback_query", {}).get("data")
    user_text = update.get("message", {}).get("text")
    next_edge = None
    # PAYMENT BLOCK
    if state and node and node["type"] == "payment":
        config = node["data"]["config"]
        provider = config.get("provider", "telegram")
        amount = int(config.get("amount", 0))
        currency = config.get("currency", "RUB")
        description = config.get("description", "Оплата")
        payload = config.get("payload") or f'{telegram_user_id}:{node["id"]}'
        title = config.get("title") or "Оплата"
        photo_url = config.get("photo_url")
        success_url = config.get("success_url")
        fail_url = config.get("fail_url")
        # Stripe/CloudPayments
        if provider in ("stripe", "cloudpayments"):
            # Генерируем ссылку на оплату (заглушка, интеграция с реальным API Stripe/CloudPayments)
            payment_id = str(uuid.uuid4())
            pay_url = f'https://pay.example.com/{provider}?amount={amount}&currency={currency}&desc={description}&ref={payload}&success={success_url or ""}&fail={fail_url or ""}'
            payment = Payment(
                bot_id=bot_id,
                user_id=None,
                template_id=tpl.id,
                amount=amount,
                currency=currency,
                status="pending",
                reference=payload,
            )
            db.add(payment)
            db.commit()
            reply_markup = {
                "inline_keyboard": [
                    [{"text": f"Оплатить {amount} {currency}", "url": pay_url}]
                ]
            }
            requests.post(
                f"{TELEGRAM_API}{token}/sendMessage",
                json={
                    "chat_id": chat_id,
                    "text": f"Для продолжения требуется оплата: {amount} {currency}\n{description}",
                    "reply_markup": reply_markup,
                },
            )
            return {"ok": True}
        # Проверяем, есть ли уже успешная оплата
        payment = (
            db.query(Payment)
            .filter_by(
                bot_id=bot_id,
                user_id=None,
                reference=config.get("payload") or f'{telegram_user_id}:{node["id"]}',
                status="paid",
            )
            .first()
        )
        if payment:
            next_node = find_node(config.get("success_node_id"))
            if next_node:
                state.current_node_id = next_node["id"]
                state.last_interaction_at = datetime.now(timezone.utc)
                db.commit()
                send_node_message(
                    db,
                    token,
                    chat_id,
                    next_node,
                    find_edges_from(next_node["id"]),
                    platform_bot_id=bot_id,
                )
            else:
                requests.post(
                    f"{TELEGRAM_API}{token}/sendMessage",
                    json={
                        "chat_id": chat_id,
                        "text": "Оплата прошла, но следующий блок не найден.",
                    },
                )
            return {"ok": True}
        # Если нет платежа — создаём и отправляем invoice
        amount = int(config.get("amount", 0))
        currency = config.get("currency", "RUB")
        description = config.get("description", "Оплата")
        provider_token = config.get("provider_token")
        payload = config.get("payload") or f'{telegram_user_id}:{node["id"]}'
        title = config.get("title") or "Оплата"
        photo_url = config.get("photo_url")
        # Создаём платеж
        payment = Payment(
            bot_id=bot_id,
            user_id=None,
            template_id=tpl.id,
            amount=amount,
            currency=currency,
            status="pending",
            reference=payload,
        )
        db.add(payment)
        db.commit()
        invoice_data = {
            "chat_id": chat_id,
            "title": title,
            "description": description,
            "payload": payload,
            "provider_token": provider_token,
            "currency": currency,
            "prices": [{"label": title, "amount": amount * 100}],
        }
        if photo_url:
            invoice_data["photo_url"] = photo_url
        requests.post(f"{TELEGRAM_API}{token}/sendInvoice", json=invoice_data)
        return {"ok": True}
    # Продолжаем сценарий
    next_edge = None
    if node["type"] == "button" and button_label:
        next_edge = find_edge_by_label(node["id"], button_label)
    elif node["type"] == "input" and user_text is not None:
        outgoing = find_edges_from(node["id"])
        settings = (node.get("data") or {}).get("settings") or {}
        ctor_bid = resolve_ctor_bot_id(db, bot_id)
        ctor_uid, _ = _resolve_ctor_telegram_user(
            db,
            platform_bot_id=bot_id,
            chat_id=chat_id,
            username=tg_username,
            first_name=tg_first_name,
            last_name=tg_last_name,
            create_if_missing=True,
        )
        if ctor_uid is not None and ctor_bid is not None:
            save_res = apply_input_success_to_ctor_user(
                db,
                bot_id=ctor_bid,
                bot_user_id=ctor_uid,
                settings=settings,
                raw_answer=user_text,
                commit=True,
            )
            if not save_res.ok:
                err_target_id = pick_error_target_id(outgoing, node["id"])
                if err_target_id:
                    next_edge = next(
                        (e for e in outgoing if e.get("target") == err_target_id),
                        None,
                    )
                else:
                    requests.post(
                        f"{TELEGRAM_API}{token}/sendMessage",
                        json={
                            "chat_id": chat_id,
                            "text": save_res.error or "Ответ не прошёл проверку. Попробуйте ещё раз.",
                        },
                    )
                    return {"ok": True}
            else:
                success_target_id = pick_success_target_id(outgoing, node["id"])
                next_edge = next(
                    (e for e in outgoing if e.get("target") == success_target_id),
                    outgoing[0] if outgoing else None,
                )
        else:
            next_edge = outgoing[0] if outgoing else None
    elif node["type"] == "condition":
        # (опционально) — пока просто по первому исходящему
        next_edge = (
            find_edges_from(node["id"])[0] if find_edges_from(node["id"]) else None
        )
    elif node["type"] == "message" and (button_label or user_text):
        next_edge = (
            find_edges_from(node["id"])[0] if find_edges_from(node["id"]) else None
        )
    if not next_edge:
        requests.post(
            f"{TELEGRAM_API}{token}/sendMessage",
            json={"chat_id": chat_id, "text": "Сценарий завершён."},
        )
        state.current_node_id = None
        state.last_interaction_at = datetime.now(timezone.utc)
        db.commit()
        return {"ok": True}
    next_node = find_node(next_edge["target"])
    if not next_node:
        requests.post(
            f"{TELEGRAM_API}{token}/sendMessage",
            json={
                "chat_id": chat_id,
                "text": "Ошибка сценария: следующий блок не найден.",
            },
        )
        state.current_node_id = None
        state.last_interaction_at = datetime.now(timezone.utc)
        db.commit()
        return {"ok": True}
    # Обновляем состояние
    now = datetime.now(timezone.utc)
    state.current_node_id = next_node["id"]
    state.last_interaction_at = now
    hist = state.history or []
    hist.append(
        {"node_id": next_node["id"], "entered_at": str(now)}
    )
    state.history = hist
    db.commit()
    send_node_message(
        db,
        token,
        chat_id,
        next_node,
        find_edges_from(next_node["id"]),
        platform_bot_id=bot_id,
    )
    return {"ok": True}


def send_node_message(
    db: Session,
    token,
    chat_id,
    node,
    edges,
    *,
    platform_bot_id: int,
):
    ctor_uid, sess_id = _resolve_ctor_telegram_user(
        db, platform_bot_id=platform_bot_id, chat_id=chat_id
    )
    text = _telegram_template_text_from_node(node)
    if ctor_uid is not None and text:
        text = render_outbound_message_text(
            db,
            bot_user_id=ctor_uid,
            template_text=text,
            session_id=sess_id,
        )
    if not text:
        text = (node.get("data") or {}).get("label") or " "
    reply_markup = None
    if node.get("type") == "button" and edges:
        buttons = []
        for e in edges:
            raw_label = e.get("data", {}).get("label")
            if not raw_label:
                continue
            raw_label = str(raw_label)
            display_label = raw_label
            if ctor_uid is not None and "{{" in raw_label:
                display_label = render_outbound_message_text(
                    db,
                    bot_user_id=ctor_uid,
                    template_text=raw_label,
                    session_id=sess_id,
                )
            buttons.append(
                [{"text": display_label, "callback_data": raw_label}]
            )
        reply_markup = {"inline_keyboard": buttons}
    requests.post(
        f"{TELEGRAM_API}{token}/sendMessage",
        json={"chat_id": chat_id, "text": text, "reply_markup": reply_markup},
    )


@router.get("/payment/success/{bot_id}/{payload}")
def payment_success(bot_id: int, payload: str, db: Session = Depends(get_db)):
    payment = db.query(Payment).filter_by(bot_id=bot_id, reference=payload).first()
    if payment:
        payment.status = "paid"
        db.commit()
    # Найти state и перевести пользователя на success_node_id (можно реализовать push-уведомление через Telegram API)
    return {"ok": True}


@router.get("/payment/fail/{bot_id}/{payload}")
def payment_fail(bot_id: int, payload: str, db: Session = Depends(get_db)):
    payment = db.query(Payment).filter_by(bot_id=bot_id, reference=payload).first()
    if payment:
        payment.status = "failed"
        db.commit()
    return {"ok": True}
