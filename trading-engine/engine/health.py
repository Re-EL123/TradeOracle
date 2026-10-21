"""Health monitoring: heartbeat snapshot, component states, cycle metrics."""
from __future__ import annotations

import time
from datetime import datetime, timezone


class HealthMonitor:
    def __init__(self, cfg) -> None:
        self.cfg = cfg
        self.started_at = time.time()
        self._components: dict[str, str] = {
            "oracleWorker": "OK",
            "marketData": "UNKNOWN",
            "indicators": "UNKNOWN",
            "strategyEngine": "UNKNOWN",
            "riskEngine": "OK",
            "execution": "STANDBY",
            "database": "UNKNOWN",
            "broker": "UNKNOWN",
            "backtestWorker": "IDLE",
            "alerts": "OK",
        }
        self._last_beat = 0.0
        self._last_cycle = 0.0
        self._cycle_ms = 0
        self._cycle_count = 0

    def beat(self) -> None:
        self._last_beat = time.time()
        self._components["oracleWorker"] = "OK"

    def set_component(self, name: str, status: str) -> None:
        self._components[name] = status

    def record_cycle(self, elapsed_s: float) -> None:
        self._last_cycle = time.time()
        self._cycle_count += 1
        self._cycle_ms = int(elapsed_s * 1000)

    def snapshot(self) -> dict:
        return {
            "status": "RUNNING" if self._components["oracleWorker"] == "OK" else "DEGRADED",
            "mode": self.cfg.trading_mode,
            "lastHeartbeat": (
                datetime.fromtimestamp(self._last_beat, tz=timezone.utc).isoformat()
                if self._last_beat
                else None
            ),
            "lastAnalysisCycle": (
                datetime.fromtimestamp(self._last_cycle, tz=timezone.utc).isoformat()
                if self._last_cycle
                else None
            ),
            "uptimeSeconds": int(time.time() - self.started_at),
            "cycleCount": self._cycle_count,
            "cycleDurationMs": self._cycle_ms,
            "components": dict(self._components),
            "pid": None,
        }
