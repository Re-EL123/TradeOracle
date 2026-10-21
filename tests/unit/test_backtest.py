from datetime import datetime, timedelta, timezone

from data.models import Candle
from backtesting.simulator import Simulator, SimConfig
from backtesting.costs import CostModel
from backtesting.metrics import Trade, compute_metrics
from backtesting.validation import validate_run


class AlwaysLong:
    """Test double: emits one long candidate per evaluation once warmed up."""
    name = "always_long"
    version = "0.0.1"

    def applies_to(self, symbol):
        return True

    def evaluate(self, ctx):
        from strategies.base import SignalCandidate

        i = ctx.i
        if i < 61:
            return []
        price = ctx.close[-1]
        return [
            SignalCandidate(
                symbol=ctx.symbol, timeframe=ctx.timeframe, direction="LONG",
                strategy=self.name, strategy_version=self.version,
                entry=price, stop_loss=price * 0.995, take_profit=price * 1.01,
            )
        ]


def _candles(n=200, upward=True):
    base = datetime(2026, 1, 1, tzinfo=timezone.utc)
    out = []
    price = 1.10
    for i in range(n):
        price *= 1.0008 if upward else 0.9992
        wiggle = 0.0004 if i % 2 == 0 else -0.0004
        out.append(
            Candle("EURUSD", "H1", base + timedelta(hours=i),
                   open=price, high=price + 0.0006, low=price - 0.0006,
                   close=price + wiggle, volume=100)
        )
    # ensure high/low consistency
    return [
        Candle(c.symbol, c.timeframe, c.timestamp,
               open=round(c.open, 6), high=round(max(c.open, c.close) + 0.0005, 6),
               low=round(min(c.open, c.close) - 0.0005, 6), close=round(c.close, 6), volume=100)
        for c in out
    ]


def test_simulator_runs_and_charges_costs():
    sim = Simulator(SimConfig(symbol="EURUSD", timeframe="H1", costs=CostModel(spread_pips=1.0)))
    metrics, trades = sim.run(AlwaysLong(), _candles(200, upward=True))
    assert metrics.trades == len(trades)
    if trades:
        assert trades[0].commission > 0


def test_no_trades_below_strategy_threshold():
    sim = Simulator(SimConfig(symbol="EURUSD", timeframe="H1"))
    # 61 candles → loop only reaches i=60; AlwaysLong requires i >= 61
    metrics, trades = sim.run(AlwaysLong(), _candles(61))
    assert metrics.trades == 0


def test_integrity_report_flags_bad_trades():
    base = datetime(2026, 1, 1, tzinfo=timezone.utc)
    candles = _candles(80)
    bad = [Trade("EURUSD", "LONG", 0.1, 1.0, 1.1, base + timedelta(hours=5), base + timedelta(hours=4), 10, 0)]
    report = validate_run(bad, candles)
    assert not report.ok


def test_metrics_win_rate():
    base = datetime(2026, 1, 1, tzinfo=timezone.utc)
    trades = [
        Trade("EURUSD", "LONG", 0.1, 1.0, 1.01, base, base + timedelta(hours=1), 100, 5),
        Trade("EURUSD", "SHORT", 0.1, 1.0, 1.01, base, base + timedelta(hours=1), -80, 5),
        Trade("EURUSD", "LONG", 0.1, 1.0, 1.01, base, base + timedelta(hours=1), 120, 5),
    ]
    m = compute_metrics(trades, 100_000)
    assert m.trades == 3
    assert abs(m.win_rate - 200 / 3) < 1e-6
    # net of commission: 100-5=95 win, -80-5=-85 loss, 120-5=115 win
    assert m.gross_profit == 210
    assert m.gross_loss == 85
    assert abs(m.profit_factor - 210 / 85) < 1e-9
    assert m.max_drawdown_pct <= 0
