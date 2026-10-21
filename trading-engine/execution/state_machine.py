"""Order state machine (§10.3). UNKNOWN is explicit — a timeout ≠ failure."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone

STATES = {
    "CREATED": {"VALIDATED", "REJECTED"},
    "VALIDATED": {"SUBMITTING", "CANCELLED"},
    "SUBMITTING": {"ACCEPTED", "REJECTED", "UNKNOWN"},
    "UNKNOWN": {"ACCEPTED", "REJECTED", "CANCELLED", "FILLED"},
    "ACCEPTED": {"PARTIALLY_FILLED", "FILLED", "CANCELLED", "REJECTED"},
    "PARTIALLY_FILLED": {"FILLED", "CANCELLED"},
    "FILLED": {"POSITION_OPEN", "CLOSED"},
    "POSITION_OPEN": {"CLOSED"},
    "CLOSED": set(),
    "REJECTED": set(),
    "CANCELLED": set(),
}


class InvalidTransition(Exception):
    pass


@dataclass
class OrderState:
    order_id: str
    symbol: str
    direction: str
    order_type: str
    requested_volume: float
    state: str = "CREATED"
    filled_volume: float = 0.0
    requested_price: float | None = None
    average_fill_price: float | None = None
    stop_loss: float | None = None
    take_profit: float | None = None
    broker_order_id: str | None = None
    error: str | None = None
    history: list[dict] = field(default_factory=list)
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def transition(self, new_state: str, reason: str | None = None) -> None:
        allowed = STATES.get(self.state, set())
        if new_state not in allowed:
            raise InvalidTransition(f"{self.state} → {new_state} not allowed")
        self.history.append(
            {
                "from": self.state,
                "to": new_state,
                "at": datetime.now(timezone.utc).isoformat(),
                "reason": reason,
            }
        )
        self.state = new_state
        self.updated_at = datetime.now(timezone.utc)
        if reason and new_state in {"REJECTED", "UNKNOWN"}:
            self.error = reason

    def apply_fill(self, volume: float, price: float) -> None:
        self.filled_volume = round(self.filled_volume + volume, 2)
        if self.average_fill_price is None:
            self.average_fill_price = price
        else:
            total = self.average_fill_price * (self.filled_volume - volume) + price * volume
            self.average_fill_price = total / self.filled_volume
        if self.filled_volume + 1e-9 >= self.requested_volume:
            if self.state != "FILLED":
                self.transition("FILLED")
        elif self.state == "ACCEPTED":
            self.transition("PARTIALLY_FILLED")

    @property
    def idempotency_key(self) -> str:
        return f"{self.order_id}:{self.symbol}:{self.requested_volume}"
