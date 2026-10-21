# Risk Policy

All values are configurable but bounded; the engine re-validates every request.

| Control | Default | Hard bound |
|---|---|---|
| Risk per trade | 0.25% equity | ≤ 2% |
| Daily loss limit | 1.0% equity | ≤ 10% |
| Max open positions | 2 | ≤ 10 |
| Max daily trades | 20 | ≤ 200 |
| Max weekly drawdown | 5% | ≤ 25% |
| Min risk:reward | 1.5 | — |

## Engine enforcement
- `risk/engine.py` runs after every strategy candidate and before every order
  submission. No code path may submit without an `RiskDecision`.
- Breaching the daily loss limit halts new entries for the rest of the UTC day.
- Breaching the weekly drawdown or tripping E-STOP switches mode to `HALTED`
  and requires an explicit human resume (two confirmations).
- Broker rejection or UNKNOWN order state ⇒ no new risk until reconciled.

## Position sizing
`risk/sizing.py`: `volume = risk_budget / (stop_pips × pip_value)`, rounded down
to the broker minimum (0.01). Unknown symbols, zero stops, or computed volume
below minimum ⇒ reject (fail closed, never oversize).
