# Channel connectors: unified interface for multiple channels (MAX, WhatsApp, Telegram, etc.)
from backend.channels.registry import get_adapter, register_adapter
from backend.channels.max_adapter import MaxAdapter
from backend.channels.whatsapp_adapter import WhatsAppAdapter
from backend.channels.telegram_adapter import TelegramAdapter

register_adapter("max", MaxAdapter())
register_adapter("whatsapp", WhatsAppAdapter())
register_adapter("telegram", TelegramAdapter())
