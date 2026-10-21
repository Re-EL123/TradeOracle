"""Backtest performance metrics (§17.3). All metrics interpreted together."""
from __future__ import annotations

import math
from dataclasses import dataclass, field


@dataclass
class Trade:
    symbol: str
    direction: str
    volume: float
    entry_price: float
    exit_price: float
    entry_time: object
    exit_time: object
    pnl: float
    commission: float = 0.0


@dataclass
class Metrics:
    net_return_pct: float = 0.0
    gross_profit: float = 0.0
    gross_loss: float = 0.0
    profit_factor: float | None = None
    win_rate: float | None = None
    expectancy: float | None = None
    max_drawdown_pct: float = 0.0
    avg_drawdown_pct: float = 0.0
    sharpe: float | None = None
    sortino: float | None = None
    trades: int = 0
    avg_duration_hours: float | None = None
    long_count: int = 0
    short_count: int = 0
    long_pnl: float = 0.0
    short_pnl: float = 0.0
    cost_total: float = 0.0
    equity_curve: list[float] = field(default_factory=list)
    drawdown_curve: list[float] = field(default_factory=list)


def compute_metrics(trades: list[Trade], initial_capital: float, periods_per_year: float = 252.0) -> Metrics:
    m = Metrics(trades=len(trades))
    if not trades:
        return m

    pnls = [t.pnl - t.commission for t in trades]
    m.gross_profit = sum(p for p in pnls if p > 0)
    m.gross_loss = abs(sum(p for p in pnls if p < 0))
    m.net_return_pct = sum(pnls) / initial_capital * 100
    m.profit_factor = (m.gross_profit / m.gross_loss) if m.gross_loss > 0 else None
    wins = [p for p in pnls if p > 0]
    m.win_rate = len(wins) / len(pnls) * 100
    m.expectancy = sum(pnls) / len(pnls)
    m.long_count = sum(1 for t in trades if t.direction == "LONG")
    m.short_count = len(trades) - m.long_count
    m.long_pnl = sum(p for t, p in zip(trades, pnls) if t.direction == "LONG")
    m.short_pnl = sum(p for t, p in zip(trades, pnls) if t.direction == "SHORT")
    m.cost_total = sum(t.commission for t in trades)

    durations = []
    for t in trades:
        try:
            durations.append((t.exit_time - t.entry_time).total_seconds() / 3600)
        except Exception:  # noqa: BLE001
            pass
    if durations:
        m.avg_duration_hours = sum(durations) / len(durations)

    # Equity / drawdown
    equity = initial_capital
    peak = equity
    max_dd = 0.0
    dds: list[float] = []
    curve = [equity]
    for p in pnls:
        equity += p
        curve.append(equity)
        peak = max(peak, equity)
        dd = (equity - peak) / peak * 100 if peak else 0.0
        dds.append(dd)
        max_dd = min(max_dd, dd)
    m.equity_curve = curve
    m.drawdown_curve = dds
    m.max_drawdown_pct = max_dd
    m.avg_drawdown_pct = sum(dds) / len(dds) if dds else 0.0

    # Risk-adjusted (per-trade returns, annualised with periods_per_year)
    mean = sum(pnls) / len(pnls)
    var = sum((p - mean) ** 2 for p in pnls) / max(1, len(pnls) - 1)
    sd = math.sqrt(var)
    if sd > 0:
        m.sharpe = (mean / sd) * math.sqrt(periods_per_year)
    downside = [min(0.0, p) for p in pnls]
    dvar = sum(d**2 for d in downside) / max(1, len(downside) - 1)
    dsd = math.sqrt(dvar)
    if dsd > 0:
        m.sortino = (mean / dsd) * math.sqrt(periods_per_year)
    return m
