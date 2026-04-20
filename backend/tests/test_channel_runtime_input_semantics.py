from __future__ import annotations

from backend.channels.base import NormalizedUpdate
from backend.services.channel_runtime import _has_real_user_input


def test_has_real_user_input_for_text():
    upd = NormalizedUpdate(channel="telegram", chat_id="1", text="hello")
    assert _has_real_user_input(upd) is True


def test_has_real_user_input_for_callback():
    upd = NormalizedUpdate(
        channel="telegram",
        chat_id="1",
        text="",
        raw={"callback_query": {"data": "btn_click"}},
    )
    assert _has_real_user_input(upd) is True


def test_has_real_user_input_false_for_noop_event():
    upd = NormalizedUpdate(channel="telegram", chat_id="1", text="", raw={"event": "delivery"})
    assert _has_real_user_input(upd) is False
