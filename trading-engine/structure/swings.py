"""Market structure engine — swings, BOS/CHoCH, S/R zones (§7.4).

A swing is only CONFIRMED after `lookahead` subsequent candles close, so
backtests apply the same delay that would have existed in real time.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from data.models import Candle


@dataclass(frozen=True)
class SwingPoint:
    kind: str  # "HIGH" | "LOW"
    price: float
    time: datetime
    index: int
    confirmed: bool


@dataclass(frozen=True)
class StructureEvent:
    kind: str  # "BOS" | "CHOCH"
    direction: str  # "UP" | "DOWN"
    level: float
    time: datetime
    confirmed: bool


@dataclass(frozen=True)
class Zone:
    kind: str  # "SUPPORT" | "RESISTANCE"
    low: float
    high: float
    touches: int


class StructureEngine:
    def __init__(self, lookback: int = 2, confirm: int = 2) -> None:
        self.lookback = lookback
        self.confirm = confirm

    def detect(self, candles: list[Candle]) -> list:
        swings = self.swing_points(candles)
        events = self.structure_events(swings, len(candles))
        zones = self.support_resistance(swings)
        return swings + events + zones

    def swing_points(self, candles: list[Candle]) -> list[SwingPoint]:
        k = self.lookback
        out: list[SwingPoint] = []
        n = len(candles)
        for i in range(k, n - k):
            window = candles[i - k : i + k + 1]
            if candles[i].high >= max(c.high for c in window):
                out.append(SwingPoint("HIGH", candles[i].high, candles[i].timestamp, i, True))
            if candles[i].low <= min(c.low for c in window):
                out.append(SwingPoint("LOW", candles[i].low, candles[i].timestamp, i, True))
        # Tentative swing at the forming edge (never confirmed)
        i = n - 1
        if i >= k:
            window = candles[max(0, i - 2 * k) : i]
            if window:
                if candles[i].high >= max(c.high for c in window):
                    out.append(SwingPoint("HIGH", candles[i].high, candles[i].timestamp, i, False))
                if candles[i].low <= min(c.low for c in window):
                    out.append(SwingPoint("LOW", candles[i].low, candles[i].timestamp, i, False))
        return out

    def structure_events(self, swings: list[SwingPoint], total: int) -> list[StructureEvent]:
        confirmed = [s for s in swings if s.confirmed]
        highs = [s for s in confirmed if s.kind == "HIGH"]
        lows = [s for s in confirmed if s.kind == "LOW"]
        events: list[StructureEvent] = []
        for a, b in zip(highs, highs[1:]):
            if b.price > a.price:
                events.append(StructureEvent("BOS", "UP", a.price, b.time, True))
            elif b.price < a.price:
                events.append(StructureEvent("CHOCH", "DOWN", a.price, b.time, True))
        for a, b in zip(lows, lows[1:]):
            if b.price < a.price:
                events.append(StructureEvent("BOS", "DOWN", a.price, b.time, True))
            elif b.price > a.price:
                events.append(StructureEvent("CHOCH", "UP", a.price, b.time, True))
        return events[-20:]

    def support_resistance(self, swings: list[SwingPoint], tol: float = 0.0015) -> list[Zone]:
        pts = sorted(swings, key=lambda s: s.price)
        zones: list[Zone] = []
        used = [False] * len(pts)
        for i, p in enumerate(pts):
            if used[i]:
                continue
            cluster = [p]
            for j in range(i + 1, len(pts)):
                if used[j]:
                    continue
                if abs(pts[j].price - p.price) / p.price <= tol:
                    cluster.append(pts[j])
                    used[j] = True
            if len(cluster) >= 2:
                prices = [c.price for c in cluster]
                zones.append(
                    Zone("SUPPORT" if cluster[0].kind == "LOW" else "RESISTANCE",
                         min(prices), max(prices), len(cluster))
                )
        return zones

    @staticmethod
    def trend(swings: list[SwingPoint]) -> str:
        highs = [s for s in swings if s.kind == "HIGH" and s.confirmed]
        lows = [s for s in swings if s.kind == "LOW" and s.confirmed]
        if len(highs) < 2 or len(lows) < 2:
            return "RANGE"
        hh = highs[-1].price > highs[-2].price
        hl = lows[-1].price > lows[-2].price
        lh = highs[-1].price < highs[-2].price
        ll = lows[-1].price < lows[-2].price
        if hh and hl:
            return "UPTREND"
        if lh and ll:
            return "DOWNTREND"
        return "RANGE"
