"""
Tests for access control: viewer cannot publish, owner/user can.
"""
import pytest
from unittest.mock import MagicMock, patch

from backend.utils.bot_access import check_bot_edit_permission
from backend.models.bot import Bot


def test_owner_can_edit():
    """Bot owner has edit permission."""
    bot = MagicMock(spec=Bot)
    bot.owner_id = 1
    db = MagicMock()
    assert check_bot_edit_permission(bot, 1, db) is True


def test_viewer_cannot_edit():
    """Team member with viewer role cannot edit."""
    bot = MagicMock(spec=Bot)
    bot.owner_id = 10
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = MagicMock(role="viewer")
    assert check_bot_edit_permission(bot, 5, db) is False


def test_developer_can_edit():
    """Team member with developer role can edit."""
    bot = MagicMock(spec=Bot)
    bot.owner_id = 10
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = MagicMock(role="developer")
    assert check_bot_edit_permission(bot, 5, db) is True


def test_admin_can_edit():
    """Team member with admin role can edit."""
    bot = MagicMock(spec=Bot)
    bot.owner_id = 10
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = MagicMock(role="admin")
    assert check_bot_edit_permission(bot, 5, db) is True


def test_non_member_cannot_edit():
    """User not in team cannot edit."""
    bot = MagicMock(spec=Bot)
    bot.owner_id = 10
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None
    assert check_bot_edit_permission(bot, 5, db) is False
