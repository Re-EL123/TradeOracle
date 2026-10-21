"""Deterministic market-regime classification (§7.6).

Interpretable rules first; ML classifier can replace/ensemble later behind
the same interface once validated (see AI Lab roadmap).
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Regime:
    label: str  # TRENDING | RANGING | HIGH_VOL | LOW_VOL | BREAKOUT | UNCERTAIN
    adx: float | None
    atr_percentile: float | None
    ma_aligned: bool
    notes: str


class RegimeClassifier:
    def classify(self, ctx) -> Regime:
        i = ctx.i
        adx_v = ctx.adx14[i] if i < len(ctx.adx14) else None
        atr_series = [v for v in ctx.atr14 if v is not None]
        atr_v = ctx.atr14[i] if i < len(ctx.atr14) else None
        pct = _percentile(atr_v, atr_series) if atr_v is not None and atr_series else None
        e21, e50 = ctx.ema21[i], ctx.ema50[i]
        aligned = e21 is not None and e50 is not None and (e21 > e50 or e21 < e50)

        if adx_v is None or atr_v is None:
            return Regime("UNCERTAIN", adx_v, pct, False, "insufficient history")

        if pct is not None and pct >= 90:
            return Regime("HIGH_VOL", adx_v, pct, aligned, "ATR in top decile of window")
        if pct is not None and pct <= 15:
            return Regime("LOW_VOL", adx_v, pct, aligned, "ATR in bottom decile")

        if adx_v >= 25 and aligned:
            return Regime("TRENDING", adx_v, pct, aligned, f"ADX {adx_v:.1f} ≥ 25 with MA alignment")
        if adx_v < 18:
            return Regime("RANGING", adx_v, pct, aligned, f"ADX {adx_v:.1f} < 18")
        return Regime("UNCERTAIN", adx_v, pct, aligned, "mixed signals — abstention preferred")


def _percentile(value: float, series: list[float]) -> float:
    if not series:
        return 50.0
    below = sum(1 for v in series if v <= value)
    return 100.0 * below / len(series)
