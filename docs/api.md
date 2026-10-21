# API Reference

Base URL: `https://<deployment>/api/v1` — every response uses the envelope:

```json
{ "success": true, "data": { }, "error": null, "requestId": "uuid" }
```

Errors: `success=false`, `error: { code, message, details }`. Codes:
`UNAUTHENTICATED`, `FORBIDDEN`, `VALIDATION_ERROR`, `NOT_FOUND`, `CONFLICT`,
`METHOD_NOT_ALLOWED`, `RATE_LIMITED`, `INTERNAL`.

## Auth
- Browser: signed httpOnly `to_session` cookie (OWNER/ANALYST/VIEWER roles).
- Engine worker: `X-Engine-Token` header for heartbeat ingestion only.
- Role checks are always server-side; hiding UI is not access control.

## Endpoints

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/health` | public | liveness + dependency checks |
| GET | `/engine/status` | viewer | mode, halt state, last heartbeat |
| GET | `/engine/commands` | owner | pending commands (engine polls) |
| POST | `/engine/commands` | owner | validated command whitelist |
| POST | `/engine/heartbeats` | worker | X-Engine-Token only |
| GET | `/markets/instruments` | viewer | configured instruments |
| GET | `/markets/quotes` | viewer | latest quotes, `live` flag |
| GET | `/markets/candles/{symbol}/{tf}` | viewer | limit ≤ 2000 |
| GET | `/markets/status` | viewer | session status |
| GET | `/signals` | viewer | filter: symbol, status, min_score |
| PATCH | `/signals?id=` | owner | ACKNOWLEDGED/DISMISSED/EXECUTED/EXPIRED |
| GET | `/strategies` | viewer | merged builtin + overrides |
| GET | `/strategies?id=` | viewer | single strategy |
| PATCH | `/strategies?id=` | owner | enable/disable + numeric params only |
| GET | `/backtests` | viewer | recent runs |
| GET | `/backtests?id=` | viewer | full report + integrity block |
| POST | `/backtests` | owner | queued via engine command |
| GET | `/positions` | viewer | open positions |
| DELETE | `/positions?id=` | owner | close request → engine queue |
| GET | `/orders` | viewer | order states incl. UNKNOWN |
| POST | `/orders` | owner | manual order → engine queue (never direct broker) |
| GET | `/trades` | viewer | closed trades |
| GET | `/risk/summary` | viewer | mode, halt, daily loss |
| GET | `/risk/settings` | viewer | current bounds |
| PUT | `/risk/settings` | owner | bounded updates + audit log |
| GET | `/analytics/performance` | viewer | PF, win rate, expectancy, by-strategy |

## Manual order safety
`POST /orders` requires `direction`, `volume`, `stop_loss`, `take_profit` —
naked orders are rejected. The order is queued for the engine so the risk
engine evaluates it like any other signal.
