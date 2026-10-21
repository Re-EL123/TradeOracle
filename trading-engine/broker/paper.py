"""Paper broker — simulated fills with spread adjustment, duplicate protection
and reconciliation. Shares the order state machine with live adapters."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from broker.base import BrokerAdapter
from execution.state_machine import OrderState

log = logging.getLogger("tradeoracle.broker.paper")


class OrderResult:
    def __init__(self, accepted: bool, order_id: str | None = None, reason: str | None = None) -> None:
        self.accepted = accepted
        self.order_id = order_id
        self.reason = reason


class PaperBroker(BrokerAdapter):
    def __init__(self, cfg, store) -> None:
        self.cfg = cfg
        self.store = store
        self._seen_keys: set[str] = set()

    def available(self) -> bool:
        return True

    def get_account(self) -> dict:
        return self.store.get_account()

    def get_positions(self) -> list[dict]:
        return self.store.open_positions()

    def get_orders(self) -> list[dict]:
        return self.store.list_orders()

    def submit_order(self, order_request: dict) -> dict:
        key = order_request.get("idempotency_key")
        if key and key in self._seen_keys:
            log.warning("duplicate order suppressed key=%s", key)
            return {"accepted": False, "reason": "duplicate idempotency key"}
        state = OrderState(
            order_id=order_request["order_id"],
            symbol=order_request["symbol"],
            direction=order_request["direction"],
            order_type=order_request.get("type", "MARKET"),
            requested_volume=float(order_request["volume"]),
            requested_price=order_request.get("entry"),
            stop_loss=order_request.get("stop_loss"),
            take_profit=order_request.get("take_profit"),
        )
        state.transition("VALIDATED")
        state.transition("SUBMITTING")
        quote = self.store.get_quote(state.symbol)
        if quote is None:
            state.transition("UNKNOWN", reason="no quote available at submit time")
            self.store.save_order(state)
            return {"accepted": False, "state": state.state, "reason": "no quote"}
        fill_price = quote.ask if state.direction == "LONG" else quote.bid
        state.transition("ACCEPTED")
        state.apply_fill(state.requested_volume, fill_price)
        state.transition("POSITION_OPEN")
        state.broker_order_id = f"P-{uuid.uuid4().hex[:10].upper()}"
        if key:
            self._seen_keys.add(key)
        self.store.save_order(state)
        self.store.save_position(
            {
                "id": f"POS-{state.order_id}",
                "order_id": state.order_id,
                "symbol": state.symbol,
                "direction": state.direction,
                "volume": state.filled_volume,
                "entry": fill_price,
                "current": fill_price,
                "stop_loss": state.stop_loss,
                "take_profit": state.take_profit,
                "risk_amount": order_request.get("risk_amount", 0.0),
                "opened_at": datetime.now(timezone.utc).isoformat(),
                "source": "paper",
            }
        )
        log.info("paper.fill %s %s %.2f @ %.5f", state.symbol, state.direction, state.filled_volume, fill_price)
        return {"accepted": True, "order_id": state.order_id, "fill_price": fill_price}

    def submit(self, cand, risk_decision) -> OrderResult:
        key = f"{cand.symbol}:{cand.strategy}:{cand.strategy_version}:{cand.timestamp.isoformat()}"
        if key in self._seen_keys:
            return OrderResult(False, reason="duplicate signal order")
        result = self.submit_order(
            {
                "order_id": f"ORD-{uuid.uuid4().hex[:8].upper()}",
                "symbol": cand.symbol,
                "direction": cand.direction,
                "type": "MARKET",
                "volume": risk_decision.volume,
                "entry": cand.entry,
                "stop_loss": cand.stop_loss,
                "take_profit": cand.take_profit,
                "risk_amount": risk_decision.risk_amount,
                "idempotency_key": key,
            }
        )
        if result.get("accepted"):
            self._seen_keys.add(key)
            return OrderResult(True, order_id=result["order_id"])
        return OrderResult(False, reason=result.get("reason", "rejected"))

    def cancel_order(self, broker_order_id: str) -> dict:
        return {"accepted": False, "reason": "paper broker does not hold pending orders"}

    def close_position(self, position_id: str, volume: float | None = None) -> dict:
        pos = self.store.get_position(position_id)
        if pos is None:
            return {"accepted": False, "reason": "position not found"}
        quote = self.store.get_quote(pos["symbol"])
        if quote is None:
            return {"accepted": False, "reason": "no quote"}
        exit_price = quote.bid if pos["direction"] == "LONG" else quote.ask
        vol = volume or pos["volume"]
        sign = 1 if pos["direction"] == "LONG" else -1
        pnl = (exit_price - pos["entry"]) * sign * vol * 100_000
        self.store.close_position(position_id, exit_price, pnl)
        log.info("paper.close %s pnl=%.2f", position_id, pnl)
        return {"accepted": True, "pnl": pnl, "exit_price": exit_price}

    def reconcile(self) -> None:
        """Mark-to-market open positions against the current quote."""
        for pos in self.store.open_positions():
            quote = self.store.get_quote(pos["symbol"])
            if quote is None:
                continue
            current = quote.bid if pos["direction"] == "LONG" else quote.ask
            sign = 1 if pos["direction"] == "LONG" else -1
            pnl = (current - pos["entry"]) * sign * pos["volume"] * 100_000
            self.store.update_position_price(pos["id"], current, pnl)
            sl, tp = pos.get("stop_loss"), pos.get("take_profit")
            hit_sl = (current <= sl) if pos["direction"] == "LONG" else (current >= sl)
            hit_tp = (current >= tp) if pos["direction"] == "LONG" else (current <= tp)
            if hit_sl or hit_tp:
                # Conservative: assume stop first when both hit in same tick
                reason = "SL" if hit_sl and hit_tp else ("SL" if hit_sl else "TP")
                self.close_position(pos["id"])
                log.info("paper.exit %s by %s", pos["id"], reason)
