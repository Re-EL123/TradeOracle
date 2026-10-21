"""Backtest simulator — chronological replay with the same strategy/risk
interfaces as the live worker (§17.1).

Integrity rules enforced:
  * Only completed candles are visible to the strategy at each step.
  * No look-ahead: indicators recomputed on the prefix [0..i].
  * Costs applied on entry and exit.
  * Conservative SL/TP conflict: if both levels fall inside one candle,
    the stop is assumed to fill first.
  * Duplicate entries suppressed per candle per symbol.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from backtesting.costs import CostModel
from backtesting.metrics import Trade, compute_metrics, Metrics
from indicators.core import IndicatorEngine
from structure.swings import StructureEngine
from regime.classifier import RegimeClassifier
from risk.sizing import position_size


@dataclass
class SimConfig:
    symbol: str
    timeframe: str
    initial_capital: float = 100_000.0
    risk_per_trade_pct: float = 0.25
    costs: CostModel = field(default_factory=CostModel)
    max_positions: int = 1
    min_rr: float = 1.5


class Simulator:
    """Replays candles through a Strategy instance and risk sizing."""

    def __init__(self, cfg: SimConfig) -> None:
        self.cfg = cfg
        self.indicators = IndicatorEngine()
        self.structure = StructureEngine()
        self.regime = RegimeClassifier()

    def run(self, strategy, candles: list) -> tuple[Metrics, list[Trade]]:
        cfg = self.cfg
        equity = cfg.initial_capital
        open_trade: dict | None = None
        trades: list[Trade] = []
        # Warm-up so EMA50 etc. exist before the first evaluation
        warmup = 60

        for i in range(warmup, len(candles)):
            prefix = candles[: i + 1]
            bar = candles[i]

            # ---- manage open trade on this CLOSED candle ----
            if open_trade is not None:
                exit_info = self._check_exit(open_trade, bar)
                if exit_info:
                    price, reason = exit_info
                    exit_price = cfg.costs.apply_exit(cfg.symbol, price, open_trade["direction"])
                    pnl = self._pnl(open_trade, exit_price)
                    commission = cfg.costs.commission(open_trade["volume"])
                    trades.append(
                        Trade(
                            symbol=cfg.symbol,
                            direction=open_trade["direction"],
                            volume=open_trade["volume"],
                            entry_price=open_trade["entry"],
                            exit_price=exit_price,
                            entry_time=open_trade["entry_time"],
                            exit_time=bar.timestamp,
                            pnl=pnl,
                            commission=commission,
                        )
                    )
                    equity += pnl - commission
                    open_trade = None

            # ---- evaluate strategy on completed prefix ----
            ctx = self.indicators.build_context(cfg.symbol, cfg.timeframe, prefix)
            ctx.structure = self.structure.detect(prefix)
            ctx.regime = self.regime.classify(ctx)

            for cand in strategy.evaluate(ctx):
                if open_trade is not None:
                    break
                if cand.rr is None or cand.rr < cfg.min_rr:
                    continue
                sizing = position_size(
                    equity=equity,
                    risk_pct=cfg.risk_per_trade_pct,
                    entry=cand.entry,
                    stop=cand.stop_loss,
                    symbol=cfg.symbol,
                )
                if sizing is None:
                    continue
                entry_price = cfg.costs.apply_entry(cfg.symbol, cand.entry, cand.direction)
                open_trade = {
                    "direction": cand.direction,
                    "volume": sizing.volume,
                    "entry": entry_price,
                    "stop": cand.stop_loss,
                    "target": cand.take_profit,
                    "entry_time": bar.timestamp,
                }
                break

        # Force-close at the end (no open risk carried forward silently)
        if open_trade is not None:
            last = candles[-1]
            exit_price = cfg.costs.apply_exit(cfg.symbol, last.close, open_trade["direction"])
            pnl = self._pnl(open_trade, exit_price)
            commission = cfg.costs.commission(open_trade["volume"])
            trades.append(
                Trade(
                    symbol=cfg.symbol,
                    direction=open_trade["direction"],
                    volume=open_trade["volume"],
                    entry_price=open_trade["entry"],
                    exit_price=exit_price,
                    entry_time=open_trade["entry_time"],
                    exit_time=last.timestamp,
                    pnl=pnl,
                    commission=commission,
                )
            )
            equity += pnl - commission

        return compute_metrics(trades, cfg.initial_capital), trades

    def _pnl(self, open_trade: dict, exit_price: float) -> float:
        sign = 1 if open_trade["direction"] == "LONG" else -1
        return (exit_price - open_trade["entry"]) * sign * open_trade["volume"] * 100_000

    def _check_exit(self, open_trade: dict, bar):
        entry_dir = open_trade["direction"]
        stop, target = open_trade["stop"], open_trade["target"]
        if entry_dir == "LONG":
            stop_hit = bar.low <= stop
            tp_hit = bar.high >= target
        else:
            stop_hit = bar.high >= stop
            tp_hit = bar.low <= target
        if stop_hit:
            return stop, "SL"  # conservative when both hit
        if tp_hit:
            return target, "TP"
        return None
