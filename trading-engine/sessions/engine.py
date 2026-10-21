"""Forex session engine (§7.7) — DST-aware via zoneinfo, not fixed UTC offsets."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time, timezone
from zoneinfo import ZoneInfo

LONDON_TZ = ZoneInfo("Europe/London")
NY_TZ = ZoneInfo("America/New_York")
TOKYO_TZ = ZoneInfo("Asia/Tokyo")


@dataclass(frozen=True)
class SessionWindow:
    name: str
    start_local: time
    end_local: time
    tz: ZoneInfo

    def active(self, now_utc: datetime) -> bool:
        local = now_utc.astimezone(self.tz)
        t = local.time()
        if self.start_local <= self.end_local:
            return self.start_local <= t < self.end_local
        return t >= self.start_local or t < self.end_local  # overnight window


SESSIONS = (
    SessionWindow("TOKYO", time(0, 0), time(9, 0), TOKYO_TZ),
    SessionWindow("LONDON", time(8, 0), time(17, 0), LONDON_TZ),
    SessionWindow("NEW_YORK", time(8, 0), time(17, 0), NY_TZ),
)


class SessionEngine:
    def active_sessions(self, now: datetime | None = None) -> list[str]:
        now = now or datetime.now(timezone.utc)
        return [s.name for s in SESSIONS if s.active(now)]

    def is_overlap(self, now: datetime | None = None) -> bool:
        return len(self.active_sessions(now)) >= 2

    def in_trading_window(self, now: datetime | None = None, allowed: tuple[str, ...] = ("LONDON", "NEW_YORK")) -> bool:
        return bool(set(self.active_sessions(now)) & set(allowed))
