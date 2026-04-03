"""Рендер текста исходящего сообщения перед отправкой в канал (ctor_bot_user)."""

from __future__ import annotations

import logging
from typing import Optional

from sqlalchemy.orm import Session

from backend.services.template_render import TemplateRenderService

logger = logging.getLogger(__name__)


def render_outbound_message_text(
    db: Session,
    *,
    bot_user_id: int,
    template_text: str,
    session_id: Optional[int] = None,
) -> str:
    """
    Подставляет {{ переменные }} через TemplateRenderService.render_for_user.
    При missing_keys пишет warning, не бросает исключение.
    Возвращает уже подставленный текст (Markdown/HTML в строке не трогаем — только плейсхолдеры).
    """
    svc = TemplateRenderService(db)
    res = svc.render_for_user(bot_user_id, template_text or "", session_id=session_id)
    if res.missing_keys:
        logger.warning(
            "outbound message render: missing_keys=%s bot_user_id=%s",
            res.missing_keys,
            bot_user_id,
        )
    return res.rendered_text
