"""Backtest integrity validation helpers (§16.3)."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class IntegrityReport:
    ok: bool
    issues: list[str]

    def raise_if_failed(self) -> None:
        if not self.ok:
            raise ValueError("backtest integrity failed: " + "; ".join(self.issues))


def validate_run(trades, candles, warmup: int = 60) -> IntegrityReport:
    issues: list[str] = []
    if candles and trades:
        first_entry = min(t.entry_time for t in trades)
        first_visible = candles[warmup].timestamp if len(candles) > warmup else None
        if first_visible and first_entry < first_visible:
            issues.append("trade entered before warm-up period completed")
    for t in trades:
        if t.entry_time >= t.exit_time:
            issues.append(f"trade {t.entry_time} exit not after entry")
        if t.volume <= 0:
            issues.append("non-positive volume")
        if t.pnl == 0 and t.commission == 0:
            issues.append("zero-cost trade — costs not applied")
    # Monotonic timestamps in candle series
    for a, b in zip(candles, candles[1:]):
        if b.timestamp <= a.timestamp:
            issues.append("non-monotonic candle timestamps")
            break
    return IntegrityReport(ok=not issues, issues=issues)
