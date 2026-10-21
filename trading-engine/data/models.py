"""Market data models."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class Candle:
    symbol: str
    timeframe: str
    timestamp: datetime  # candle OPEN time, UTC
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0
    source: str = "unknown"
    complete: bool = True

    def validate_shape(self) -> None:
        if self.high < max(self.open, self.close) - 1e-12:
            raise ValueError("high below open/close")
        if self.low > min(self.open, self.close) + 1e-12:
            raise ValueError("low above open/close")
        if min(self.open, self.high, self.low, self.close) <= 0:
            raise ValueError("non-positive price")


@dataclass(frozen=True)
class Quote:
    symbol: str
    bid: float
    ask: float
    timestamp: datetime
    source: str = "unknown"

    @property
    def spread(self) -> float:
        return max(0.0, self.ask - self.bid)
