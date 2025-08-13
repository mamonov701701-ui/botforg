from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.database import SessionLocal
from models.bot import BotInstance
from models.template import Template
from backend.schemas.bot import BotInstanceCreate, BotInstanceOut
from backend.dependencies.auth import get_current_user
from models.user import User as UserModel
import requests
from backend.dependencies.roles import require_role

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

TELEGRAM_API = 'https://api.telegram.org/bot'

@router.post('/connect', response_model=BotInstanceOut)
def connect_bot(data: BotInstanceCreate, db: Session = Depends(get_db), current_user: UserModel = Depends(get_current_user)):
    # Проверка токена через getMe
    resp = requests.get(f'{TELEGRAM_API}{data.token}/getMe')
    if not resp.ok or not resp.json().get('ok'):
        raise HTTPException(status_code=400, detail='Некорректный токен Telegram')
    username = resp.json()['result']['username']
    # Проверка шаблона
    tpl = db.query(Template).filter(Template.id == data.template_id, Template.user_id == current_user.id).first()
    if not tpl:
        raise HTTPException(status_code=404, detail='Шаблон не найден')
    # Создание BotInstance
    bot = BotInstance(
        user_id=current_user.id,
        token=data.token,
        username=username,
        template_id=data.template_id,
        is_active=True
    )
    db.add(bot)
    db.commit()
    db.refresh(bot)
    # Установка webhook
    webhook_url = f"https://yourdomain.com/webhook/{bot.id}"
    set_hook = requests.get(f'{TELEGRAM_API}{data.token}/setWebhook', params={'url': webhook_url})
    if not set_hook.ok or not set_hook.json().get('ok'):
        db.delete(bot)
        db.commit()
        raise HTTPException(status_code=400, detail='Ошибка установки webhook')
    bot.webhook_url = webhook_url
    db.commit()
    db.refresh(bot)
    return bot

@router.get('/bots', response_model=list[BotInstanceOut])
def get_bots(db: Session = Depends(get_db), current_user: UserModel = Depends(get_current_user)):
    return db.query(BotInstance).filter(BotInstance.user_id == current_user.id).all()

@router.get('/bots/me')
def get_bot_me(token: str):
    resp = requests.get(f'{TELEGRAM_API}{token}/getMe')
    if not resp.ok or not resp.json().get('ok'):
        raise HTTPException(status_code=400, detail='Некорректный токен Telegram')
    return resp.json()['result']

@router.post('/bots/{id}/disconnect')
def disconnect_bot(id: int, db: Session = Depends(get_db), current_user: UserModel = Depends(get_current_user)):
    bot = db.query(BotInstance).filter(BotInstance.id == id, BotInstance.user_id == current_user.id).first()
    if not bot:
        raise HTTPException(status_code=404, detail='Бот не найден')
    # Удалить webhook
    requests.get(f'{TELEGRAM_API}{bot.token}/deleteWebhook')
    bot.is_active = False
    db.commit()
    return {'ok': True}

@router.post('/bots/{id}/set-template')
def set_bot_template(id: int, template_id: int, db: Session = Depends(get_db), current_user: UserModel = Depends(get_current_user)):
    bot = db.query(BotInstance).filter(BotInstance.id == id, BotInstance.user_id == current_user.id).first()
    tpl = db.query(Template).filter(Template.id == template_id, Template.user_id == current_user.id).first()
    if not bot or not tpl:
        raise HTTPException(status_code=404, detail='Бот или шаблон не найден')
    bot.template_id = template_id
    db.commit()
    return {'ok': True} 