"""Broker abstraction (§10.1)."""
from __future__ import annotations

from abc import ABC, abstractmethod


class BrokerAdapter(ABC):
    @abstractmethod
    def get_account(self) -> dict: ...

    @abstractmethod
    def get_positions(self) -> list[dict]: ...

    @abstractmethod
    def get_orders(self) -> list[dict]: ...

    @abstractmethod
    def submit_order(self, order_request: dict) -> dict: ...

    @abstractmethod
    def cancel_order(self, broker_order_id: str) -> dict: ...

    @abstractmethod
    def close_position(self, position_id: str, volume: float | None = None) -> dict: ...

    @abstractmethod
    def available(self) -> bool: ...
