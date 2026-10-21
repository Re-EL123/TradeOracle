"""Risk engine — independent, mandatory layer (§9).

A strategy proposes; risk decides. Enforced regardless of frontend,
AI availability, or strategy behaviour. Fails closed.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone

from risk.sizing import position_size

log = logging.getLogger("tradeoracle.risk")


@dataclass
class RiskDecision:
    approved: bool
    reason: str = ""
    volume: float = 0.0
    risk_amount: float = 0.0


class RiskEngine:
    def __init__(self, cfg, store) -> None:
        self.cfg = cfg
        self.store = store
        self.mode = cfg.trading_mode
        self.halted = False
        self.halt_reason: str | None = None
        self.daily_loss = 0.0
        self.peak_equity = 0.0
        self.equity = 0.0
        self.consecutive_losses = 0
        self.blocked_reason: str | None = None
        self._orders_this_hour: list[datetime] = []

    # ---------- persistence ----------
    def restore(self, state: dict) -> None:
        self.mode = state.get("mode", self.mode)
        self.halted = bool(state.get("halted", False))
        self.halt_reason = state.get("halt_reason")
        self.daily_loss = float(state.get("daily_loss", 0.0))
        self.peak_equity = float(state.get("peak_equity", 0.0))
        self.equity = float(state.get("equity", 0.0))
        self.consecutive_losses = int(state.get("consecutive_losses", 0))
        log.info("risk.state.restored halted=%s daily_loss=%.2f", self.halted, self.daily_loss)

    def snapshot(self) -> dict:
        return {
            "mode": self.mode,
            "halted": self.halted,
            "halt_reason": self.halt_reason,
            "daily_loss": self.daily_loss,
            "peak_equity": self.peak_equity,
            "equity": self.equity,
            "consecutive_losses": self.consecutive_losses,
            "saved_at": datetime.now(timezone.utc).isoformat(),
        }

    # ---------- controls ----------
    def halt(self, reason: str) -> None:
        self.halted = True
        self.halt_reason = reason
        self.mode = "HALTED"
        log.warning("risk.halt reason=%s", reason)
        self.store.save_risk_event("EMERGENCY_STOP", reason)

    def resume(self, authorised: bool) -> bool:
        if not authorised:
            return False
        self.halted = False
        self.halt_reason = None
        self.mode = self.cfg.trading_mode
        log.info("risk.resume mode=%s", self.mode)
        self.store.save_risk_event("RESUME", f"resumed to {self.mode}")
        return True

    def block_entries(self, reason: str) -> None:
        self.blocked_reason = reason
        log.warning("risk.block_entries reason=%s", reason)

    # ---------- evaluation ----------
    def evaluate_proposal(self, cand, ctx) -> RiskDecision:
        r = self.cfg.risk

        if self.halted or self.mode == "HALTED":
            return self._reject(cand, "emergency stop active")

        if self.blocked_reason:
            return self._reject(cand, f"entries blocked: {self.blocked_reason}")

        if self.mode not in {"PAPER", "DEMO", "LIVE"}:
            return self._reject(cand, f"mode {self.mode} does not permit execution")

        if self.consecutive_losses >= r.max_consecutive_losses:
            return self._reject(cand, f"max consecutive losses ({r.max_consecutive_losses}) reached")

        account = self.store.get_account()
        self.equity = float(account.get("equity", 0.0))
        self.peak_equity = max(self.peak_equity, self.equity)
        if self.equity <= 0:
            return self._reject(cand, "equity unavailable — fail closed")

        # Drawdown gate
        if self.peak_equity > 0:
            dd_pct = (self.peak_equity - self.equity) / self.peak_equity * 100
            if dd_pct >= r.max_drawdown_pct:
                self.halt(f"max drawdown {dd_pct:.2f}% ≥ {r.max_drawdown_pct}%")
                return self._reject(cand, "max drawdown breached")

        # Daily loss gate
        daily_pct = abs(self.daily_loss) / self.equity * 100 if self.daily_loss < 0 else 0.0
        if daily_pct >= r.max_daily_loss_pct:
            self.block_entries(f"daily loss {daily_pct:.2f}% ≥ {r.max_daily_loss_pct}%")
            return self._reject(cand, "daily loss limit reached")

        # Position count
        open_positions = self.store.open_positions()
        if len(open_positions) >= r.max_positions:
            return self._reject(cand, f"max positions ({r.max_positions}) reached")
        if any(p.get("symbol") == cand.symbol for p in open_positions):
            return self._reject(cand, "position already open on instrument")

        # Aggregate open risk
        open_risk = sum(float(p.get("risk_amount", 0.0)) for p in open_positions)
        if self.equity and open_risk / self.equity * 100 >= r.max_open_risk_pct:
            return self._reject(cand, "aggregate open risk cap reached")

        # Spread
        pip = 0.01 if "JPY" in cand.symbol else 0.0001
        quote = self.store.get_quote(cand.symbol)
        if quote is not None:
            spread_pips = quote.spread / pip
            if spread_pips > r.max_spread_pips:
                return self._reject(cand, f"spread {spread_pips:.1f} pips > {r.max_spread_pips}")

        # R:R
        if cand.rr is None or cand.rr < r.min_rr:
            return self._reject(cand, f"R:R {cand.rr} below minimum {r.min_rr}")

        # Order rate
        now = datetime.now(timezone.utc)
        self._orders_this_hour = [t for t in self._orders_this_hour if (now - t).total_seconds() < 3600]
        if len(self._orders_this_hour) >= r.max_orders_per_hour:
            return self._reject(cand, "order rate limit reached")

        # Sizing
        sizing = position_size(
            equity=self.equity,
            risk_pct=r.risk_per_trade_pct,
            entry=cand.entry,
            stop=cand.stop_loss,
            symbol=cand.symbol,
            account_currency="ZAR",
        )
        if sizing is None:
            return self._reject(cand, "position sizing could not be validated")

        self._orders_this_hour.append(now)
        self.store.save_risk_event("APPROVED", f"{cand.symbol} {cand.direction} volume={sizing.volume}")
        return RiskDecision(approved=True, volume=sizing.volume, risk_amount=sizing.risk_amount)

    def _reject(self, cand, reason: str) -> RiskDecision:
        log.info("risk.reject %s %s: %s", cand.symbol, cand.direction, reason)
        self.store.save_risk_event("REJECTED", f"{cand.symbol} {cand.direction}: {reason}")
        return RiskDecision(approved=False, reason=reason)

    # ---------- accounting hooks ----------
    def record_trade_result(self, pnl: float) -> None:
        if pnl < 0:
            self.daily_loss += pnl
            self.consecutive_losses += 1
        else:
            self.consecutive_losses = 0
        self.equity += pnl
        self.peak_equity = max(self.peak_equity, self.equity)
