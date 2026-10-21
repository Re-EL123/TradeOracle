"""Technical indicator engine — pure functions + context builder.

Identical implementations are used by backtest, paper and live paths so
results are consistent across modes. Reference-tested in tests/unit.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Sequence

from data.models import Candle


# ---------- primitives (list[float] in, list[float|None] out) ----------

def sma(values: Sequence[float], period: int) -> list[float | None]:
    out: list[float | None] = [None] * len(values)
    if period <= 0 or len(values) < period:
        return out
    window_sum = sum(values[:period])
    out[period - 1] = window_sum / period
    for i in range(period, len(values)):
        window_sum += values[i] - values[i - period]
        out[i] = window_sum / period
    return out


def ema(values: Sequence[float], period: int) -> list[float | None]:
    out: list[float | None] = [None] * len(values)
    if period <= 0 or len(values) < period:
        return out
    k = 2.0 / (period + 1)
    prev = sum(values[:period]) / period
    out[period - 1] = prev
    for i in range(period, len(values)):
        prev = values[i] * k + prev * (1 - k)
        out[i] = prev
    return out


def rsi(values: Sequence[float], period: int = 14) -> list[float | None]:
    out: list[float | None] = [None] * len(values)
    if len(values) <= period:
        return out
    gains = losses = 0.0
    for i in range(1, period + 1):
        d = values[i] - values[i - 1]
        gains += max(d, 0)
        losses += max(-d, 0)
    avg_g, avg_l = gains / period, losses / period
    out[period] = 100.0 if avg_l == 0 else 100 - 100 / (1 + avg_g / avg_l)
    for i in range(period + 1, len(values)):
        d = values[i] - values[i - 1]
        avg_g = (avg_g * (period - 1) + max(d, 0)) / period
        avg_l = (avg_l * (period - 1) + max(-d, 0)) / period
        out[i] = 100.0 if avg_l == 0 else 100 - 100 / (1 + avg_g / avg_l)
    return out


def macd(values: Sequence[float], fast: int = 12, slow: int = 26, signal: int = 9):
    ema_fast = ema(values, fast)
    ema_slow = ema(values, slow)
    line = [
        (f - s) if f is not None and s is not None else None
        for f, s in zip(ema_fast, ema_slow)
    ]
    valid = [(i, v) for i, v in enumerate(line) if v is not None]
    sig: list[float | None] = [None] * len(values)
    if len(valid) >= signal:
        sig_vals = ema([v for _, v in valid], signal)
        for (i, _), sv in zip(valid, sig_vals):
            sig[i] = sv
    hist = [
        (l - s) if l is not None and s is not None else None
        for l, s in zip(line, sig)
    ]
    return line, sig, hist


def atr(candles: Sequence[Candle], period: int = 14) -> list[float | None]:
    out: list[float | None] = [None] * len(candles)
    if len(candles) <= period:
        return out
    trs = _true_range(candles)
    prev = sum(trs[1 : period + 1]) / period
    out[period] = prev
    for i in range(period + 1, len(candles)):
        prev = (prev * (period - 1) + trs[i]) / period
        out[i] = prev
    return out


def _true_range(candles: Sequence[Candle]) -> list[float]:
    trs: list[float] = []
    for i, c in enumerate(candles):
        if i == 0:
            trs.append(c.high - c.low)
        else:
            p = candles[i - 1].close
            trs.append(max(c.high - c.low, abs(c.high - p), abs(c.low - p)))
    return trs


def adx(candles: Sequence[Candle], period: int = 14) -> list[float | None]:
    n = len(candles)
    out: list[float | None] = [None] * n
    if n <= 2 * period:
        return out
    trs = _true_range(candles)
    plus_dm: list[float] = [0.0]
    minus_dm: list[float] = [0.0]
    for i in range(1, n):
        up = candles[i].high - candles[i - 1].high
        dn = candles[i - 1].low - candles[i].low
        plus_dm.append(up if up > dn and up > 0 else 0.0)
        minus_dm.append(dn if dn > up and dn > 0 else 0.0)

    atr_v = sum(trs[1 : period + 1])
    pdm = sum(plus_dm[1 : period + 1])
    mdm = sum(minus_dm[1 : period + 1])
    dx: list[float] = []
    for i in range(period, n):
        if i > period:
            atr_v = atr_v - atr_v / period + trs[i]
            pdm = pdm - pdm / period + plus_dm[i]
            mdm = mdm - mdm / period + minus_dm[i]
        pdi = 100 * pdm / (atr_v or 1e-12)
        mdi = 100 * mdm / (atr_v or 1e-12)
        dx.append(100 * abs(pdi - mdi) / ((pdi + mdi) or 1e-12))

    if len(dx) < period:
        return out
    a = sum(dx[:period]) / period
    out[period + (period - 1)] = a
    for j in range(period, len(dx)):
        a = (a * (period - 1) + dx[j]) / period
        out[period + j] = a
    return out


def bollinger(values: Sequence[float], period: int = 20, mult: float = 2.0):
    mid = sma(values, period)
    upper: list[float | None] = [None] * len(values)
    lower: list[float | None] = [None] * len(values)
    for i in range(len(values)):
        if i + 1 < period or mid[i] is None:
            continue
        window = values[i + 1 - period : i + 1]
        mean = mid[i]
        var = sum((v - mean) ** 2 for v in window) / period
        sd = var ** 0.5
        upper[i] = mean + mult * sd
        lower[i] = mean - mult * sd
    return lower, mid, upper


def rolling_max(values: Sequence[float], period: int) -> list[float | None]:
    return _roll_extreme(values, period, max)


def rolling_min(values: Sequence[float], period: int) -> list[float | None]:
    return _roll_extreme(values, period, min)


def _roll_extreme(values: Sequence[float], period: int, fn) -> list[float | None]:
    out: list[float | None] = [None] * len(values)
    for i in range(period - 1, len(values)):
        out[i] = fn(values[i + 1 - period : i + 1])
    return out


def returns(values: Sequence[float]) -> list[float | None]:
    out: list[float | None] = [None]
    for a, b in zip(values, values[1:]):
        out.append((b - a) / a if a else None)
    return out


# ---------- context ----------

@dataclass
class MarketContext:
    symbol: str
    timeframe: str
    candles: list[Candle]
    close: list[float]
    ema21: list[float | None]
    ema50: list[float | None]
    rsi14: list[float | None]
    atr14: list[float | None]
    adx14: list[float | None]
    macd_line: list[float | None]
    macd_signal: list[float | None]
    macd_hist: list[float | None]
    bb_lower: list[float | None]
    bb_mid: list[float | None]
    bb_upper: list[float | None]
    structure: list = field(default_factory=list)
    regime: object = None
    higher_tf_trend: object = None
    quote: object = None

    @property
    def i(self) -> int:
        return len(self.candles) - 1

    @property
    def last(self) -> Candle:
        return self.candles[-1]


class IndicatorEngine:
    def build_context(self, symbol: str, timeframe: str, candles: list[Candle]) -> MarketContext:
        close = [c.close for c in candles]
        macd_l, macd_s, macd_h = macd(close)
        bb_l, bb_m, bb_u = bollinger(close)
        return MarketContext(
            symbol=symbol,
            timeframe=timeframe,
            candles=candles,
            close=close,
            ema21=ema(close, 21),
            ema50=ema(close, 50),
            rsi14=rsi(close, 14),
            atr14=atr(candles, 14),
            adx14=adx(candles, 14),
            macd_line=macd_l,
            macd_signal=macd_s,
            macd_hist=macd_h,
            bb_lower=bb_l,
            bb_mid=bb_m,
            bb_upper=bb_u,
        )
