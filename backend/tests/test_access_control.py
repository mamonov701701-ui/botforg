"""
Tests for access control: viewer cannot publish, owner/user can.
"""
import pytest
from unittest.mock import MagicMock, patch

from backend.utils.bot_access import check_bot_edit_permission
from backend.models.bot import Bot


def _active_bot(owner_id: int):
    bot = MagicMock(spec=Bot)
    bot.owner_id = owner_id
    bot.is_suspended = False
    return bot


def test_owner_can_edit():
    """Bot owner has edit permission."""
    bot = _active_bot(1)
    db = MagicMock()
    assert check_bot_edit_permission(bot, 1, db) is True


def test_viewer_cannot_edit():
    """Team member with viewer role cannot edit."""
    bot = _active_bot(10)
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = MagicMock(role="viewer")
    assert check_bot_edit_permission(bot, 5, db) is False


def test_developer_can_edit():
    """Team member with developer role can edit."""
    bot = _active_bot(10)
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = MagicMock(role="developer")
    assert check_bot_edit_permission(bot, 5, db) is True


def test_admin_can_edit():
    """Team member with admin role can edit."""
    bot = _active_bot(10)
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = MagicMock(role="admin")
    assert check_bot_edit_permission(bot, 5, db) is True


def test_non_member_cannot_edit():
    """User not in team cannot edit."""
    bot = _active_bot(10)
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None
    assert check_bot_edit_permission(bot, 5, db) is False


def test_suspended_owner_cannot_edit():
    bot = _active_bot(1)
    bot.is_suspended = True
    bot.suspension_type = "permanent"
    assert check_bot_edit_permission(bot, 1, MagicMock()) is False
