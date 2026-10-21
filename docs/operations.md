# Operations Runbook

## Service
```bash
sudo systemctl status tradeoracle
sudo systemctl restart tradeoracle
journalctl -u tradeoracle -f
```

## Modes
`RESEARCH → BACKTEST → PAPER → DEMO → LIVE` plus `HALTED`.
Mode changes go through the dashboard (two-step confirm for LIVE) and are
enforced by the engine, not the UI. The engine refuses a LIVE start without a
broker adapter and explicit confirmation.

## Emergency stop
1. Dashboard → Engine → **E-STOP** (or `POST /api/v1/engine/commands {"command":"EMERGENCY_STOP"}`).
2. Engine halts new risk, flattens paper positions, persists `halted=true`.
3. Resume requires OWNER + explicit confirmation; every step is audited.

## Common issues
| Symptom | Check | Fix |
|---|---|---|
| Heartbeat stale | `journalctl -u tradeoracle` | restart service; verify MONGODB_URI |
| All signals rejected | data freshness + session filter | `MARKET_DATA_PROVIDER`, clock/TZ |
| Orders stuck UNKNOWN | broker adapter log | `RECONCILE_BROKER_STATE` command |
| Dashboard shows SIMULATED | API health / CORS | deploy API; check `/api/v1/health` |

## Upgrades
1. `git pull` into `/opt/tradeoracle`, `pip install -r requirements.txt`
2. `systemctl restart tradeoracle` — safety state reloads automatically
3. Run `node database/indexes.js` if schema indexes changed
