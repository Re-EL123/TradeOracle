"""Process lifecycle: start, stop, persisted safety state reload, heartbeat."""
from __future__ import annotations

import logging
import threading
import time
from datetime import datetime, timezone

log = logging.getLogger("tradeoracle.lifecycle")


class Lifecycle:
    def __init__(self, orchestrator) -> None:
        self.orch = orchestrator
        self.running = False
        self._wake = threading.Event()
        self.started_at = time.time()

    def start(self) -> None:
        self.running = True
        # Reload persisted safety state BEFORE any trading evaluation.
        self.orch.preflight()
        self.orch.start_heartbeat()
        log.info("lifecycle.started mode=%s", self.orch.cfg.trading_mode)

    def wait_next(self, seconds: float) -> None:
        self._wake.wait(timeout=seconds)
        self._wake.clear()

    def stop(self) -> None:
        self.running = False
        self._wake.set()

    def shutdown(self) -> None:
        try:
            self.orch.persist_state(reason="shutdown")
        except Exception:  # noqa: BLE001
            log.exception("failed to persist state on shutdown")
        self.orch.stop_heartbeat()
        log.info(
            "lifecycle.stopped uptime_s=%.1f",
            time.time() - self.started_at,
        )

    @staticmethod
    def utcnow() -> datetime:
        return datetime.now(timezone.utc)
