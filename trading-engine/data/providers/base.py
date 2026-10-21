"""Provider-independent market data interface."""
from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime

from data.models import Candle, Quote


class MarketDataProvider(ABC):
    @abstractmethod
    def get_latest_quote(self, symbol: str) -> Quote: ...

    @abstractmethod
    def get_candles(
        self,
        symbol: str,
        timeframe: str,
        start: datetime | None = None,
        end: datetime | None = None,
        limit: int = 500,
    ) -> list[Candle]: ...

    @abstractmethod
    def available(self) -> bool: ...
