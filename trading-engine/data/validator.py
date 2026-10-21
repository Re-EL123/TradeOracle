"""Candle validation — reject corrupt data before it reaches strategies (§7.1)."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta

from data.models import Candle

log = logging.getLogger("tradeoracle.data.validator")

MAX_JUMP_SIGMA = 6.0


class CandleValidator:
    def filter_valid(self, symbol: str, candles: list[Candle]) -> list[Candle]:
        if not candles:
            return []
        clean: list[Candle] = []
        seen: set[datetime] = set()
        prev: Candle | None = None
        for c in candles:
            try:
                c.validate_shape()
            except ValueError as e:
                log.warning("reject %s shape: %s", symbol, e)
                continue
            if c.timestamp in seen:
                continue
            if prev is not None:
                if c.timestamp <= prev.timestamp:
                    log.warning("reject %s out-of-order timestamp", symbol)
                    continue
                move = abs(c.close - prev.close) / (prev.close or 1)
                sigma = self._sigma(candles)
                if sigma and move > MAX_JUMP_SIGMA * sigma:
                    log.warning("reject %s price jump %.4f > %dx sigma", symbol, move, MAX_JUMP_SIGMA)
                    continue
            seen.add(c.timestamp)
            clean.append(c)
            prev = c
        return clean

    @staticmethod
    def _sigma(candles: list[Candle]) -> float:
        if len(candles) < 20:
            return 0.0
        rets = [
            abs(b.close - a.close) / (a.close or 1)
            for a, b in zip(candles[-200:-1], candles[-199:])
        ]
        mean = sum(rets) / len(rets)
        var = sum((r - mean) ** 2 for r in rets) / len(rets)
        return var ** 0.5

    @staticmethod
    def detect_gaps(candles: list[Candle], timeframe: str, tolerance_minutes: int = 5) -> list[tuple[datetime, datetime]]:
        from engine.scheduler import interval

        step = interval(timeframe)
        gaps = []
        for a, b in zip(candles, candles[1:]):
            if b.timestamp - a.timestamp > step + timedelta(minutes=tolerance_minutes):
                gaps.append((a.timestamp, b.timestamp))
        return gaps
