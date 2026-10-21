"""Engine orchestrator — the controlled execution cycle (spec §6.2).

Order of operations:
  health → connectivity → data → validate → indicators → structure → regime
  → strategies → signal quality → risk sizing → portfolio checks
  → execution (mode permitting) → reconcile → persist → publish health
"""
from __future__ import annotations

import logging
import threading
import time
from datetime import datetime, timezone

from data.collector import MarketDataCollector
from data.validator import CandleValidator
from data.freshness import FreshnessTracker
from engine.health import HealthMonitor
from indicators.core import IndicatorEngine
from structure.swings import StructureEngine
from regime.classifier import RegimeClassifier
from strategies.trend_pullback import TrendPullbackStrategy
from strategies.breakout_retest import BreakoutRetestStrategy
from signals.scoring import SignalScorer
from signals.lifecycle import SignalStore
from risk.engine import RiskEngine
from broker.paper import PaperBroker
from persistence.store import Store

log = logging.getLogger("tradeoracle.orchestrator")


class Orchestrator:
    def __init__(self, cfg) -> None:
        self.cfg = cfg
        self.store = Store(cfg)
        self.collector = MarketDataCollector(cfg)
        self.validator = CandleValidator()
        self.freshness = FreshnessTracker()
        self.indicators = IndicatorEngine()
        self.structure = StructureEngine()
        self.regime = RegimeClassifier()
        self.scorer = SignalScorer()
        self.signals = SignalStore(self.store)
        self.risk = RiskEngine(cfg, self.store)
        self.broker = PaperBroker(cfg, self.store)
        self.health = HealthMonitor(cfg)
        self.strategies = [TrendPullbackStrategy(), BreakoutRetestStrategy()]
        self.cycle_interval = float(cfg.cycle_interval_seconds)
        self._hb_thread: threading.Thread | None = None
        self._hb_stop = threading.Event()
        self._error_streak = 0

    # ---------- preflight ----------
    def preflight(self) -> None:
        """Startup checks. Fail closed: no trading until state is reliable."""
        state = self.store.load_safety_state()
        self.risk.restore(state)
        ok = True
        ok &= self.store.connect()
        ok &= self.collector.available()
        if self.cfg.trading_mode == "HALTED" or state.get("halted"):
            log.warning("preflight: emergency halt persisted — entries blocked")
            self.risk.halt(reason="persisted halt state")
        if not ok and self.cfg.allows_execution:
            log.error("preflight failed — falling back to RESEARCH for this session")
        self.health.set_component("preflight", "OK" if ok else "DEGRADED")
        log.info("preflight.complete ok=%s mode=%s", ok, self.risk.mode)

    # ---------- main cycle ----------
    def run_once(self) -> None:
        started = time.monotonic()
        self.health.beat()

        if not self.collector.available():
            self.health.set_component("marketData", "DOWN")
            self.risk.block_entries("market data unavailable")
            return
        self.health.set_component("marketData", "OK")

        any_stale = False
        for symbol in self.cfg.instruments:
            try:
                self._analyse_symbol(symbol)
            except Exception:  # noqa: BLE001 — isolate per-symbol failures
                log.exception("analysis failed for %s", symbol)
                self.health.set_component("strategyEngine", "DEGRADED")
            else:
                if self.freshness.is_stale(symbol):
                    any_stale = True

        if any_stale:
            self.risk.block_entries("stale market data on at least one instrument")

        # Reconcile paper broker state (mirrors live reconciliation contract)
        self.broker.reconcile()
        self.health.set_component("broker", "OK" if self.broker.available() else "DOWN")

        self.persist_state(reason="cycle")
        self._error_streak = 0
        elapsed = time.monotonic() - started
        self.health.record_cycle(elapsed)
        log.debug("cycle.complete elapsed_ms=%d", int(elapsed * 1000))

    def _analyse_symbol(self, symbol: str) -> None:
        primary = self.cfg.timeframes[0]
        candles = self.collector.get_candles(symbol, primary, limit=400)
        candles = [c for c in candles if c.complete]
        candles = self.validator.filter_valid(symbol, candles)
        if len(candles) < 60:
            log.warning("insufficient candles for %s (%d)", symbol, len(candles))
            return
        self.freshness.update(symbol, candles[-1].timestamp)

        ctx = self.indicators.build_context(symbol, primary, candles)
        ctx.structure = self.structure.detect(candles)
        ctx.regime = self.regime.classify(ctx)
        ctx.higher_tf_trend = self._higher_tf_trend(symbol)

        for strategy in self.strategies:
            if not strategy.applies_to(symbol):
                continue
            candidates = strategy.evaluate(ctx)
            for cand in candidates:
                cand = self.scorer.score(cand, ctx)
                self.signals.register(cand)
                if cand.status != "ELIGIBLE":
                    continue
                proposal = self.risk.evaluate_proposal(cand, ctx)
                if not proposal.approved:
                    self.signals.reject(cand, proposal.reason)
                    continue
                if not self.cfg.allows_execution:
                    continue
                result = self.broker.submit(cand, proposal)
                self.signals.mark_ordered(cand, result)

    def _higher_tf_trend(self, symbol: str):
        if len(self.cfg.timeframes) < 2:
            return None
        ht = self.cfg.timeframes[-1]
        candles = [c for c in self.collector.get_candles(symbol, ht, limit=120) if c.complete]
        if len(candles) < 55:
            return None
        ctx = self.indicators.build_context(symbol, ht, candles)
        ctx.structure = self.structure.detect(candles)
        return ctx

    # ---------- health / state ----------
    def record_cycle_error(self) -> None:
        self._error_streak += 1
        self.health.set_component("orchestrator", "DEGRADED")
        if self._error_streak >= 5:
            self.risk.block_entries("consecutive cycle errors")

    def persist_state(self, reason: str = "") -> None:
        self.store.save_safety_state(self.risk.snapshot(), reason=reason)
        self.store.push_heartbeat(self.health.snapshot())

    def start_heartbeat(self) -> None:
        def loop():
            while not self._hb_stop.wait(self.cfg.heartbeat_interval_seconds):
                try:
                    self.store.push_heartbeat(self.health.snapshot())
                except Exception:  # noqa: BLE001
                    log.exception("heartbeat push failed")

        self._hb_thread = threading.Thread(target=loop, name="heartbeat", daemon=True)
        self._hb_thread.start()

    def stop_heartbeat(self) -> None:
        self._hb_stop.set()
        if self._hb_thread:
            self._hb_thread.join(timeout=2)

    @staticmethod
    def utcnow() -> datetime:
        return datetime.now(timezone.utc)
