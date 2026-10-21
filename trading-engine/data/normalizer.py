"""Normalizer — converts provider payloads into canonical Candle objects."""
from __future__ import annotations

from datetime import datetime, timezone

from data.models import Candle


class Normalizer:
    @staticmethod
    def from_dict(symbol: str, timeframe: str, raw: dict, source: str) -> Candle:
        ts = raw.get("timestamp") or raw.get("time") or raw.get("t")
        if isinstance(ts, (int, float)):
            # seconds or ms
            ts = datetime.fromtimestamp(ts / 1000 if ts > 1e12 else ts, tz=timezone.utc)
        elif isinstance(ts, str):
            ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)

        return Candle(
            symbol=symbol.upper(),
            timeframe=timeframe.upper(),
            timestamp=ts,
            open=float(raw["open"] if "open" in raw else raw["o"]),
            high=float(raw["high"] if "high" in raw else raw["h"]),
            low=float(raw["low"] if "low" in raw else raw["l"]),
            close=float(raw["close"] if "close" in raw else raw["c"]),
            volume=float(raw.get("volume", raw.get("v", 0.0)) or 0.0),
            source=source,
            complete=bool(raw.get("complete", True)),
        )
