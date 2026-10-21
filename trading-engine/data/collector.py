"""Data collector — routes to the configured provider and caches recent candles."""
from __future__ import annotations

import logging

from data.models import Candle
from data.providers.synthetic import SyntheticProvider
from data.providers.base import MarketDataProvider

log = logging.getLogger("tradeoracle.data.collector")

_PROVIDERS: dict[str, type[MarketDataProvider]] = {
    "synthetic": SyntheticProvider,
}


def register_provider(name: str, cls: type[MarketDataProvider]) -> None:
    _PROVIDERS[name.lower()] = cls


class MarketDataCollector:
    def __init__(self, cfg) -> None:
        self.cfg = cfg
        name = (cfg.market_data_provider or "synthetic").lower()
        provider_cls = _PROVIDERS.get(name)
        if provider_cls is None:
            log.warning("provider %r not registered — falling back to synthetic", name)
            provider_cls = SyntheticProvider
        self.provider = provider_cls()
        self._cache: dict[tuple[str, str], list[Candle]] = {}

    def available(self) -> bool:
        try:
            return self.provider.available()
        except Exception:  # noqa: BLE001
            log.exception("provider availability check failed")
            return False

    def get_candles(self, symbol: str, timeframe: str, limit: int = 400) -> list[Candle]:
        key = (symbol, timeframe)
        candles = self.provider.get_candles(symbol, timeframe, limit=limit)
        # Deduplicate by timestamp keeping latest observation
        by_ts = {c.timestamp: c for c in candles}
        ordered = [by_ts[t] for t in sorted(by_ts)]
        self._cache[key] = ordered[-1000:]
        return ordered

    def get_quote(self, symbol: str):
        return self.provider.get_latest_quote(symbol)

    def cached(self, symbol: str, timeframe: str) -> list[Candle]:
        return list(self._cache.get((symbol, timeframe), []))
