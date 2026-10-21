import math

from indicators.core import ema, sma, rsi, atr, macd
from data.models import Candle
from datetime import datetime, timedelta, timezone


def test_sma_constant():
    out = sma([2.0] * 10, 5)
    assert out[3] is None
    assert out[4] == 2.0
    assert out[-1] == 2.0


def test_sma_values():
    out = sma([1, 2, 3, 4, 5], 3)
    assert out[2] == 2.0
    assert out[4] == 4.0


def test_ema_matches_reference():
    # EMA period 3 over [1,2,3,4,5], k=2/(3+1)=0.5
    # seed SMA=2, then 4*0.5+2*0.5=3.0, then 5*0.5+3.0*0.5=4.0
    out = ema([1, 2, 3, 4, 5], 3)
    assert out[2] == 2.0
    assert math.isclose(out[3], 3.0)
    assert math.isclose(out[4], 4.0)


def test_rsi_all_gains_is_100():
    vals = list(range(1, 40))
    out = rsi(vals, 14)
    assert out[-1] is not None
    assert out[-1] > 90


def test_rsi_bounds():
    import random

    rng = random.Random(1)
    vals = [100.0]
    for _ in range(200):
        vals.append(vals[-1] * (1 + rng.uniform(-0.02, 0.02)))
    out = [v for v in rsi(vals, 14) if v is not None]
    assert all(0 <= v <= 100 for v in out)


def _candles(closes):
    out = []
    base = datetime(2026, 1, 1, tzinfo=timezone.utc)
    for i, c in enumerate(closes):
        out.append(
            Candle("EURUSD", "H1", base + timedelta(hours=i),
                   open=c, high=c + 0.001, low=c - 0.001, close=c, volume=100)
        )
    return out


def test_atr_positive():
    ch = _candles([1 + i * 0.001 + (0.002 if i % 3 == 0 else 0) for i in range(40)])
    out = atr(ch, 14)
    assert out[-1] is not None and out[-1] > 0


def test_macd_shapes():
    vals = [1 + 0.01 * i + (0.1 if i % 7 == 0 else 0) for i in range(80)]
    line, sig, hist = macd(vals)
    assert len(line) == len(sig) == len(hist) == 80
    assert any(v is not None for v in line)
