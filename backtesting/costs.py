"""Transaction-cost model (§17.2)."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class CostModel:
    spread_pips: float = 0.8
    commission_per_lot_side: float = 3.5   # account currency
    slippage_pips: float = 0.2
    swap_per_night: float = 0.0

    def pip_size(self, symbol: str) -> float:
        return 0.01 if "JPY" in symbol else 0.0001

    def apply_entry(self, symbol: str, price: float, direction: str) -> float:
        pip = self.pip_size(symbol)
        slip = self.slippage_pips * pip
        half_spread = self.spread_pips * pip / 2
        if direction == "LONG":
            return price + half_spread + slip
        return price - half_spread - slip

    def apply_exit(self, symbol: str, price: float, direction: str) -> float:
        pip = self.pip_size(symbol)
        slip = self.slippage_pips * pip
        half_spread = self.spread_pips * pip / 2
        if direction == "LONG":
            return price - half_spread - slip
        return price + half_spread + slip

    def commission(self, volume: float) -> float:
        return self.commission_per_lot_side * 2 * volume
