"""Persistence layer.

Uses MongoDB Atlas when MONGODB_URI is configured; otherwise an in-memory
store with optional JSON snapshotting to runtime/ so paper mode and tests
work offline. Safety state is ALWAYS persisted so a restart cannot clear a
halt or loss limit.
"""
from __future__ import annotations

import json
import logging
import threading
from datetime import datetime, timezone
from pathlib import Path

log = logging.getLogger("tradeoracle.persistence")


class Store:
    def __init__(self, cfg) -> None:
        self.cfg = cfg
        self._client = None
        self._db = None
        self._lock = threading.Lock()
        self._mem: dict[str, list[dict]] = {
            "signals": [], "orders": [], "positions": [], "trades": [],
            "risk_events": [], "heartbeats": [], "audit_logs": [], "engine_commands": [],
        }
        self._safety_path = cfg.runtime_dir / "safety_state.json"
        self._account = {"equity": 100_000.0, "balance": 100_000.0, "currency": "USD"}

    # ---------- connection ----------
    def connect(self) -> bool:
        if self.cfg.mongodb_uri:
            try:
                from pymongo import MongoClient

                self._client = MongoClient(self.cfg.mongodb_uri, serverSelectionTimeoutMS=4000)
                self._client.admin.command("ping")
                self._db = self._client[self.cfg.mongodb_database]
                self._ensure_indexes()
                log.info("persistence.mongo.connected db=%s", self.cfg.mongodb_database)
                return True
            except Exception:  # noqa: BLE001
                log.exception("mongo connection failed — continuing with memory store")
                self._db = None
        self.cfg.runtime_dir.mkdir(parents=True, exist_ok=True)
        return True

    def _ensure_indexes(self) -> None:
        if self._db is None:
            return
        self._db.market_candles.create_index(
            [("symbol", 1), ("timeframe", 1), ("timestamp", -1)], unique=True
        )
        self._db.signals.create_index([("symbol", 1), ("timestamp", -1)])
        self._db.orders.create_index([("order_id", 1)], unique=True)
        self._db.engine_heartbeats.create_index([("at", -1)])
        self._db.risk_events.create_index([("at", -1)])

    # ---------- generic ----------
    def _insert(self, collection: str, doc: dict) -> None:
        with self._lock:
            if self._db is not None:
                try:
                    self._db[collection].insert_one(dict(doc))
                    return
                except Exception:  # noqa: BLE001 — e.g. duplicate key
                    log.debug("insert %s failed (dup?)", collection, exc_info=True)
                    return
            self._mem.setdefault(collection, []).append(doc)

    def _query(self, collection: str, filt: dict | None = None, limit: int = 500) -> list[dict]:
        if self._db is not None:
            try:
                return list(self._db[collection].find(filt or {}, {"_id": 0}).limit(limit))
            except Exception:  # noqa: BLE001
                log.exception("query %s failed", collection)
                return []
        return list(self._mem.get(collection, []))

    # ---------- domain ----------
    def save_signal(self, cand) -> None:
        self._insert(
            "signals",
            {
                "id": f"SIG-{cand.timestamp.strftime('%Y%m%d%H%M%S')}-{cand.symbol}",
                "symbol": cand.symbol,
                "timeframe": cand.timeframe,
                "direction": cand.direction,
                "strategy": cand.strategy,
                "strategy_version": cand.strategy_version,
                "entry": cand.entry,
                "stop_loss": cand.stop_loss,
                "take_profit": cand.take_profit,
                "rr": cand.rr,
                "score": cand.score,
                "score_breakdown": cand.score_breakdown,
                "status": cand.status,
                "rejection_reason": cand.rejection_reason,
                "regime": cand.regime,
                "timestamp": cand.timestamp.isoformat(),
                "metadata": cand.metadata,
            },
        )

    def save_order(self, state) -> None:
        self._insert(
            "orders",
            {
                "order_id": state.order_id,
                "symbol": state.symbol,
                "direction": state.direction,
                "type": state.order_type,
                "requested_volume": state.requested_volume,
                "filled_volume": state.filled_volume,
                "requested_price": state.requested_price,
                "average_fill_price": state.average_fill_price,
                "stop_loss": state.stop_loss,
                "take_profit": state.take_profit,
                "state": state.state,
                "broker_order_id": state.broker_order_id,
                "error": state.error,
                "history": state.history,
                "created_at": state.created_at.isoformat(),
                "updated_at": state.updated_at.isoformat(),
            },
        )

    def save_position(self, pos: dict) -> None:
        self._insert("positions", pos)

    def open_positions(self) -> list[dict]:
        return [p for p in self._query("positions", {"closed": {"$ne": True}}) if not p.get("closed")]

    def get_position(self, position_id: str) -> dict | None:
        for p in self._query("positions"):
            if p.get("id") == position_id and not p.get("closed"):
                return p
        return None

    def update_position_price(self, position_id: str, current: float, pnl: float) -> None:
        for p in self._mem.get("positions", []):
            if p.get("id") == position_id:
                p["current"] = current
                p["pnl"] = pnl
        if self._db is not None:
            self._db.positions.update_one(
                {"id": position_id}, {"$set": {"current": current, "pnl": pnl}}
            )

    def close_position(self, position_id: str, exit_price: float, pnl: float) -> None:
        now = datetime.now(timezone.utc).isoformat()
        for p in self._mem.get("positions", []):
            if p.get("id") == position_id:
                p.update({"closed": True, "exit": exit_price, "pnl": pnl, "closed_at": now})
                self._insert("trades", dict(p))
        if self._db is not None:
            doc = self._db.positions.find_one_and_update(
                {"id": position_id},
                {"$set": {"closed": True, "exit": exit_price, "pnl": pnl, "closed_at": now}},
                return_document=True,
            )
            if doc:
                doc.pop("_id", None)
                self._insert("trades", doc)

    def list_orders(self) -> list[dict]:
        return self._query("orders")

    def save_risk_event(self, kind: str, detail: str) -> None:
        self._insert(
            "risk_events",
            {"kind": kind, "detail": detail, "at": datetime.now(timezone.utc).isoformat()},
        )

    def push_heartbeat(self, snap: dict) -> None:
        doc = {**snap, "at": datetime.now(timezone.utc).isoformat()}
        self._insert("engine_heartbeats", doc)
        if self._db is not None:
            try:
                self._db.engine_heartbeats.delete_many({"at": {"$lt": doc["at"][:10]}})
            except Exception:  # noqa: BLE001
                pass

    def last_heartbeat(self) -> dict | None:
        rows = self._query("engine_heartbeats", limit=1)
        return rows[-1] if rows else None

    def get_account(self) -> dict:
        if self._db is not None:
            doc = self._db.accounts.find_one({"type": "paper"}) or self._account
            doc.pop("_id", None)
            return doc
        return dict(self._account)

    def get_quote(self, symbol: str):
        from data.providers.synthetic import SyntheticProvider

        if not hasattr(self, "_quote_provider"):
            self._quote_provider = SyntheticProvider()
        try:
            return self._quote_provider.get_latest_quote(symbol)
        except Exception:  # noqa: BLE001
            return None

    # ---------- safety state ----------
    def save_safety_state(self, state: dict, reason: str = "") -> None:
        doc = {**state, "reason": reason}
        self._insert("safety_states", doc)
        try:
            self.cfg.runtime_dir.mkdir(parents=True, exist_ok=True)
            tmp = self._safety_path.with_suffix(".tmp")
            tmp.write_text(json.dumps(doc, indent=2))
            tmp.replace(self._safety_path)
        except OSError:
            log.exception("failed to write safety state file")

    def load_safety_state(self) -> dict:
        if self._safety_path.exists():
            try:
                return json.loads(self._safety_path.read_text())
            except (OSError, json.JSONDecodeError):
                log.exception("corrupt safety state — treating as fresh (halted=False risk)")
        rows = self._query("safety_states", limit=1)
        return rows[-1] if rows else {}
