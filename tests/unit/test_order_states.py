import pytest

from execution.state_machine import OrderState, InvalidTransition


def make_order():
    return OrderState(
        order_id="ORD-1", symbol="EURUSD", direction="LONG",
        order_type="MARKET", requested_volume=0.10,
    )


def test_happy_path():
    o = make_order()
    o.transition("VALIDATED")
    o.transition("SUBMITTING")
    o.transition("ACCEPTED")
    o.apply_fill(0.10, 1.16420)
    assert o.state == "FILLED"
    o.transition("POSITION_OPEN")
    o.transition("CLOSED")
    assert len(o.history) == 6


def test_invalid_transition_raises():
    o = make_order()
    with pytest.raises(InvalidTransition):
        o.transition("FILLED")


def test_unknown_then_fill():
    o = make_order()
    o.transition("VALIDATED")
    o.transition("SUBMITTING")
    o.transition("UNKNOWN", reason="timeout")
    assert o.error == "timeout"
    o.transition("FILLED")  # reconciliation proves fill
    assert o.state == "FILLED"


def test_partial_fill():
    o = make_order()
    for s in ("VALIDATED", "SUBMITTING", "ACCEPTED"):
        o.transition(s)
    o.apply_fill(0.04, 1.1640)
    assert o.state == "PARTIALLY_FILLED"
    o.apply_fill(0.06, 1.1644)
    assert o.state == "FILLED"
    assert abs(o.average_fill_price - 1.16424) < 1e-5


def test_idempotency_key_stable():
    o = make_order()
    assert o.idempotency_key == "ORD-1:EURUSD:0.1"
