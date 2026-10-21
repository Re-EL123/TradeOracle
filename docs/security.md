# Security Notes

- Secrets (`MONGODB_URI`, `SESSION_SECRET`, `ENGINE_WORKER_TOKEN`) exist only in
  server env / `engine.env` (chmod 600). They are never sent to the browser and
  never committed.
- Session cookies: httpOnly, Secure, SameSite=Strict, HMAC-signed, 12h expiry,
  timing-safe signature comparison.
- Engine heartbeats require a shared token; user endpoints require a session.
- All mutations write an `audit_logs` entry (action, actor, detail, timestamp).
- Input validation is allow-list based (symbols, timeframes, numeric bounds,
  command whitelist). Unknown fields are rejected or stripped.
- API responses set `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`.
- CORS restricted to configured origins.
- The AI layer has read-only access: no order placement, no risk changes, no
  halt dismissal. Any "AI recommendation" is stored as annotation only.
