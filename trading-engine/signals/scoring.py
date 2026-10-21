"""Signal scoring — documented weights, hard rejections BEFORE ranking (§8.3).

The score is a ranking index, NOT a probability of winning.
"""
from __future__ import annotations

from dataclasses import dataclass

from structure.swings import StructureEngine, SwingPoint

DEFAULT_WEIGHTS = {
    "trend_alignment": 0.20,
    "market_structure": 0.20,
    "entry_confirmation": 0.20,
    "volatility_suitability": 0.15,
    "risk_reward": 0.15,
    "session_suitability": 0.10,
}


@dataclass
class HardRejection:
    reason: str


class SignalScorer:
    def __init__(self, weights: dict[str, float] | None = None) -> None:
        self.weights = weights or dict(DEFAULT_WEIGHTS)

    def score(self, cand, ctx):
        """Apply hard rejections, then attach score 0-100 + breakdown."""
        rej = self.hard_rejections(cand, ctx)
        if rej:
            cand.status = "REJECTED"
            cand.rejection_reason = rej.reason
            cand.score_breakdown = {"rejected": rej.reason}
            return cand

        i = ctx.i
        e21, e50 = ctx.ema21[i], ctx.ema50[i]
        rsi_v = ctx.rsi14[i]
        atr_v = ctx.atr14[i]
        adx_v = ctx.adx14[i]

        trend_up = e21 is not None and e50 is not None and e21 > e50
        trend_ok = trend_up if cand.direction == "LONG" else not trend_up
        factors: dict[str, float] = {}

        factors["trend_alignment"] = 90.0 if trend_ok else 15.0

        swings = [s for s in ctx.structure if isinstance(s, SwingPoint) and s.confirmed]
        trend = StructureEngine.trend(swings)
        struct_ok = (trend == "UPTREND") if cand.direction == "LONG" else (trend == "DOWNTREND")
        factors["market_structure"] = 85.0 if struct_ok else 40.0

        if rsi_v is not None:
            if cand.direction == "LONG":
                factors["entry_confirmation"] = 80.0 if 50 <= rsi_v <= 68 else 40.0
            else:
                factors["entry_confirmation"] = 80.0 if 32 <= rsi_v <= 50 else 40.0
        else:
            factors["entry_confirmation"] = 30.0

        if adx_v is not None:
            factors["volatility_suitability"] = min(95.0, 50.0 + adx_v)
        else:
            factors["volatility_suitability"] = 45.0

        rr = cand.rr or 0.0
        factors["risk_reward"] = min(95.0, rr * 32.0)

        factors["session_suitability"] = 70.0

        # Normalise weights (guard against misconfiguration)
        wsum = sum(self.weights.values()) or 1.0
        score = sum(factors[k] * (self.weights.get(k, 0) / wsum) for k in factors)

        cand.score = round(score, 1)
        cand.score_breakdown = {k: round(v, 1) for k, v in factors.items()}
        cand.status = "ELIGIBLE"
        return cand

    def hard_rejections(self, cand, ctx) -> HardRejection | None:
        i = ctx.i
        if cand.risk_distance <= 0:
            return HardRejection("invalid stop: zero risk distance")
        if cand.rr is not None and cand.rr < 1.5:
            return HardRejection(f"reward-to-risk {cand.rr:.2f} below absolute floor 1.50")
        if i < 1:
            return HardRejection("insufficient candles")
        atr_v = ctx.atr14[i]
        if atr_v and cand.risk_distance > 4.0 * atr_v:
            return HardRejection("stop distance exceeds 4× ATR — invalid placement")
        if ctx.quote is not None and cand.symbol:
            pip = 0.01 if "JPY" in cand.symbol else 0.0001
            spread = getattr(ctx.quote, "spread", 0.0)
            if spread > 2.0 * pip:
                return HardRejection(f"spread {spread / pip:.1f} pips above entry threshold")
        return None
