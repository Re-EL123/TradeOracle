"""Strategy C — Breakout & retest (§8.2).

Rules:
  * Consolidation: last 20 candles form a range with width < 2.5 × ATR
  * Breakout: latest close beyond the range extreme by ≥ 0.25 × ATR
  * Retest: price returned to the broken level within 3 candles
  * Spread and volatility filters; invalidation beyond the retest extreme
"""
from __future__ import annotations

from strategies.base import SignalCandidate, Strategy
from sessions.engine import SessionEngine


class BreakoutRetestStrategy(Strategy):
    name = "breakout_retest"
    version = "1.0.4"

    def __init__(self, instruments: tuple[str, ...] | None = ("EURUSD", "GBPUSD")) -> None:
        super().__init__(instruments)
        self.sessions = SessionEngine()

    def evaluate(self, ctx) -> list[SignalCandidate]:
        i = ctx.i
        if i < 25:
            return []
        if not self.sessions.in_trading_window():
            return []

        atr_v = ctx.atr14[i]
        if atr_v is None or atr_v <= 0:
            return []

        window = ctx.candles[i - 19 : i + 1]
        hi = max(c.high for c in window[:-1])
        lo = min(c.low for c in window[:-1])
        width = hi - lo
        if width > 2.5 * atr_v or width <= 0:
            return []

        price = ctx.last.close
        last3 = ctx.candles[-3:]
        out: list[SignalCandidate] = []

        # Bullish breakout + retest of the broken high
        if price > hi + 0.25 * atr_v and any(c.low <= hi * 1.0005 for c in last3):
            stop = min(c.low for c in last3) - 0.2 * atr_v
            risk = price - stop
            if risk > 0:
                out.append(
                    SignalCandidate(
                        symbol=ctx.symbol,
                        timeframe=ctx.timeframe,
                        direction="LONG",
                        strategy=self.name,
                        strategy_version=self.version,
                        entry=price,
                        stop_loss=stop,
                        take_profit=price + 2.0 * risk,
                        regime=getattr(ctx.regime, "label", "UNCERTAIN"),
                        metadata={"range_high": hi, "range_low": lo, "reason": "Bullish range breakout with retest"},
                    )
                )
        # Bearish
        if price < lo - 0.25 * atr_v and any(c.high >= lo * 0.9995 for c in last3):
            stop = max(c.high for c in last3) + 0.2 * atr_v
            risk = stop - price
            if risk > 0:
                out.append(
                    SignalCandidate(
                        symbol=ctx.symbol,
                        timeframe=ctx.timeframe,
                        direction="SHORT",
                        strategy=self.name,
                        strategy_version=self.version,
                        entry=price,
                        stop_loss=stop,
                        take_profit=price - 2.0 * risk,
                        regime=getattr(ctx.regime, "label", "UNCERTAIN"),
                        metadata={"range_high": hi, "range_low": lo, "reason": "Bearish range breakout with retest"},
                    )
                )
        return out
