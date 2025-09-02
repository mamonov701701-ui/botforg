from fastapi import APIRouter, Request, HTTPException, Depends
from sqlalchemy.orm import Session
from backend.database import SessionLocal
from backend.models.bot import BotInstance
from backend.models.bot_user_state import BotUserState
from backend.models.template import Template
import requests
from datetime import datetime
from backend.models.payment import Payment
import uuid

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

TELEGRAM_API = 'https://api.telegram.org/bot'

@router.post('/webhook/{bot_id}')
async def telegram_webhook(bot_id: int, request: Request, db: Session = Depends(get_db)):
    update = await request.json()
    bot = db.query(BotInstance).filter(BotInstance.id == bot_id, BotInstance.is_active == True).first()
    if not bot:
        raise HTTPException(status_code=404, detail='Бот не найден или неактивен')
    token = bot.token
    message = update.get('message') or update.get('callback_query', {}).get('message')
    chat_id = message['chat']['id'] if message else None
    telegram_user_id = str(chat_id) if chat_id else None
    state = db.query(BotUserState).filter_by(telegram_user_id=telegram_user_id, bot_id=bot_id).first() if telegram_user_id else None
    tpl = db.query(Template).filter(Template.id == bot.template_id).first()
    content = tpl.content or {}
    nodes = content.get('nodes', [])
    edges = content.get('edges', [])
    def find_node(node_id):
        return next((n for n in nodes if n['id'] == node_id), None)
    def find_start_node():
        return next((n for n in nodes if n.get('data', {}).get('is_start')), None) or (nodes[0] if nodes else None)
    def find_edges_from(node_id):
        return [e for e in edges if e['source'] == node_id]
    def find_edge_by_label(node_id, label):
        return next((e for e in edges if e['source'] == node_id and e.get('data', {}).get('label') == label), None)
    # --- Telegram Payments: pre_checkout_query ---
    if 'pre_checkout_query' in update:
        pre = update['pre_checkout_query']
        # Всегда подтверждаем
        requests.post(f'{TELEGRAM_API}{token}/answerPreCheckoutQuery', json={
            'pre_checkout_query_id': pre['id'],
            'ok': True
        })
        return {'ok': True}
    # --- Telegram Payments: successful_payment ---
    if message and 'successful_payment' in message:
        payment_info = message['successful_payment']
        # Найти payment по reference
        reference = payment_info['invoice_payload']
        payment = db.query(Payment).filter_by(bot_id=bot_id, reference=reference).first()
        if payment:
            payment.status = 'paid'
            db.commit()
        # Найти state по reference
        if state:
            node = find_node(state.current_node_id)
            if node and node['type'] == 'payment':
                next_node = find_node(node['data']['config'].get('success_node_id'))
                if next_node:
                    state.current_node_id = next_node['id']
                    db.commit()
                    send_node_message(token, chat_id, next_node, find_edges_from(next_node['id']))
        return {'ok': True}
    text = update.get('message', {}).get('text')
    is_start = text == '/start' or not state
    if is_start:
        node = find_start_node()
        if not node:
            requests.post(f'{TELEGRAM_API}{token}/sendMessage', json={
                'chat_id': chat_id,
                'text': 'Сценарий не найден.'
            })
            return {'ok': True}
        if not state:
            state = BotUserState(telegram_user_id=telegram_user_id, bot_id=bot_id)
            db.add(state)
        state.current_node_id = node['id']
        state.history = [{'node_id': node['id'], 'entered_at': str(datetime.utcnow())}]
        db.commit()
        send_node_message(token, chat_id, node, find_edges_from(node['id']))
        return {'ok': True}
    node = find_node(state.current_node_id)
    if not node:
        requests.post(f'{TELEGRAM_API}{token}/sendMessage', json={
            'chat_id': chat_id,
            'text': 'Ошибка сценария: блок не найден.'
        })
        return {'ok': True}
    button_label = update.get('callback_query', {}).get('data')
    user_text = update.get('message', {}).get('text')
    next_edge = None
    # PAYMENT BLOCK
    if state and node and node['type'] == 'payment':
        config = node['data']['config']
        provider = config.get('provider', 'telegram')
        amount = int(config.get('amount', 0))
        currency = config.get('currency', 'RUB')
        description = config.get('description', 'Оплата')
        payload = config.get('payload') or f'{telegram_user_id}:{node["id"]}'
        title = config.get('title') or 'Оплата'
        photo_url = config.get('photo_url')
        success_url = config.get('success_url')
        fail_url = config.get('fail_url')
        # Stripe/CloudPayments
        if provider in ('stripe', 'cloudpayments'):
            # Генерируем ссылку на оплату (заглушка, интеграция с реальным API Stripe/CloudPayments)
            payment_id = str(uuid.uuid4())
            pay_url = f'https://pay.example.com/{provider}?amount={amount}&currency={currency}&desc={description}&ref={payload}&success={success_url or ""}&fail={fail_url or ""}'
            payment = Payment(
                bot_id=bot_id,
                user_id=None,
                template_id=tpl.id,
                amount=amount,
                currency=currency,
                status='pending',
                reference=payload
            )
            db.add(payment)
            db.commit()
            reply_markup = {
                'inline_keyboard': [[
                    {'text': f'Оплатить {amount} {currency}', 'url': pay_url}
                ]]
            }
            requests.post(f'{TELEGRAM_API}{token}/sendMessage', json={
                'chat_id': chat_id,
                'text': f'Для продолжения требуется оплата: {amount} {currency}\n{description}',
                'reply_markup': reply_markup
            })
            return {'ok': True}
        # Проверяем, есть ли уже успешная оплата
        payment = db.query(Payment).filter_by(bot_id=bot_id, user_id=None, reference=config.get('payload') or f'{telegram_user_id}:{node["id"]}', status='paid').first()
        if payment:
            next_node = find_node(config.get('success_node_id'))
            if next_node:
                state.current_node_id = next_node['id']
                db.commit()
                send_node_message(token, chat_id, next_node, find_edges_from(next_node['id']))
            else:
                requests.post(f'{TELEGRAM_API}{token}/sendMessage', json={
                    'chat_id': chat_id,
                    'text': 'Оплата прошла, но следующий блок не найден.'
                })
            return {'ok': True}
        # Если нет платежа — создаём и отправляем invoice
        amount = int(config.get('amount', 0))
        currency = config.get('currency', 'RUB')
        description = config.get('description', 'Оплата')
        provider_token = config.get('provider_token')
        payload = config.get('payload') or f'{telegram_user_id}:{node["id"]}'
        title = config.get('title') or 'Оплата'
        photo_url = config.get('photo_url')
        # Создаём платеж
        payment = Payment(
            bot_id=bot_id,
            user_id=None,
            template_id=tpl.id,
            amount=amount,
            currency=currency,
            status='pending',
            reference=payload
        )
        db.add(payment)
        db.commit()
        invoice_data = {
            'chat_id': chat_id,
            'title': title,
            'description': description,
            'payload': payload,
            'provider_token': provider_token,
            'currency': currency,
            'prices': [{ 'label': title, 'amount': amount * 100 }],
        }
        if photo_url:
            invoice_data['photo_url'] = photo_url
        requests.post(f'{TELEGRAM_API}{token}/sendInvoice', json=invoice_data)
        return {'ok': True}
    # Продолжаем сценарий
    next_edge = None
    if node['type'] == 'button' and button_label:
        next_edge = find_edge_by_label(node['id'], button_label)
    elif node['type'] == 'input' and user_text:
        next_edge = find_edges_from(node['id'])[0] if find_edges_from(node['id']) else None
    elif node['type'] == 'condition':
        # (опционально) — пока просто по первому исходящему
        next_edge = find_edges_from(node['id'])[0] if find_edges_from(node['id']) else None
    elif node['type'] == 'message' and (button_label or user_text):
        next_edge = find_edges_from(node['id'])[0] if find_edges_from(node['id']) else None
    if not next_edge:
        requests.post(f'{TELEGRAM_API}{token}/sendMessage', json={
            'chat_id': chat_id,
            'text': 'Сценарий завершён.'
        })
        state.current_node_id = None
        db.commit()
        return {'ok': True}
    next_node = find_node(next_edge['target'])
    if not next_node:
        requests.post(f'{TELEGRAM_API}{token}/sendMessage', json={
            'chat_id': chat_id,
            'text': 'Ошибка сценария: следующий блок не найден.'
        })
        state.current_node_id = None
        db.commit()
        return {'ok': True}
    # Обновляем состояние
    state.current_node_id = next_node['id']
    hist = state.history or []
    hist.append({'node_id': next_node['id'], 'entered_at': str(datetime.utcnow())})
    state.history = hist
    db.commit()
    send_node_message(token, chat_id, next_node, find_edges_from(next_node['id']))
    return {'ok': True}

def send_node_message(token, chat_id, node, edges):
    text = node['data']['label']
    reply_markup = None
    if node['type'] == 'button' and edges:
        buttons = [[{'text': e.get('data', {}).get('label', 'Далее'), 'callback_data': e.get('data', {}).get('label', 'Далее')}] for e in edges if e.get('data', {}).get('label')]
        reply_markup = {'inline_keyboard': buttons}
    requests.post(f'{TELEGRAM_API}{token}/sendMessage', json={
        'chat_id': chat_id,
        'text': text,
        'reply_markup': reply_markup
    })

@router.get('/payment/success/{bot_id}/{payload}')
def payment_success(bot_id: int, payload: str, db: Session = Depends(get_db)):
    payment = db.query(Payment).filter_by(bot_id=bot_id, reference=payload).first()
    if payment:
        payment.status = 'paid'
        db.commit()
    # Найти state и перевести пользователя на success_node_id (можно реализовать push-уведомление через Telegram API)
    return {'ok': True}

@router.get('/payment/fail/{bot_id}/{payload}')
def payment_fail(bot_id: int, payload: str, db: Session = Depends(get_db)):
    payment = db.query(Payment).filter_by(bot_id=bot_id, reference=payload).first()
    if payment:
        payment.status = 'failed'
        db.commit()
    return {'ok': True} 
