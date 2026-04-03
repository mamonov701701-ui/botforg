"""
Единый безопасный рендер шаблонов {{ user_name }}, {{ user.first_name }}, {{ system.last_input }}.

Не использует eval и сторонние шаблонизаторы с исполняемой логикой.
Для контекста из БД — TemplateRenderService; для предпросмотра/legacy —
TemplateRenderService.build_context_from_flat + render_template.
"""

from backend.services.template_render.engine import render_template
from backend.services.template_render.placeholders import (
    PLACEHOLDER_PATTERN,
    extract_placeholder_keys,
)
from backend.services.template_render.service import TemplateRenderService
from backend.services.template_render.types import TemplateContext, TemplateRenderResult

__all__ = [
    "TemplateRenderService",
    "TemplateContext",
    "TemplateRenderResult",
    "render_template",
    "extract_placeholder_keys",
    "PLACEHOLDER_PATTERN",
]
