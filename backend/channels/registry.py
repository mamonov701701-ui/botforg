"""
Реестр адаптеров каналов: регистрация и получение по имени.
"""
from typing import Any

from backend.channels.base import ChannelAdapter

_adapters: dict[str, ChannelAdapter] = {}


def register_adapter(name: str, adapter: ChannelAdapter) -> None:
    """Регистрирует адаптер канала под именем (max, whatsapp, telegram, ...)."""
    _adapters[name.lower()] = adapter


def get_adapter(name: str) -> ChannelAdapter | None:
    """Возвращает адаптер по имени канала или None."""
    return _adapters.get(name.lower())
