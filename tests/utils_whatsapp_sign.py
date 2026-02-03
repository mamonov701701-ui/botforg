"""
Общая утилита для тестов WhatsApp Meta Cloud: вычисление подписи X-Hub-Signature-256.
Используется в test_whatsapp_channel.py и test_whatsapp_meta_cloud.py.
"""
import hmac
import hashlib

META_SIGNATURE_HEADER = "X-Hub-Signature-256"


def compute_meta_signature(raw_body: bytes, app_secret: str) -> str:
    """HMAC-SHA256(raw_body, app_secret) -> значение для заголовка: sha256=<hex>."""
    key = app_secret.encode("utf-8")
    hex_digest = hmac.new(key, raw_body, digestmod=hashlib.sha256).hexdigest()
    return f"sha256={hex_digest}"
