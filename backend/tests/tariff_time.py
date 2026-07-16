"""
Deterministic clock helpers for tariff/webhook tests (stage 5.6.1).

Production tariff code reads wall clock only via
``datetime.now(timezone.utc)`` in ``backend.services.tariff_limits``.
Tests that seed June-2026 periods and hit HTTP/service paths without
an explicit ``at=`` must freeze that clock.
"""
from __future__ import annotations

from datetime import datetime, timezone

import pytest

# Fixed "now" — independent of the real calendar month.
FIXED_TARIFF_NOW = datetime(2026, 6, 15, 12, 0, 0, tzinfo=timezone.utc)


def utc(*args, **kwargs) -> datetime:
    return datetime(*args, tzinfo=timezone.utc, **kwargs)


def month_period(at: datetime | None = None) -> tuple[datetime, datetime]:
    """Calendar month [start, end) for ``at`` (defaults to FIXED_TARIFF_NOW)."""
    at = at or FIXED_TARIFF_NOW
    start = at.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if at.month == 12:
        end = start.replace(year=at.year + 1, month=1)
    else:
        end = start.replace(month=at.month + 1)
    return start, end


@pytest.fixture
def freeze_tariff_now(monkeypatch: pytest.MonkeyPatch) -> datetime:
    """Freeze ``datetime.now`` inside ``tariff_limits`` (sole wall-clock source)."""
    import backend.services.tariff_limits as tariff_limits

    fixed = FIXED_TARIFF_NOW
    real_datetime = tariff_limits.datetime

    class FrozenDateTime(real_datetime):  # type: ignore[misc,valid-type]
        @classmethod
        def now(cls, tz=None):
            if tz is None:
                return fixed.replace(tzinfo=None)
            return fixed.astimezone(tz)

    monkeypatch.setattr(tariff_limits, "datetime", FrozenDateTime)
    return fixed
