"""
Подсчёт участников команды владельца (Этап 5.4.1).

Источник истины для team_members.used в tariff summary.
UsageCounter.team_members_used не используется для отображения — см.
docs/TARIFFS_STAGE_5_4_1_SUMMARY_SOURCE_CLEANUP.md.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from backend.models.team import TeamMember


def count_team_members_for_owner(db: Session, owner_id: int) -> int:
    """Число приглашённых участников команды (строки TeamMember по owner_id)."""
    return (
        db.query(TeamMember)
        .filter(TeamMember.owner_id == owner_id)
        .count()
    )
