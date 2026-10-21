"""Scheduling helpers — timeframe-aware next-run computation (candle-close driven)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

TF_SECONDS = {
    "M1": 60,
    "M5": 300,
    "M15": 900,
    "M30": 1800,
    "H1": 3600,
    "H4": 14400,
    "D1": 86400,
}


def next_candle_close(timeframe: str, now: datetime | None = None) -> datetime:
    """Next UTC close boundary for the timeframe. Handles DST-agnostic UTC math."""
    now = now or datetime.now(timezone.utc)
    step = TF_SECONDS[timeframe.upper()]
    epoch = int(now.timestamp())
    next_close = ((epoch // step) + 1) * step
    return datetime.fromtimestamp(next_close, tz=timezone.utc)


def seconds_until_close(timeframe: str, now: datetime | None = None) -> float:
    now = now or datetime.now(timezone.utc)
    return max(0.0, (next_candle_close(timeframe, now) - now).total_seconds())


def completed_candle_start(timeframe: str, now: datetime | None = None) -> datetime:
    """Start time of the most recently CLOSED candle. Never returns the forming candle."""
    now = now or datetime.now(timezone.utc)
    step = TF_SECONDS[timeframe.upper()]
    epoch = int(now.timestamp())
    current_open = (epoch // step) * step
    return datetime.fromtimestamp(current_open - step, tz=timezone.utc)


def interval(timeframe: str) -> timedelta:
    return timedelta(seconds=TF_SECONDS[timeframe.upper()])
