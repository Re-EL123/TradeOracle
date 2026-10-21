from risk.sizing import position_size


def test_basic_sizing_eurusd():
    # equity 100k, 0.25% → risk budget 250
    # EURUSD stop 40 pips, pip value 10/lot → risk/lot 400 → 0.625 lots → floor to 0.62
    r = position_size(equity=100_000, risk_pct=0.25, entry=1.1642, stop=1.1602, symbol="EURUSD")
    assert r is not None
    assert r.volume == 0.62
    assert abs(r.risk_amount - 248.0) < 1.0


def test_unknown_symbol_fails_closed():
    assert position_size(100_000, 0.25, 1.0, 0.99, "EXOTICXYZ") is None


def test_zero_stop_fails():
    assert position_size(100_000, 0.25, 1.0, 1.0, "EURUSD") is None


def test_min_volume_floor():
    r = position_size(equity=1_000, risk_pct=0.1, entry=1.1642, stop=1.10, symbol="EURUSD")
    assert r is None  # computed volume below 0.01 min → reject rather than oversize


def test_jpy_pip_value():
    r = position_size(equity=100_000, risk_pct=0.25, entry=151.5, stop=151.0, symbol="USDJPY")
    assert r is not None
    assert r.volume > 0
