"""Strategy A — Trend-following pullback (§8.2).

Rules (deterministic, reproducible):
  * Regime must be TRENDING (ADX + MA alignment handled by regime engine)
  * EMA21 > EMA50 for LONG (reversed for SHORT)
  * Pullback: price touched or closed back through EMA21 within last 3 candles
  * Momentum confirmation: RSI recovering from below 55 (LONG) / above 45 (SHORT)
  * Stop: 1.5 × ATR beyond the recent swing; target: 3 × ATR (R:R = 2)
  * Session filter: London or New York
"""
from __future__ import annotations

from strategies.base import SignalCandidate, Strategy
from structure.swings import StructureEngine, SwingPoint
from sessions.engine import SessionEngine


class TrendPullbackStrategy(Strategy):
    name = "trend_pullback"
    version = "1.2.0"

    def __init__(self, instruments: tuple[str, ...] | None = ("EURUSD", "GBPUSD", "USDJPY")) -> None:
        super().__init__(instruments)
        self.sessions = SessionEngine()
        self._structure = StructureEngine()

    def evaluate(self, ctx) -> list[SignalCandidate]:
        i = ctx.i
        if i < 55:
            return []
        regime = getattr(ctx.regime, "label", "UNCERTAIN")
        if regime not in {"TRENDING", "HIGH_VOL"}:
            return []
        if not self.sessions.in_trading_window():
            return []

        e21, e50 = ctx.ema21[i], ctx.ema50[i]
        rsi_v = ctx.rsi14[i]
        atr_v = ctx.atr14[i]
        if None in (e21, e50, rsi_v, atr_v):
            return []

        price = ctx.last.close
        recent = ctx.close[-3:]
        out: list[SignalCandidate] = []

        bull_pullback = e21 > e50 and min(recent) <= e21 * 1.0008 and rsi_v > 50 and rsi_v < 68
        bear_pullback = e21 < e50 and max(recent) >= e21 * 0.9992 and rsi_v < 50 and rsi_v > 32

        swings = [s for s in ctx.structure if isinstance(s, SwingPoint) and s.confirmed]
        if bull_pullback:
            lows = [s.price for s in swings if s.kind == "LOW"][-3:]
            stop = (min(lows) if lows else price - 1.5 * atr_v) - 0.1 * atr_v
            target = price + 2.0 * (price - stop)
            out.append(
                SignalCandidate(
                    symbol=ctx.symbol,
                    timeframe=ctx.timeframe,
                    direction="LONG",
                    strategy=self.name,
                    strategy_version=self.version,
                    entry=price,
                    stop_loss=stop,
                    take_profit=target,
                    regime=regime,
                    metadata={
                        "ema21": e21, "ema50": e50, "rsi": rsi_v, "atr": atr_v,
                        "reason": "Uptrend with pullback to EMA21 and momentum recovery",
                    },
                )
            )
        if bear_pullback:
            highs = [s.price for s in swings if s.kind == "HIGH"][-3:]
            stop = (max(highs) if highs else price + 1.5 * atr_v) + 0.1 * atr_v
            target = price - 2.0 * (stop - price)
            out.append(
                SignalCandidate(
                    symbol=ctx.symbol,
                    timeframe=ctx.timeframe,
                    direction="SHORT",
                    strategy=self.name,
                    strategy_version=self.version,
                    entry=price,
                    stop_loss=stop,
                    take_profit=target,
                    regime=regime,
                    metadata={
                        "ema21": e21, "ema50": e50, "rsi": rsi_v, "atr": atr_v,
                        "reason": "Downtrend with pullback to EMA21 and momentum recovery",
                    },
                )
            )
        return out
