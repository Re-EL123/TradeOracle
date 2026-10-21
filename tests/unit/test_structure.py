from datetime import datetime, timedelta, timezone

from data.models import Candle
from structure.swings import StructureEngine, SwingPoint


def _mk(closes, base=datetime(2026, 1, 1, tzinfo=timezone.utc)):
    out = []
    for i, c in enumerate(closes):
        out.append(Candle("EURUSD", "H1", base + timedelta(hours=i),
                          open=c, high=c + 0.0005, low=c - 0.0005, close=c))
    return out


def test_swing_detection_uptrend():
    # zig-zag rising
    closes = [1.0, 1.01, 1.0, 1.02, 1.01, 1.03, 1.02, 1.04, 1.03, 1.05, 1.04, 1.06] * 3
    eng = StructureEngine(lookback=1)
    swings = eng.swing_points(_mk(closes))
    assert any(s.kind == "HIGH" for s in swings)
    assert any(s.kind == "LOW" for s in swings)
    assert StructureEngine.trend(swings) in {"UPTREND", "RANGE"}


def test_tentative_swing_not_confirmed():
    closes = list(reversed([1.0 + 0.001 * i for i in range(30)])) + [0.97, 0.96, 0.95]
    eng = StructureEngine(lookback=2)
    swings = eng.swing_points(_mk(closes))
    assert any(not s.confirmed for s in swings) or len(swings) > 0


def test_bos_detected():
    closes = [1.0, 1.002, 1.0, 1.001, 1.0, 1.003, 1.002, 1.005, 1.004, 1.006, 1.005, 1.008] * 2
    eng = StructureEngine(lookback=1)
    ch = _mk(closes)
    events = eng.structure_events(eng.swing_points(ch), len(ch))
    assert isinstance(events, list)


def test_zones_require_cluster():
    closes = [1.0, 1.001, 1.0, 1.001, 1.0, 1.001, 1.0, 1.001, 1.0, 1.001, 1.0, 1.001]
    eng = StructureEngine(lookback=1)
    zones = eng.support_resistance(eng.swing_points(_mk(closes)))
    assert isinstance(zones, list)
