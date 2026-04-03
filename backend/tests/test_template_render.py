"""Unit-тесты безопасного рендера шаблонов."""

from backend.services.template_render import (
    TemplateContext,
    extract_placeholder_keys,
    render_template,
)
from backend.services.template_render.service import TemplateRenderService


def test_extract_placeholder_keys_order():
    s = "A {{user_name}} B {{user.first_name}} {{user_name}}"
    assert extract_placeholder_keys(s) == ["user_name", "user.first_name", "user_name"]


def test_render_variables_and_profile():
    ctx = TemplateContext(
        variables={"user_name": "Иван", "phone": "+1"},
        user_profile={"first_name": "Иван"},
        system={"last_input": "да"},
    )
    r = render_template("Привет {{user_name}} / {{user.first_name}} / {{system.last_input}}", ctx)
    assert r.rendered_text == "Привет Иван / Иван / да"
    assert "user_name" in r.used_keys
    assert not r.missing_keys


def test_render_missing_no_crash():
    ctx = TemplateContext(variables={}, user_profile={}, system={})
    r = render_template("X {{unknown}} Y", ctx)
    assert r.rendered_text == "X  Y"
    assert r.missing_keys == ["unknown"]


def test_system_last_input_fallback_to_variables():
    ctx = TemplateContext(variables={"last_input": "из переменной"}, user_profile={}, system={})
    r = render_template("{{system.last_input}}", ctx)
    assert r.rendered_text == "из переменной"


def test_build_context_from_flat():
    ctx = TemplateRenderService.build_context_from_flat(
        {"user_name": "a"},
        last_user_input="привет",
        user_profile={"first_name": "Фёдор"},
    )
    r = render_template("{{user_name}} {{user.first_name}} {{system.last_input}}", ctx)
    assert r.rendered_text == "a Фёдор привет"
