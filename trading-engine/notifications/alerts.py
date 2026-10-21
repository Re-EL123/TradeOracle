"""Alert dispatch — console now; email/webhook channels pluggable (§15.3)."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone

log = logging.getLogger("tradeoracle.alerts")


@dataclass
class Alert:
    level: str  # INFO | WARNING | CRITICAL
    message: str
    at: str


class AlertDispatcher:
    def __init__(self, store=None) -> None:
        self.store = store

    def emit(self, level: str, message: str) -> Alert:
        alert = Alert(level=level, message=message, at=datetime.now(timezone.utc).isoformat())
        log.log(
            {"INFO": logging.INFO, "WARNING": logging.WARNING, "CRITICAL": logging.CRITICAL}.get(level, logging.INFO),
            "alert.%s %s",
            level,
            message,
        )
        if self.store is not None:
            self.store._insert(
                "notifications",
                {"level": level, "message": message, "at": alert.at, "delivered": ["log"]},
            )
        return alert
