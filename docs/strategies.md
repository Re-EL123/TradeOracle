# Strategies

Both strategies implement `strategies/base.py` (`name`, `version`,
`applies_to(symbol)`, `evaluate(ctx) -> list[SignalCandidate]`).

## Trend Pullback (`trend_pullback`)
- Uptrend: EMA20 > EMA50, price above EMA50, ADX ≥ 20, RSI in 40–65.
- Entry on pullback to EMA20 with bullish confirmation candle; SL beyond the
  pullback swing + ATR buffer; TP at RR ≥ 2 (or structure target).
- Mirror logic for shorts. Blocked in high-volatility spike and news blackout.

## Breakout Retest (`breakout_retest`)
- Identifies structure from `structure/swings.py` (swing clusters + BOS).
- Waits for close beyond the level, then the retest; enters on retest hold.
- SL beyond the retest swing; TP at RR ≥ 1.8 or next structure.

## Signal lifecycle
`draft → validated → scored → pending_approval → approved → executed / rejected`
— with optional AI commentary that can **annotate** but never override
`score`, `rejection_reason`, or a risk rejection. Hard rejections (invalid SL/TP,
out-of-session, blacklisted symbol, risk veto) are terminal and never overridden.

## Backtests
Runs reuse the exact same strategy code with `backtesting/simulator.py`
(chronological replay, costs, conservative fills). Reports include the full
config snapshot; results are labelled estimates, not predictions.
