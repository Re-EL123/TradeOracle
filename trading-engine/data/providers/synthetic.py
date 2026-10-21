"""Deterministic synthetic provider for development, tests and paper mode
without a licensed feed. Clearly labelled source='synthetic' so nothing
produced here can be mistaken for live market data."""
from __future__ import annotations

import math
import random
from datetime import datetime, timedelta, timezone

from data.models import Candle, Quote
from data.providers.base import MarketDataProvider
from engine.scheduler import TF_SECONDS

_BASE = {
    "EURUSD": 1.1642,
    "GBPUSD": 1.3418,
    "USDJPY": 151.42,
    "AUDUSD": 0.6538,
}


class SyntheticProvider(MarketDataProvider):
    source = "synthetic"

    def __init__(self, seed: int = 7) -> None:
        self._seed = seed

    def available(self) -> bool:
        return True

    def get_latest_quote(self, symbol: str) -> Quote:
        now = datetime.now(timezone.utc)
        ts = now.replace(minute=now.minute, second=0, microsecond=0)
        c = self.get_candles(symbol, "M1", start=ts - timedelta(minutes=1), limit=1)[0]
        pip = 0.01 if "JPY" in symbol else 0.0001
        half = 0.5 * pip
        return Quote(symbol, bid=c.close - half, ask=c.close + half, timestamp=now, source=self.source)

    def get_candles(self, symbol, timeframe, start=None, end=None, limit=500):
        step = TF_SECONDS[timeframe.upper()]
        end = end or datetime.now(timezone.utc)
        end_ts = (int(end.timestamp()) // step) * step
        base = _BASE.get(symbol, 1.0)
        rng = random.Random(f"{self._seed}:{symbol}:{timeframe}")
        out: list[Candle] = []
        price = base
        for i in range(limit - 1, -1, -1):
            ts = datetime.fromtimestamp(end_ts - i * step, tz=timezone.utc)
            noise = math.sin(ts.timestamp() / (step * 12)) * base * 0.0008
            shock = rng.gauss(0, base * 0.0011)
            open_ = price
            close = price + shock + noise * 0.05
            high = max(open_, close) + abs(rng.gauss(0, base * 0.0006))
            low = min(open_, close) - abs(rng.gauss(0, base * 0.0006))
            out.append(
                Candle(
                    symbol=symbol,
                    timeframe=timeframe,
                    timestamp=ts,
                    open=round(open_, 5),
                    high=round(high, 5),
                    low=round(low, 5),
                    close=round(close, 5),
                    volume=float(rng.randint(350, 2200)),
                    source=self.source,
                    complete=True,
                )
            )
            price = close
        return out
