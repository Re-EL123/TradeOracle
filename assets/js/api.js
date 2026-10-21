/* API client — talks only to the Vercel API, never MongoDB/broker directly.
   Falls back to a clearly-labelled local simulation dataset when the API is
   unreachable (offline / pre-deploy). Simulated values are always tagged
   source: "SIMULATED" in the UI. */
import { state } from "./state.js";

let requestId = 0;

async function request(path, opts = {}) {
  const id = ++requestId;
  const url = `${state.apiBase}${path}`;
  const ctrl = new AbortController();
  const timeout = opts.timeout ?? 12000;
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      ...opts,
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        ...(opts.headers || {}),
      },
      credentials: "include",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(body?.error?.message || `HTTP ${res.status}`);
      err.code = body?.error?.code || `HTTP_${res.status}`;
      err.status = res.status;
      throw err;
    }
    state.set({ demoFallback: false });
    return body.data ?? body;
  } finally {
    clearTimeout(timer);
    void id;
  }
}

export const api = {
  get: (p, o) => request(p, o),
  post: (p, body, o) => request(p, { method: "POST", body: JSON.stringify(body), ...o }),
  patch: (p, body, o) => request(p, { method: "PATCH", body: JSON.stringify(body), ...o }),

  /* Typed endpoints */
  health: () => request("/health").catch(() => sim.health()),
  engineStatus: () => request("/engine/status").catch(() => sim.engineStatus()),
  engineCommand: (command, payload = {}) =>
    request("/engine/commands", { method: "POST", body: JSON.stringify({ command, payload }) }),
  markets: () => request("/markets").catch(() => sim.markets()),
  candles: (symbol, timeframe, limit = 300) =>
    request(`/markets/${symbol}/candles?timeframe=${timeframe}&limit=${limit}`).catch(() =>
      sim.candles(symbol, timeframe, limit)
    ),
  signals: (q = "") => request(`/signals${q}`).catch(() => sim.signals()),
  strategies: () => request("/strategies").catch(() => sim.strategies()),
  positions: () => request("/positions").catch(() => sim.positions()),
  orders: () => request("/orders").catch(() => sim.orders()),
  trades: () => request("/trades").catch(() => sim.trades()),
  riskSummary: () => request("/risk/summary").catch(() => sim.riskSummary()),
  performance: (range = "30d") => request(`/analytics/performance?range=${range}`).catch(() => sim.performance(range)),
  alerts: () => request("/alerts").catch(() => sim.alerts()),
  backtests: () => request("/backtests").catch(() => sim.backtests()),
};

/* ---------------- Local simulation (labelled, deterministic-ish) ---------------- */
function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SYMBOLS = [
  { symbol: "EURUSD", base: 1.1642, digits: 5 },
  { symbol: "GBPUSD", base: 1.3418, digits: 5 },
  { symbol: "USDJPY", base: 151.42, digits: 3 },
  { symbol: "AUDUSD", base: 0.6538, digits: 5 },
  { symbol: "USDCAD", base: 1.3721, digits: 5 },
  { symbol: "USDCHF", base: 0.7924, digits: 5 },
  { symbol: "NZDUSD", base: 0.5982, digits: 5 },
];

export const sim = {
  _meta: { source: "SIMULATED", note: "API unreachable — local simulation. Not live market data." },

  health() {
    return { status: "SIMULATED", uptimeSeconds: 0, source: this._meta.source };
  },

  engineStatus() {
    return {
      status: "OFFLINE",
      mode: "PAPER",
      lastHeartbeat: null,
      components: {},
      source: this._meta.source,
      message: "API unreachable — start the API or engine worker.",
    };
  },

  markets() {
    const now = Date.now();
    return SYMBOLS.map((s, i) => {
      const r = mulberry32(i * 977 + 13);
      const drift = (r() - 0.48) * 0.004;
      const bid = s.base * (1 + drift);
      const spreadPips = 0.4 + r() * 1.2;
      const pip = s.digits === 3 ? 0.01 : 0.0001;
      const ask = bid + spreadPips * pip;
      return {
        symbol: s.symbol,
        bid: +bid.toFixed(s.digits),
        ask: +ask.toFixed(s.digits),
        spreadPips: +spreadPips.toFixed(2),
        changePct: +((r() - 0.45) * 1.8).toFixed(3),
        trend: ["UPTREND", "RANGE", "DOWNTREND", "UPTREND", "RANGE"][i % 5],
        volatility: ["NORMAL", "HIGH", "LOW", "NORMAL", "ELEVATED"][i % 5],
        signal: i % 3 === 0 ? { direction: "LONG", score: 62 + i } : null,
        dataAgeMs: Math.floor(r() * 9000),
        session: ["LONDON", "NEWYORK", "ASIAN", "OVERLAP"][i % 4],
        updatedAt: new Date(now - Math.floor(r() * 9000)).toISOString(),
        source: this._meta.source,
      };
    });
  },

  candles(symbol, timeframe = "H1", limit = 300) {
    const meta = SYMBOLS.find((s) => s.symbol === symbol) || SYMBOLS[0];
    const r = mulberry32(symbol.length * 31 + timeframe.length * 7 + limit);
    const tfMs = { M5: 3e5, M15: 9e5, M30: 18e5, H1: 36e5, H4: 144e5, D1: 864e5 }[timeframe] || 36e5;
    const now = Math.floor(Date.now() / tfMs) * tfMs;
    let price = meta.base;
    const out = [];
    for (let i = limit - 1; i >= 0; i--) {
      const t = now - i * tfMs;
      const vol = meta.base * 0.0016;
      const open = price;
      const drift = (r() - 0.5) * vol * 2;
      const close = open + drift;
      const high = Math.max(open, close) + r() * vol * 0.7;
      const low = Math.min(open, close) - r() * vol * 0.7;
      out.push({
        time: t,
        open: +open.toFixed(meta.digits),
        high: +high.toFixed(meta.digits),
        low: +low.toFixed(meta.digits),
        close: +close.toFixed(meta.digits),
        volume: Math.round(400 + r() * 1800),
      });
      price = close;
    }
    return { symbol, timeframe, candles: out, source: this._meta.source };
  },

  signals() {
    const now = Date.now();
    const rows = [
      ["EURUSD", "LONG", "Trend Pullback", "H1", 74, "ELIGIBLE"],
      ["GBPUSD", "SHORT", "Breakout Retest", "H1", 68, "ELIGIBLE"],
      ["USDJPY", "LONG", "Trend Pullback", "H4", 61, "EVALUATING"],
      ["EURUSD", "SHORT", "Breakout Retest", "M15", 54, "REJECTED"],
      ["AUDUSD", "LONG", "Trend Pullback", "H1", 71, "EXPIRED"],
      ["USDCAD", "SHORT", "Breakout Retest", "H4", 66, "ELIGIBLE"],
    ];
    return rows.map((r, i) => ({
      id: `SIG-2026-${String(1042 + i)}`,
      timestamp: new Date(now - (i + 1) * 18e5).toISOString(),
      symbol: r[0], direction: r[1], strategy: r[2], timeframe: r[3],
      score: r[4], status: r[5],
      entry: +(1.1 + i * 0.03).toFixed(5),
      stopLoss: +(1.095 + i * 0.03).toFixed(5),
      takeProfit: +(1.112 + i * 0.03).toFixed(5),
      rr: +(1.6 + i * 0.1).toFixed(2),
      regime: i % 2 ? "RANGING" : "TRENDING",
      source: this._meta.source,
    }));
  },

  strategies() {
    return [
      { id: "trend-pullback", name: "Trend-Following Pullback", version: "1.2.0", state: "PAPER", instruments: ["EURUSD", "GBPUSD", "USDJPY"], timeframes: ["H1", "H4"], winRate: 47.8, profitFactor: 1.62, trades: 184, validation: "VALIDATED" },
      { id: "breakout-retest", name: "Breakout & Retest", version: "1.0.4", state: "TESTING", instruments: ["EURUSD", "GBPUSD"], timeframes: ["H1"], winRate: 41.2, profitFactor: 1.44, trades: 97, validation: "IN_REVIEW" },
      { id: "range-meanrev", name: "Range Mean Reversion", version: "0.4.0", state: "DRAFT", instruments: ["EURUSD"], timeframes: ["M15"], winRate: null, profitFactor: null, trades: 0, validation: "PENDING" },
    ];
  },

  positions() {
    return [
      { id: "POS-8841", symbol: "EURUSD", direction: "LONG", volume: 0.12, entry: 1.16080, current: 1.16465, stopLoss: 1.15720, takeProfit: 1.17120, pnl: 46.2, openedAt: new Date(Date.now() - 72e5).toISOString(), strategy: "Trend Pullback", source: this._meta.source },
      { id: "POS-8844", symbol: "USDJPY", direction: "SHORT", volume: 0.08, entry: 151.88, current: 151.42, stopLoss: 152.4, takeProfit: 150.7, pnl: 24.1, openedAt: new Date(Date.now() - 36e5).toISOString(), strategy: "Breakout Retest", source: this._meta.source },
    ];
  },

  orders() {
    return [
      { id: "ORD-5521", brokerId: null, symbol: "EURUSD", direction: "LONG", type: "MARKET", requestedVolume: 0.12, filledVolume: 0.12, requestedPrice: 1.1608, fillPrice: 1.16084, state: "FILLED", createdAt: new Date(Date.now() - 72e5).toISOString(), error: null, source: this._meta.source },
      { id: "ORD-5529", brokerId: null, symbol: "GBPUSD", direction: "SHORT", type: "LIMIT", requestedVolume: 0.1, filledVolume: 0, requestedPrice: 1.3440, fillPrice: null, state: "PENDING", createdAt: new Date(Date.now() - 9e5).toISOString(), error: null, source: this._meta.source },
      { id: "ORD-5514", brokerId: null, symbol: "AUDUSD", direction: "LONG", type: "MARKET", requestedVolume: 0.5, filledVolume: 0, requestedPrice: 0.6540, fillPrice: null, state: "REJECTED", createdAt: new Date(Date.now() - 26e5).toISOString(), error: "RISK: volume exceeds max position size", source: this._meta.source },
    ];
  },

  trades() {
    const r = mulberry32(42);
    const out = [];
    for (let i = 0; i < 24; i++) {
      const win = r() > 0.42;
      out.push({
        id: `TRD-${9000 + i}`,
        symbol: SYMBOLS[i % 3].symbol,
        direction: i % 2 ? "LONG" : "SHORT",
        volume: +(0.05 + r() * 0.15).toFixed(2),
        entry: 1.1 + r() * 0.3,
        exit: 1.1 + r() * 0  .3,
        pnl: win ? +(20 + r() * 180).toFixed(2) : +(-(15 + r() * 120)).toFixed(2),
        openedAt: new Date(Date.now() - (i + 1) * 9e7).toISOString(),
        closedAt: new Date(Date.now() - i * 9e7 - 36e5).toISOString(),
        source: this._meta.source,
      });
    }
    return out;
  },

  riskSummary() {
    return {
      equity: 104820.55, balance: 104310.2, realisedToday: 510.35, unrealised: 70.3,
      openRiskPct: 0.38, dailyLossUsedPct: 0.22, drawdownPct: 1.84,
      limits: { riskPerTradePct: 0.25, maxDailyLossPct: 1, maxDrawdownPct: 6, maxPositions: 2, maxOpenRiskPct: 1.5 },
      openPositions: 2, consecutiveLosses: 0, halted: false, marginUsedPct: 4.2,
      source: this._meta.source,
    };
  },

  performance(range) {
    const r = mulberry32(range === "7d" ? 7 : range === "90d" ? 90 : 30);
    const n = range === "7d" ? 7 : range === "90d" ? 90 : 30;
    const equity = [];
    const drawdown = [];
    let eq = 100000, peak = eq;
    const start = Date.now() - n * 864e5;
    for (let i = 0; i <= n; i++) {
      eq *= 1 + (r() - 0.44) * 0.012;
      peak = Math.max(peak, eq);
      equity.push({ time: start + i * 864e5, value: +eq.toFixed(2) });
      drawdown.push({ time: start + i * 864e5, value: +(((eq - peak) / peak) * 100).toFixed(3) });
    }
    return {
      range, equity, drawdown,
      metrics: {
        netReturnPct: +(((eq - 100000) / 100000) * 100).toFixed(2),
        profitFactor: 1.58, winRate: 46.4, expectancy: 8.4, maxDrawdownPct: -3.2,
        sharpe: 1.31, sortino: 1.82, trades: 58, avgDurationHours: 6.4,
      },
      source: this._meta.source,
    };
  },

  alerts() {
    return [
      { id: "AL-1", level: "WARNING", message: "Spread on GBPUSD exceeded entry threshold (2.8 pips)", at: new Date(Date.now() - 42e5).toISOString(), source: this._meta.source },
      { id: "AL-2", level: "INFO", message: "Paper engine restarted — safety state reloaded, halt state clear", at: new Date(Date.now() - 11e6).toISOString(), source: this._meta.source },
      { id: "AL-3", level: "CRITICAL", message: "Daily loss limit reached on 14 Oct — entries blocked for session", at: new Date(Date.now() - 2 * 864e5).toISOString(), source: this._meta.source },
    ];
  },

  backtests() {
    return [
      { id: "BT-301", strategy: "Trend-Following Pullback", version: "1.2.0", symbol: "EURUSD", timeframe: "H1", period: "2025-01-01 → 2026-06-30", netReturnPct: 18.4, profitFactor: 1.62, winRate: 47.8, maxDrawdownPct: -6.1, trades: 184, status: "COMPLETE", source: this._meta.source },
      { id: "BT-302", strategy: "Breakout & Retest", version: "1.0.4", symbol: "GBPUSD", timeframe: "H1", period: "2025-06-01 → 2026-06-30", netReturnPct: 11.2, profitFactor: 1.44, winRate: 41.2, maxDrawdownPct: -8.4, trades: 97, status: "COMPLETE", source: this._meta.source },
      { id: "BT-303", strategy: "Trend-Following Pullback", version: "1.2.0", symbol: "USDJPY", timeframe: "H4", period: "2026-01-01 → 2026-09-30", netReturnPct: null, profitFactor: null, winRate: null, maxDrawdownPct: null, trades: 0, status: "RUNNING", source: this._meta.source },
    ];
  },
};
