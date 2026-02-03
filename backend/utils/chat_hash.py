"""
Безопасный хеш чата (152-ФЗ): HMAC-SHA256.
chat_id в БД и логах не хранится и не логируется.
"""
import hmac
import hashlib

from backend.settings import settings


def make_chat_hash(channel: str, chat_id: str) -> str:
    """
    Вычисляет HMAC-SHA256(key=CHAT_HASH_SALT, msg=f"{channel}:{chat_id}").
    Возвращает hex-строку. channel и chat_id не сохраняются.
    """
    key = (settings.CHAT_HASH_SALT or "").encode("utf-8")
    msg = f"{channel}:{chat_id}".encode("utf-8")
    return hmac.new(key, msg, digestmod=hashlib.sha256).hexdigest()
