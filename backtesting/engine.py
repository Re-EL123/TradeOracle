"""Backtest engine facade — load data, run simulator, validate, report."""
from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed

from backtesting.simulator import Simulator, SimConfig
from backtesting.validation import validate_run
from backtesting.reports import build_report

log = logging.getLogger("tradeoracle.backtest")


class BacktestEngine:
    def __init__(self, collector, max_workers: int = 1) -> None:
        self.collector = collector
        self.max_workers = max(1, max_workers)

    def run(self, strategy, cfg: SimConfig, limit: int = 1500) -> dict:
        candles = [c for c in self.collector.get_candles(cfg.symbol, cfg.timeframe, limit=limit) if c.complete]
        sim = Simulator(cfg)
        metrics, trades = sim.run(strategy, candles)
        report = validate_run(trades, candles)
        if not report.ok:
            log.warning("integrity issues: %s", report.issues)
        out = build_report(
            strategy, cfg, metrics, trades,
            data_source=getattr(self.collector.provider, "source", "unknown"),
            period_start=candles[0].timestamp if candles else None,
            period_end=candles[-1].timestamp if candles else None,
        )
        out["integrity"] = {"ok": report.ok, "issues": report.issues}
        return out

    def run_many(self, jobs: list[tuple[object, SimConfig]]) -> list[dict]:
        results: list[dict] = []
        with ThreadPoolExecutor(max_workers=self.max_workers) as pool:
            futs = {pool.submit(self.run, s, c): (s, c) for s, c in jobs}
            for fut in as_completed(futs):
                try:
                    results.append(fut.result())
                except Exception:  # noqa: BLE001
                    log.exception("backtest job failed")
        return results
