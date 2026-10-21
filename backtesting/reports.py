"""Backtest report assembly — includes full config snapshot for reproducibility."""
from __future__ import annotations

from datetime import datetime, timezone


def build_report(strategy, cfg, metrics, trades, data_source: str, period_start, period_end) -> dict:
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "strategy": {"name": strategy.name, "version": strategy.version},
        "config": {
            "symbol": cfg.symbol,
            "timeframe": cfg.timeframe,
            "initial_capital": cfg.initial_capital,
            "risk_per_trade_pct": cfg.risk_per_trade_pct,
            "spread_pips": cfg.costs.spread_pips,
            "commission_per_lot_side": cfg.costs.commission_per_lot_side,
            "slippage_pips": cfg.costs.slippage_pips,
            "min_rr": cfg.min_rr,
            "max_positions": cfg.max_positions,
        },
        "data": {"source": data_source, "start": str(period_start), "end": str(period_end)},
        "metrics": {
            "net_return_pct": metrics.net_return_pct,
            "profit_factor": metrics.profit_factor,
            "win_rate": metrics.win_rate,
            "expectancy": metrics.expectancy,
            "max_drawdown_pct": metrics.max_drawdown_pct,
            "sharpe": metrics.sharpe,
            "sortino": metrics.sortino,
            "trades": metrics.trades,
            "avg_duration_hours": metrics.avg_duration_hours,
            "long_pnl": metrics.long_pnl,
            "short_pnl": metrics.short_pnl,
            "cost_total": metrics.cost_total,
        },
        "equity_curve": metrics.equity_curve,
        "drawdown_curve": metrics.drawdown_curve,
        "trade_count": len(trades),
        "disclaimer": "Backtest results are estimates, not predictions of future profitability.",
    }
