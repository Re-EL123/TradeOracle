"""Strategy contract. Strategies PROPOSE candidates; they never submit orders."""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone


@dataclass
class SignalCandidate:
    symbol: str
    timeframe: str
    direction: str  # LONG | SHORT
    strategy: str
    strategy_version: str
    entry: float
    stop_loss: float
    take_profit: float
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    regime: str = "UNCERTAIN"
    score: float | None = None
    score_breakdown: dict = field(default_factory=dict)
    status: str = "GENERATED"
    rejection_reason: str | None = None
    metadata: dict = field(default_factory=dict)

    @property
    def risk_distance(self) -> float:
        return abs(self.entry - self.stop_loss)

    @property
    def reward_distance(self) -> float:
        return abs(self.take_profit - self.entry)

    @property
    def rr(self) -> float | None:
        if self.risk_distance <= 0:
            return None
        return self.reward_distance / self.risk_distance


class Strategy(ABC):
    name = "base_strategy"
    version = "1.0.0"

    def __init__(self, instruments: tuple[str, ...] | None = None) -> None:
        self.instruments = instruments

    def applies_to(self, symbol: str) -> bool:
        return self.instruments is None or symbol in self.instruments

    @abstractmethod
    def evaluate(self, market_context) -> list[SignalCandidate]:
        """Return candidate signals with explanations. No order submission."""
        raise NotImplementedError
