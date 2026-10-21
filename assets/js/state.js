/* Global client state store — tiny observable */
const initial = {
  apiBase: (window.__TRADEORACLE_CONFIG__ && window.__TRADEORACLE_CONFIG__.apiBase) || "/api/v1",
  demoFallback: false,
  session: null,
  engine: null,          // engine status payload
  mode: "PAPER",
  halted: false,
  route: "overview",
  prefs: { defaultSymbol: "EURUSD", defaultTimeframe: "H1", timezone: "UTC" },
  pollers: [],
};

const listeners = new Map();

export const state = {
  ...initial,

  get(key) { return this[key]; },

  set(patch, scope = "*") {
    Object.assign(this, patch);
    (listeners.get(scope) || []).forEach((fn) => fn(this, patch));
    (listeners.get("*") || []).forEach((fn) => fn(this, patch));
  },

  on(scope, fn) {
    if (!listeners.has(scope)) listeners.set(scope, []);
    listeners.get(scope).push(fn);
    return () => {
      const arr = listeners.get(scope) || [];
      const i = arr.indexOf(fn);
      if (i >= 0) arr.splice(i, 1);
    };
  },

  /* Poller registry so route changes can tear down intervals */
  addPoller(id, fn, ms) {
    this.clearPoller(id);
    const handle = setInterval(fn, ms);
    this.pollers.push({ id, handle });
    fn();
    return handle;
  },
  clearPoller(id) {
    const p = this.pollers.find((x) => x.id === id);
    if (p) { clearInterval(p.handle); this.pollers = this.pollers.filter((x) => x.id !== id); }
  },
  clearPollers() {
    this.pollers.forEach((p) => clearInterval(p.handle));
    this.pollers = [];
  },
};

/* Format helpers shared across pages */
export const fmt = {
  money(v, currency = "ZAR", digits = 2) {
    if (v == null || Number.isNaN(Number(v))) return "—";
    const n = Number(v);
    const sign = n < 0 ? "-" : "";
    return `${sign}${currency === "ZAR" ? "R" : currency + " "}${Math.abs(n).toLocaleString("en-ZA", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
  },
  num(v, digits = 2) {
    if (v == null || Number.isNaN(Number(v))) return "—";
    return Number(v).toLocaleString("en-ZA", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  },
  pct(v, digits = 2, sign = true) {
    if (v == null || Number.isNaN(Number(v))) return "—";
    const n = Number(v);
    return `${sign && n > 0 ? "+" : ""}${n.toFixed(digits)}%`;
  },
  price(v, symbol) {
    if (v == null) return "—";
    const d = /JPY/.test(symbol || "") ? 3 : 5;
    return Number(v).toFixed(d);
  },
  age(iso) {
    if (!iso) return "—";
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 0) return "just now";
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  },
  time(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toISOString().replace("T", " ").slice(0, 19) + "Z";
  },
  cls(v) { return v > 0 ? "pos" : v < 0 ? "neg" : ""; },
};
