"""TradeOracle trading engine — entry point.

Runs the persistent worker loop: market data → analysis → strategies →
signals → risk → (optional) execution → persistence → health.

Safe-by-default: starts in RESEARCH/PAPER, never LIVE unless explicitly
configured AND preflight checks pass.
"""
from __future__ import annotations

import signal
import sys
import time

from config import load_config
from logging_config import setup_logging
from engine.orchestrator import Orchestrator
from engine.lifecycle import Lifecycle


def main() -> int:
    cfg = load_config()
    log = setup_logging(cfg.log_level)
    log.info(
        "tradeoracle.engine.start mode=%s env=%s instruments=%s",
        cfg.trading_mode, cfg.env, ",".join(cfg.instruments),
    )

    orch = Orchestrator(cfg)
    life = Lifecycle(orch)

    def _shutdown(signum, _frame):
        log.info("signal %s received — graceful shutdown", signum)
        life.stop()

    signal.signal(signal.SIGTERM, _shutdown)
    signal.signal(signal.SIGINT, _shutdown)

    life.start()
    try:
        while life.running:
            cycle_started = time.monotonic()
            try:
                orch.run_once()
            except Exception:  # noqa: BLE001 — worker must survive cycle failures
                log.exception("unhandled error in analysis cycle")
                orch.record_cycle_error()
            elapsed = time.monotonic() - cycle_started
            life.wait_next(max(0.5, orch.cycle_interval - elapsed))
    finally:
        life.shutdown()
        log.info("tradeoracle.engine.stopped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
