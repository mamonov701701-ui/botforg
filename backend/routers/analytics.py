from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.database import SessionLocal
from backend.dependencies.auth import get_current_user
from backend.models.bot_user_state import BotUserState
from backend.models.payment import Payment
from backend.models.template import Template
from backend.models.user import User as UserModel

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/analytics/templates")
def analytics_templates(
    db: Session = Depends(get_db), current_user: UserModel = Depends(get_current_user)
):
    templates = db.query(Template).filter(Template.user_id == current_user.id).all()
    result = []
    for tpl in templates:
        launches = (
            db.query(BotUserState)
            .filter(BotUserState.bot.has(template_id=tpl.id))
            .count()
        )
        completions = (
            db.query(BotUserState)
            .filter(
                BotUserState.bot.has(template_id=tpl.id),
                BotUserState.current_node_id == None,
            )
            .count()
        )
        payments_count = (
            db.query(Payment)
            .filter(Payment.template_id == tpl.id, Payment.status == "paid")
            .count()
        )
        payments_sum = (
            db.query(func.sum(Payment.amount))
            .filter(Payment.template_id == tpl.id, Payment.status == "paid")
            .scalar()
            or 0
        )
        result.append(
            {
                "id": tpl.id,
                "name": tpl.name,
                "launches": launches,
                "completions": completions,
                "payments_count": payments_count,
                "payments_sum": payments_sum,
            }
        )
    return result


@router.get("/analytics/template/{id}")
def analytics_template(
    id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    tpl = (
        db.query(Template)
        .filter(Template.id == id, Template.user_id == current_user.id)
        .first()
    )
    if not tpl:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    launches = (
        db.query(BotUserState).filter(BotUserState.bot.has(template_id=tpl.id)).count()
    )
    completions = (
        db.query(BotUserState)
        .filter(
            BotUserState.bot.has(template_id=tpl.id),
            BotUserState.current_node_id == None,
        )
        .count()
    )
    payments = (
        db.query(Payment)
        .filter(Payment.template_id == tpl.id, Payment.status == "paid")
        .all()
    )
    payments_sum = sum(p.amount for p in payments)
    unique_users = (
        db.query(BotUserState.telegram_user_id)
        .filter(BotUserState.bot.has(template_id=tpl.id))
        .distinct()
        .count()
    )
    # Среднее время прохождения
    times = []
    for state in db.query(BotUserState).filter(
        BotUserState.bot.has(template_id=tpl.id)
    ):
        hist = state.history or []
        if len(hist) >= 2:
            t0 = datetime.fromisoformat(hist[0]["entered_at"])
            t1 = datetime.fromisoformat(hist[-1]["entered_at"])
            times.append((t1 - t0).total_seconds())
    avg_time = int(sum(times) / len(times)) if times else 0
    # Топ-5 точек выхода
    exit_nodes = {}
    for state in db.query(BotUserState).filter(
        BotUserState.bot.has(template_id=tpl.id)
    ):
        if state.current_node_id:
            exit_nodes[state.current_node_id] = (
                exit_nodes.get(state.current_node_id, 0) + 1
            )
    top_exits = sorted(exit_nodes.items(), key=lambda x: -x[1])[:5]
    return {
        "id": tpl.id,
        "name": tpl.name,
        "launches": launches,
        "completions": completions,
        "payments_count": len(payments),
        "payments_sum": payments_sum,
        "unique_users": unique_users,
        "avg_time": avg_time,
        "top_exits": top_exits,
        "payments": [
            {
                "id": p.id,
                "amount": p.amount,
                "currency": p.currency,
                "status": p.status,
                "created_at": p.created_at,
            }
            for p in payments
        ],
    }


@router.get("/analytics/payments")
def analytics_payments(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
    start_date: str = Query(None),
    end_date: str = Query(None),
    bot_id: int = Query(None),
    template_id: int = Query(None),
):
    q = db.query(Payment).join(Template).filter(Template.user_id == current_user.id)
    if start_date:
        q = q.filter(Payment.created_at >= datetime.fromisoformat(start_date))
    if end_date:
        q = q.filter(Payment.created_at <= datetime.fromisoformat(end_date))
    if bot_id:
        q = q.filter(Payment.bot_id == bot_id)
    if template_id:
        q = q.filter(Payment.template_id == template_id)
    payments = q.all()
    return [
        {
            "id": p.id,
            "amount": p.amount,
            "currency": p.currency,
            "status": p.status,
            "created_at": p.created_at,
            "bot_id": p.bot_id,
            "template_id": p.template_id,
        }
        for p in payments
    ]


@router.get("/analytics/stats/{template_id}")
def analytics_stats(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    tpl = (
        db.query(Template)
        .filter(Template.id == template_id, Template.user_id == current_user.id)
        .first()
    )
    if not tpl:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    nodes = (tpl.content or {}).get("nodes", [])
    node_stats = {n["id"]: {"label": n["data"]["label"], "count": 0} for n in nodes}
    for state in db.query(BotUserState).filter(
        BotUserState.bot.has(template_id=tpl.id)
    ):
        hist = state.history or []
        for h in hist:
            if h["node_id"] in node_stats:
                node_stats[h["node_id"]]["count"] += 1
    return node_stats
