"""
Реестр провайдеров WhatsApp: получение по имени (meta_cloud, twilio, dialog360).
"""
from backend.channels.whatsapp.providers.base import WhatsAppProvider
from backend.channels.whatsapp.providers.meta_cloud import MetaCloudProvider
from backend.channels.whatsapp.providers.twilio import TwilioProvider
from backend.channels.whatsapp.providers.dialog360 import Dialog360Provider

_providers: dict[str, WhatsAppProvider] = {
    "meta_cloud": MetaCloudProvider(),
    "twilio": TwilioProvider(),
    "dialog360": Dialog360Provider(),
}


def get_whatsapp_provider(name: str) -> WhatsAppProvider | None:
    """Возвращает провайдера по имени или None."""
    return _providers.get((name or "").strip().lower())


def get_whatsapp_provider_names() -> list[str]:
    """Список зарегистрированных имён провайдеров."""
    return list(_providers.keys())
