from types import SimpleNamespace

from backend.services.message_template.diagnostics import diagnose_message_template


def _def(key: str, *, is_system: bool = False):
    return SimpleNamespace(key=key, is_system=is_system)


def test_diagnose_known_flat_and_system_ns():
    defs = [_def("user_name"), _def("last_input", is_system=True)]
    d = diagnose_message_template("Hi {{user_name}} / {{system.last_input}}", defs)
    assert "user_name" in d.placeholder_keys
    assert d.unknown_keys == []


def test_diagnose_unknown_placeholder():
    defs = [_def("a")]
    d = diagnose_message_template("{{a}} {{not_a_real_key}}", defs)
    assert "not_a_real_key" in d.unknown_keys


def test_diagnose_user_profile():
    defs = []
    d = diagnose_message_template("{{user.first_name}}", defs)
    assert d.unknown_keys == []
