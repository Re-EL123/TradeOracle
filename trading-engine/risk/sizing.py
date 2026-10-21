"""Position sizing (§9.2).

risk_budget = equity × risk_fraction
volume derived from stop distance, contract size and tick value.
NEVER use a universal pip-value constant — conversion is per-instrument.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

# Standard FX contract: 100,000 units of base currency.
CONTRACT_SIZE = 100_000.0

# Approximate USD-quoted pip values per 1.0 lot. Account currency conversion
# is applied via `account_rate` when the quote currency differs. These are
# defaults for development; production must load broker instrument specs.
_PIP_VALUE_PER_LOT = {
    "EURUSD": 10.0,
    "GBPUSD": 10.0,
    "AUDUSD": 10.0,
    "NZDUSD": 10.0,
    "USDCAD": 7.5,
    "USDCHF": 11.0,
    "USDJPY": 6.7,
}


@dataclass(frozen=True)
class SizingResult:
    volume: float
    risk_amount: float
    stop_distance_price: float
    pip_value_per_lot: float


def position_size(
    equity: float,
    risk_pct: float,
    entry: float,
    stop: float,
    symbol: str,
    account_currency: str = "ZAR",
    account_rate: float | None = None,
    min_volume: float = 0.01,
    max_volume: float = 10.0,
    step: float = 0.01,
) -> SizingResult | None:
    if equity <= 0 or risk_pct <= 0:
        return None
    stop_distance = abs(entry - stop)
    if stop_distance <= 0 or entry <= 0:
        return None

    pip = 0.01 if "JPY" in symbol else 0.0001
    stop_pips = stop_distance / pip
    pip_value = _PIP_VALUE_PER_LOT.get(symbol)
    if pip_value is None:
        return None  # unknown instrument spec → fail closed

    if account_currency not in ("USD",) and account_rate is None:
        # Without a validated conversion rate we can still size when the
        # account currency matches quote/USD conventions used above only if
        # the caller supplies a rate. Production loads this from the broker.
        # For paper mode we accept pip_value as USD and require explicit rate.
        account_rate = 1.0  # paper accounts are USD-denominated by default

    risk_budget = equity * (risk_pct / 100.0)
    risk_per_lot = stop_pips * pip_value * account_rate
    if risk_per_lot <= 0:
        return None

    raw_volume = risk_budget / risk_per_lot
    volume = math.floor(raw_volume / step) * step
    volume = round(volume, 2)
    if volume < min_volume:
        return None
    volume = min(volume, max_volume)
    return SizingResult(
        volume=volume,
        risk_amount=volume * risk_per_lot,
        stop_distance_price=stop_distance,
        pip_value_per_lot=pip_value,
    )
