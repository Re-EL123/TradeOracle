# TradeOracle — Architecture

Three independent deployment units. The engine never trusts the dashboard; the
dashboard never bypasses the risk engine; the AI layer never has execution authority.

```
┌───────────────────┐     HTTPS /api/v1      ┌───────────────────┐
│  Frontend (SPA)   │ ◄────────────────────► │  API (Vercel)     │
│  GitHub Pages     │   {success,data,error} │  ≤12 functions    │
└───────────────────┘                        └─────────┬─────────┘
                                                       │ MongoDB
┌───────────────────┐   heartbeats/commands            │
│  Engine (Python)  │ ◄───────────────────────────────►│
│  systemd on VM    │   safety state persisted         │
└───────────────────┘
```

## Frontend
- Vanilla ES modules, no build step. Hash router, dark-first design system.
- `assets/js/api.js` labels any fallback data `SIMULATED` — never fake live values.
- E-STOP button posts `EMERGENCY_STOP` through the API command queue.

## API (`api/`)
- Vercel serverless, Node 20+, shared `lib/` (auth, database, validation,
  permissions, responses). Response envelope is always
  `{ success, data, error: {code,message}, requestId }`.
- Mutations require an OWNER session; engine writes use `X-Engine-Token`.
- The API **never** talks to a broker. Manual orders go through the engine
  command queue so the risk engine always evaluates them.

## Engine (`trading-engine/`)
- Long-running Python worker (`python -m main`), one orchestrator loop.
- Pipeline per cycle: collect → validate → normalize → indicators → structure
  → regime → session filter → strategies → scoring → **risk engine** →
  execution state machine → paper broker → persistence → notifications.
- Risk engine is independent and mandatory; any failure ⇒ no new risk
  (fail-closed). Halted state persists to `runtime/safety_state.json` and MongoDB.

## Backtesting (`backtesting/`)
- Same strategy + risk interfaces as live. Chronological replay, no look-ahead,
  costs applied on entry and exit, conservative SL-before-TP fill, full config
  snapshot in every report for reproducibility.

## Safety invariants (non-negotiable)
1. AI never executes orders, cancels stops, or disables risk controls.
2. No naked orders — SL and TP required before submission.
3. Single-user manual intervention requires two confirmations (UI + API).
4. Unknown order states are treated as active risk until reconciled.
5. Engine is a separate process; dashboard downtime cannot block emergency stop
   (stop also enforced locally at the engine).
