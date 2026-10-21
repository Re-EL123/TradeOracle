# TradeOracle Frontend

Static SPA (vanilla ES modules) hosted on **GitHub Pages**. Talks only to the Vercel API — never MongoDB or broker credentials.

## Structure

```
frontend/
├── index.html                  # shell: sidebar, topbar, outlet
├── manifest.webmanifest
└── assets/
    ├── css/ tokens · base · layout · components · responsive
    ├── js/
    │   ├── app.js              # shell, navigation, engine polling
    │   ├── router.js           # hash router + poller teardown
    │   ├── api.js              # API client + labelled SIMULATED fallback
    │   ├── state.js            # store + formatters
    │   ├── charts.js           # Lightweight Charts + canvas sparklines
    │   ├── ui.js               # icons, toasts, modal, states, badges
    │   └── pages/              # one module per screen (15 screens)
    └── images/logo.png         # TradeOracle — Eye of Market Growth
```

## Behaviour

- **Data honesty:** every table/card carries its source. If the API is unreachable the UI switches to a clearly labelled `SIMULATED` dataset — never fake "live" values.
- **Mode visibility:** the topbar mode pill (RESEARCH/BACKTEST/PAPER/DEMO/LIVE/HALTED) is always visible and unmistakable. LIVE is visually distinct.
- **Emergency stop:** global E-STOP button → confirmation modal → authorised engine command → audit.
- **Responsive:** persistent sidebar on desktop, drawer on ≤1024px, metric grid collapses at 720px.
- **States:** loading skeletons, empty, stale, offline and error states on every data surface.

## Local dev

```bash
python3 -m http.server 8080
# http://localhost:8080
```

Set `window.__TRADEORACLE_CONFIG__.apiBase` (or env-specific override) to point at the Vercel API.

## Deploy (GitHub Pages)

1. Push `frontend/` contents (or the repo) to GitHub.
2. Enable Pages on the branch/folder.
3. Set the production `apiBase` in `index.html`.
4. Verify routing (`#/overview`) and API connectivity.
