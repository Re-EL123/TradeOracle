"""Data freshness tracking — stale feeds block new entries."""
from __future__ import annotations

import time
from datetime import datetime, timezone


class FreshnessTracker:
    def __init__(self, max_age_seconds: float = 90.0) -> None:
        self.max_age = max_age_seconds
        self._last: dict[str, datetime] = {}
        self._wall: dict[str, float] = {}

    def update(self, symbol: str, candle_time: datetime) -> None:
        self._last[symbol] = candle_time
        self._wall[symbol] = time.time()

    def is_stale(self, symbol: str) -> bool:
        wall = self._wall.get(symbol)
        if wall is None:
            return True
        return (time.time() - wall) > self.max_age

    def age_seconds(self, symbol: str) -> float | None:
        wall = self._wall.get(symbol)
        return None if wall is None else time.time() - wall

    def last_candle_time(self, symbol: str) -> datetime | None:
        return self._last.get(symbol)

    @staticmethod
    def now() -> datetime:
        return datetime.now(timezone.utc)
