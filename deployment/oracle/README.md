# TradeOracle Oracle VM Deployment

## Prerequisites
- Ubuntu 22.04/24.04 VM on Oracle Cloud with a public IP
- Domain pointing A/AAAA record at the VM (for TLS via Caddy or nginx + certbot)
- MongoDB Atlas (or a self-hosted mongod) reachable from the VM

## Steps

### 1. Create the service user and directories
```bash
sudo useradd -r -m -d /opt/tradeoracle tradeoracle
sudo mkdir -p /opt/tradeoracle/{trading-engine,venv,runtime} /var/log/tradeoracle
sudo chown -R tradeoracle:tradeoracle /opt/tradeoracle /var/log/tradeoracle
```

### 2. Install the engine
```bash
sudo -u tradeoracle python3 -m venv /opt/tradeoracle/venv
sudo -u tradeoracle /opt/tradeoracle/venv/bin/pip install -r /opt/tradeoracle/trading-engine/requirements.txt
# copy trading-engine/ contents into /opt/tradeoracle/trading-engine/
```

### 3. Configure environment
```bash
sudo cp deployment/oracle/engine.env.example /opt/tradeoracle/deployment/oracle/engine.env
sudo chmod 600 /opt/tradeoracle/deployment/oracle/engine.env
sudo -u tradeoracle ${EDITOR:-nano} /opt/tradeoracle/deployment/oracle/engine.env
```

### 4. Install the systemd unit
```bash
sudo cp deployment/oracle/tradeoracle.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now tradeoracle
sudo systemctl status tradeoracle
journalctl -u tradeoracle -f
```

### 5. Verify fail-safe behaviour
- Set `TRADING_MODE=RESEARCH`, confirm the heartbeat appears in MongoDB `engine_heartbeats`.
- Trigger `EMERGENCY_STOP` from the dashboard; confirm `halted=true` persists across a restart (`runtime/safety_state.json` + MongoDB).
- Confirm engine refuses to start in `LIVE` without a broker adapter and an explicit confirmation env var.

### 6. TLS for the API/dashboard
Frontend (GitHub Pages) is already HTTPS. The Vercel API is HTTPS by default.
If you host the API yourself behind Caddy:

```
api.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

### 7. Backups
- MongoDB Atlas provides continuous backups. For self-hosted: `mongodump` nightly to object storage.
- `runtime/safety_state.json` should be included in any filesystem backup.

## Runbook quick links
- Logs: `journalctl -u tradeoracle -f`
- Mode change: dashboard → Engine → Mode (engine restarts cleanly between modes)
- Data source: `MARKET_DATA_PROVIDER=synthetic` for paper/dev; real broker provider when live
