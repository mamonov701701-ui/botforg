"""
Подписка на webhook MAX: POST/GET/DELETE https://platform-api.max.ru/subscriptions.
Токен только в заголовке Authorization. Секрет webhook хранится в credentials, не логируется.
"""
import json
import logging
import random
import string
from typing import Any

import requests

from backend.models.bot_channel import BotChannelConnection
from backend.settings import settings
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

DEFAULT_UPDATE_TYPES = ["message_created", "bot_started"]


def _gen_webhook_secret(length: int | None = None) -> str:
    length = length or getattr(settings, "MAX_WEBHOOK_SECRET_LEN", 48)
    alphabet = string.ascii_letters + string.digits + "_-"
    return "".join(random.choices(alphabet, k=min(length, 64)))


def _get_max_credentials(conn: BotChannelConnection) -> dict[str, Any]:
    if not conn or not conn.credentials_json:
        return {}
    try:
        return json.loads(conn.credentials_json)
    except Exception:
        return {}


def ensure_webhook_subscribed(bot_id: int, db: Session) -> None:
    """
    Регистрирует webhook в MAX для бота.
    URL: {MAX_WEBHOOK_BASE_URL}/webhooks/max/{bot_id}.
    Требует: token и (при отсутствии) генерирует webhook_secret; MAX_WEBHOOK_BASE_URL в prod.
    """
    base_url = (getattr(settings, "MAX_WEBHOOK_BASE_URL", None) or "").strip()
    if not base_url:
        if getattr(settings, "ENVIRONMENT", "") == "production":
            raise ValueError("MAX_WEBHOOK_BASE_URL is required in production to enable MAX channel")
        base_url = "https://YOUR_DOMAIN"
    conn = db.query(BotChannelConnection).filter(
        BotChannelConnection.bot_id == bot_id,
        BotChannelConnection.channel == "max",
    ).first()
    if not conn:
        raise ValueError("MAX channel connection not found")
    creds = _get_max_credentials(conn)
    token = creds.get("token")
    if not token:
        raise ValueError("MAX token not set")
    secret = creds.get("webhook_secret")
    if not secret:
        secret = _gen_webhook_secret()
        creds["webhook_secret"] = secret
        conn.credentials_json = json.dumps(creds)
        db.commit()
    webhook_url = f"{base_url.rstrip('/')}/webhooks/max/{bot_id}"
    update_types = creds.get("update_types") or DEFAULT_UPDATE_TYPES
    api_base = (getattr(settings, "MAX_API_BASE", None) or "https://platform-api.max.ru").rstrip("/")
    url = f"{api_base}/subscriptions"
    headers = {"Authorization": token, "Content-Type": "application/json"}
    body = {"url": webhook_url, "update_types": update_types, "secret": secret}
    try:
        r = requests.post(url, json=body, headers=headers, timeout=15)
    except requests.RequestException as e:
        logger.warning("MAX ensure_webhook_subscribed request failed: %s", str(e))
        raise
    if r.status_code >= 400:
        try:
            err = r.json()
            msg = err.get("error") or err.get("message") or r.text[:300]
        except Exception:
            msg = r.text[:300]
        raise ValueError(f"MAX subscription failed: {msg}")


def unsubscribe_webhook(bot_id: int, db: Session) -> None:
    """Удаляет подписку webhook в MAX для бота."""
    conn = db.query(BotChannelConnection).filter(
        BotChannelConnection.bot_id == bot_id,
        BotChannelConnection.channel == "max",
    ).first()
    if not conn:
        return
    creds = _get_max_credentials(conn)
    token = creds.get("token")
    if not token:
        return
    base_url = (getattr(settings, "MAX_WEBHOOK_BASE_URL", None) or "").strip() or "https://YOUR_DOMAIN"
    webhook_url = f"{base_url.rstrip('/')}/webhooks/max/{bot_id}"
    api_base = (getattr(settings, "MAX_API_BASE", None) or "https://platform-api.max.ru").rstrip("/")
    url = f"{api_base}/subscriptions"
    headers = {"Authorization": token, "Content-Type": "application/json"}
    try:
        requests.delete(url, json={"url": webhook_url}, headers=headers, timeout=10)
    except requests.RequestException as e:
        logger.warning("MAX unsubscribe_webhook request failed: %s", str(e))


def get_subscriptions(bot_id: int, db: Session) -> list[dict[str, Any]]:
    """Возвращает список подписок из MAX (без секретов)."""
    conn = db.query(BotChannelConnection).filter(
        BotChannelConnection.bot_id == bot_id,
        BotChannelConnection.channel == "max",
    ).first()
    if not conn:
        return []
    creds = _get_max_credentials(conn)
    token = creds.get("token")
    if not token:
        return []
    api_base = (getattr(settings, "MAX_API_BASE", None) or "https://platform-api.max.ru").rstrip("/")
    url = f"{api_base}/subscriptions"
    headers = {"Authorization": token, "Content-Type": "application/json"}
    try:
        r = requests.get(url, headers=headers, timeout=10)
    except requests.RequestException as e:
        logger.warning("MAX get_subscriptions request failed: %s", str(e))
        return []
    if r.status_code >= 400:
        return []
    try:
        data = r.json()
        if isinstance(data, list):
            return data
        if isinstance(data, dict) and "subscriptions" in data:
            return data["subscriptions"]
        return []
    except Exception:
        return []
