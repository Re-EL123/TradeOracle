"""Signal lifecycle store (§8.4) — explicit states with persisted reasons."""
from __future__ import annotations

import logging
from datetime import datetime, timezone

log = logging.getLogger("tradeoracle.signals")

VALID_TRANSITIONS = {
    "GENERATED": {"EVALUATING", "REJECTED"},
    "EVALUATING": {"ELIGIBLE", "REJECTED"},
    "ELIGIBLE": {"EXPIRED", "CANCELLED", "ORDER_REQUESTED", "CLOSED"},
    "ORDER_REQUESTED": {"EXECUTION_FAILED", "EXECUTED"},
    "EXECUTED": {"CLOSED"},
    "CLOSED": set(),
    "REJECTED": set(),
    "EXPIRED": set(),
    "CANCELLED": set(),
    "EXECUTION_FAILED": set(),
}


class SignalStore:
    def __init__(self, store) -> None:
        self.store = store
        self._live: dict[str, dict] = {}

    def register(self, cand) -> None:
        self._transition(cand, "EVALUATING" if cand.status == "GENERATED" else cand.status)
        self.store.save_signal(cand)

    def reject(self, cand, reason: str) -> None:
        cand.rejection_reason = reason
        self._transition(cand, "REJECTED")
        self.store.save_signal(cand)
        log.info("signal.rejected %s %s reason=%s", cand.symbol, cand.direction, reason)

    def mark_ordered(self, cand, order_result) -> None:
        if getattr(order_result, "accepted", False):
            self._transition(cand, "ORDER_REQUESTED")
        else:
            cand.rejection_reason = getattr(order_result, "reason", "execution failed")
            self._transition(cand, "EXECUTION_FAILED")
        self.store.save_signal(cand)

    def _transition(self, cand, new_state: str) -> None:
        current = cand.status
        if new_state != current and new_state not in VALID_TRANSITIONS.get(current, {new_state}):
            log.warning(
                "invalid signal transition %s→%s for %s — forcing state",
                current, new_state, cand.symbol,
            )
        prev = self._live.get(id(cand))
        cand.metadata.setdefault("transitions", []).append(
            {
                "from": current,
                "to": new_state,
                "at": datetime.now(timezone.utc).isoformat(),
                "reason": cand.rejection_reason,
            }
        )
        cand.status = new_state
        self._live[id(cand)] = cand
        void = prev
        del void
