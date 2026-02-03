# WhatsApp channel: provider-abstraction (Meta Cloud API, Twilio, 360dialog, etc.)
from backend.channels.whatsapp.providers.base import WhatsAppProvider
from backend.channels.whatsapp.providers.registry import get_whatsapp_provider

__all__ = ["WhatsAppProvider", "get_whatsapp_provider"]
