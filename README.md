# TradeOracle — Eye of Market Growth

AI-assisted forex market analysis, strategy research, risk management, backtesting, and supervised automated trading.

> **Risk notice:** Trading foreign exchange involves substantial risk of loss. TradeOracle provides analysis and research tooling. Nothing produced by this system is financial advice, a guarantee of profit, or a validated win rate. Backtest and paper results are estimates, not predictions.

## Monorepo layout

| Path | Component | Stack | Host |
|---|---|---|---|
| `frontend/` | Dashboard (SPA) | Vanilla ES modules, CSS design system, Lightweight Charts | GitHub Pages |
| `api/` | Application API | Node.js serverless functions (≤12 functions, shared routers) | Vercel |
| `trading-engine/` | Persistent trading worker | Python 3.12+ | Oracle Cloud (`systemd`) |
| `backtesting/` | Historical replay + metrics | Python (shared strategy/risk interfaces) | OCI worker / local |
| `database/` | Schema + index definitions | MongoDB Atlas | Atlas |
| `deployment/` | systemd unit, ops runbooks | — | OCI |
| `tests/` | Unit + integration tests | pytest | CI |
| `docs/` | Architecture, API, risk, security, ops | Markdown | — |

## Architecture principles

1. The **Python engine runs independently** of the dashboard. Closing the browser never affects trading state.
2. The **risk engine is an independent, mandatory layer**. Strategies propose; risk decides. AI never bypasses risk.
3. One **strategy interface** is shared across backtest, paper, demo, and live.
4. The frontend talks **only to the API** — never to MongoDB or broker credentials.
5. The engine **fails closed**: if it cannot establish safe state, it does not trade.

## Operating modes

`RESEARCH → BACKTEST → PAPER → DEMO → LIVE` plus `HALTED` (emergency stop).

Live mode cannot be enabled by accident: it requires explicit authorisation, successful preflight checks, and confirmed account identity.

## Quick start (local)

```bash
# Frontend (static)
cd frontend && python3 -m http.server 8080
# open http://localhost:8080

# API (dev)
cd api && npm install && npx vercel dev

# Engine (paper mode, synthetic replay feed)
cd trading-engine
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m main            # starts orchestrator in PAPER mode

# Tests
python3 -m pytest ../tests -q
```

## Initial configuration (Phase-1 defaults)

| Setting | Value |
|---|---|
| Instruments | EUR/USD, GBP/USD, USD/JPY |
| Timeframes | M15, H1, H4 |
| Strategies | Trend-following pullback, Breakout & retest |
| Indicators | EMA, RSI, ATR, ADX + market structure |
| Mode | `PAPER` (execution disabled until broker + risk tests pass) |
| Risk per trade | 0.25% equity (configurable, bounded) |
| Max daily loss | 1% (hard block + audit) |
| Max concurrent positions | 2 |

## Documentation

- `docs/architecture.md` — system design and data flow
- `docs/api.md` — endpoint contract
- `docs/strategies.md` — strategy catalogue and lifecycle
- `docs/risk-policy.md` — mandatory limits and kill switch
- `docs/security.md` — auth, secrets, audit
- `docs/operations.md` — daily runbook and incident response

## Licence / usage

Private. Market-data and broker integrations must be licensed for the intended use before production ingestion.
