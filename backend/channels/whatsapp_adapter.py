"""
Адаптер канала WhatsApp с provider-abstraction.
Выбирает провайдера по credentials_json["provider"] (meta_cloud, twilio, dialog360).
chat_id в БД не хранится — используется make_chat_hash("whatsapp", chat_id).
"""
import logging
from typing import Any

from backend.channels.base import ChannelAdapter, MessageResult, NormalizedUpdate
from backend.channels.whatsapp.providers.registry import get_whatsapp_provider
from backend.settings import settings
from backend.utils.chat_hash import make_chat_hash

logger = logging.getLogger(__name__)

# Провайдер по умолчанию для normalize_incoming, когда вызов идёт без credentials (fallback)
_DEFAULT_PROVIDER = "meta_cloud"


class WhatsAppAdapter(ChannelAdapter):
    """Адаптер WhatsApp: делегирует в провайдера из credentials.provider."""

    def _get_provider(self, credentials: dict[str, Any] | None) -> Any:
        """Возвращает провайдера по credentials["provider"] или дефолтного."""
        name = (credentials or {}).get("provider") or _DEFAULT_PROVIDER
        provider = get_whatsapp_provider(name)
        return provider or get_whatsapp_provider(_DEFAULT_PROVIDER)

    def normalize_incoming(self, payload: dict[str, Any]) -> NormalizedUpdate:
        """Нормализация через провайдера по умолчанию (meta_cloud). chat_hash добавляется в webhook."""
        provider = get_whatsapp_provider(_DEFAULT_PROVIDER)
        if not provider:
            return NormalizedUpdate(
                channel="whatsapp",
                chat_id=None,
                chat_hash=None,
                text=None,
                raw=dict(payload),
            )
        out = provider.normalize_incoming(payload)
        chat_hash = None
        if out.chat_id and (settings.CHAT_HASH_SALT or "").strip():
            chat_hash = make_chat_hash("whatsapp", out.chat_id)
        else:
            chat_hash = out.chat_hash
        return NormalizedUpdate(
            channel=out.channel,
            chat_id=out.chat_id,
            chat_hash=chat_hash,
            user_id=out.user_id,
            text=out.text,
            buttons=out.buttons,
            media_url=out.media_url,
            raw=out.raw,
        )

    def send_text(
        self,
        chat_id: str,
        text: str,
        credentials: dict[str, Any],
        buttons: list[dict[str, Any]] | None = None,
    ) -> MessageResult:
        """Делегирует в провайдера из credentials.provider."""
        provider = self._get_provider(credentials)
        if not provider:
            return MessageResult(success=False, error="Unknown WhatsApp provider")
        return provider.send_text(chat_id, text, credentials, buttons)

    def send_media(
        self,
        chat_id: str,
        media_url: str,
        credentials: dict[str, Any],
        caption: str | None = None,
    ) -> MessageResult:
        """Делегирует в провайдера из credentials.provider."""
        provider = self._get_provider(credentials)
        if not provider:
            return MessageResult(success=False, error="Unknown WhatsApp provider")
        return provider.send_media(chat_id, media_url, credentials, caption)
