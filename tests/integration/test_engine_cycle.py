"""End-to-end: orchestrator runs cycles in RESEARCH/PAPER with synthetic data,
persists safety state, and the paper broker fills + reconciles."""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "trading-engine"))

os.environ.setdefault("TRADING_MODE", "PAPER")
os.environ.setdefault("MARKET_DATA_PROVIDER", "synthetic")
os.environ.setdefault("ENGINE_CYCLE_INTERVAL_SECONDS", "1")

from config import load_config  # noqa: E402
from engine.orchestrator import Orchestrator  # noqa: E402
from broker.paper import PaperBroker  # noqa: E402
from persistence.store import Store  # noqa: E402


def test_orchestrator_cycle_smoke(tmp_path):
    os.environ["RUNTIME_DIR"] = str(tmp_path)
    cfg = load_config()
    # redirect runtime via object replace (frozen dataclass → use object.__setattr__)
    object.__setattr__(cfg, "runtime_dir", tmp_path)
    orch = Orchestrator(cfg)
    orch.preflight()
    orch.run_once()
    hb = orch.store.last_heartbeat() or orch.health.snapshot()
    assert hb is not None
    snap = orch.store.load_safety_state()
    assert "halted" in snap


def test_safety_state_survives_restart(tmp_path):
    cfg = load_config()
    object.__setattr__(cfg, "runtime_dir", tmp_path)
    store = Store(cfg)
    store.connect()
    from risk.engine import RiskEngine

    r1 = RiskEngine(cfg, store)
    r1.halt(reason="test halt")
    store.save_safety_state(r1.snapshot(), reason="test")

    r2 = RiskEngine(cfg, store)
    r2.restore(store.load_safety_state())
    assert r2.halted is True
    assert r2.halt_reason == "test halt"


def test_paper_broker_fill_and_duplicate(tmp_path):
    cfg = load_config()
    object.__setattr__(cfg, "runtime_dir", tmp_path)
    store = Store(cfg)
    store.connect()
    broker = PaperBroker(cfg, store)

    from strategies.base import SignalCandidate
    from risk.engine import RiskDecision
    from datetime import datetime, timezone

    cand = SignalCandidate(
        symbol="EURUSD", timeframe="H1", direction="LONG",
        strategy="t", strategy_version="1",
        entry=1.164, stop_loss=1.160, take_profit=1.172,
        timestamp=datetime.now(timezone.utc),
    )
    decision = RiskDecision(approved=True, volume=0.10, risk_amount=40)
    r1 = broker.submit(cand, decision)
    assert r1.accepted
    r2 = broker.submit(cand, decision)
    assert not r2.accepted  # duplicate suppressed
    positions = store.open_positions()
    assert len(positions) == 1
    broker.reconcile()
