/* Shared UI primitives: icons, toasts, modal, states */
const ICONS = {
  overview: '<path d="M3 13h8V3H3zM13 21h8V11h-8zM13 8h8V3h-8zM3 21h8v-5H3z"/>',
  markets: '<path d="M3 3v18h18"/><path d="m7 14 4-4 4 3 5-6"/>',
  chart: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="m7 15 4-6 4 3 5-7"/>',
  signals: '<path d="M13 2 3 14h7l-1 8 10-12h-7z"/>',
  strategies: '<path d="M12 2H2v10l10 10 10-10z"/><path d="M12 8v8"/><path d="M8 12h8"/>',
  backtest: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  paper: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/>',
  orders: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  risk: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  ai: '<path d="M12 2a4 4 0 0 1 4 4v1a4 4 0 0 1-1 8H9a4 4 0 0 1-1-8V6a4 4 0 0 1 4-4z"/><path d="M9 19h6M10 22h4"/>',
  reports: '<path d="M3 3v18h18"/><rect x="7" y="10" width="3" height="8" rx="1"/><rect x="13" y="6" width="3" height="12" rx="1"/>',
  alerts: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  engine: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6v6H9z"/><path d="M9 1v2M15 1v2M9 21v2M15 21v2M1 9h2M1 15h2M21 9h2M21 15h2"/>',
  broker: '<path d="M3 21h18M5 21V10l7-5 7 5v11"/><path d="M9 21v-6h6v6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  zap: '<path d="M13 2 3 14h7l-1 8 10-12h-7z"/>',
  activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>',
  play: '<path d="m5 3 14 9-14 9z"/>',
  pause: '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>',
  alert: '<path d="m10.3 3.9-8.5 14.1A2 2 0 0 0 3.5 21h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  wifi: '<path d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0"/><path d="M12 20h.01"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/><path d="M3 12c0 1.7 4 3 9 3s9-1.3 9-3"/>',
  trend: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
};

export function icon(name, size = 16) {
  const p = ICONS[name] || ICONS.info;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}

export function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

/* ---------- Toasts ---------- */
let toastHost = null;
function ensureHost() {
  if (!toastHost) {
    toastHost = el('<div class="toasts" role="status" aria-live="polite"></div>');
    document.body.appendChild(toastHost);
  }
  return toastHost;
}

export function toast(title, message = "", kind = "info", ttl = 5000) {
  const host = ensureHost();
  const node = el(`
    <div class="toast toast--${kind}">
      <div class="toast__bar"></div>
      <div class="toast__msg"><b></b><span></span></div>
      <button class="btn btn--ghost btn--sm btn--icon" aria-label="Dismiss">${icon("x", 13)}</button>
    </div>`);
  node.querySelector("b").textContent = title;
  node.querySelector("span").textContent = message;
  const kill = () => { node.style.opacity = "0"; node.style.transform = "translateY(6px)"; setTimeout(() => node.remove(), 180); };
  node.querySelector("button").addEventListener("click", kill);
  host.appendChild(node);
  if (ttl) setTimeout(kill, ttl);
  return kill;
}

/* ---------- Modal ---------- */
export function modal({ title, body, actions = [], wide = false }) {
  const back = el(`
    <div class="modal-backdrop" role="dialog" aria-modal="true" aria-label="${title}">
      <div class="modal" ${wide ? 'style="width:min(860px,100%)"' : ""}>
        <div class="modal__head"><h3>${title}</h3><button class="btn btn--ghost btn--sm btn--icon" data-close>${icon("x", 15)}</button></div>
        <div class="modal__body"></div>
        <div class="modal__foot"></div>
      </div>
    </div>`);
  const bodyEl = back.querySelector(".modal__body");
  if (typeof body === "string") bodyEl.innerHTML = body;
  else bodyEl.appendChild(body);
  const foot = back.querySelector(".modal__foot");
  actions.forEach((a) => {
    const b = el(`<button class="btn ${a.kind ? `btn--${a.kind}` : ""}">${a.label}</button>`);
    b.addEventListener("click", () => { if (a.onClick) a.onClick(); if (a.close !== false) close(); });
    foot.appendChild(b);
  });
  if (!actions.length) foot.remove();
  const close = () => { back.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  back.addEventListener("click", (e) => { if (e.target === back) close(); });
  back.querySelector("[data-close]").addEventListener("click", close);
  document.addEventListener("keydown", onKey);
  document.body.appendChild(back);
  return { close, body: bodyEl };
}

/* ---------- State blocks ---------- */
export function loadingBlock(rows = 4) {
  return `<div>${Array.from({ length: rows }, () => '<div class="skeleton skeleton--row"></div>').join("")}</div>`;
}
export function emptyBlock(title, msg) {
  return `<div class="state">${icon("search", 26)}<h4>${title}</h4><p>${msg || ""}</p></div>`;
}
export function errorBlock(title, msg, retry) {
  const id = "err-" + Math.random().toString(36).slice(2);
  requestAnimationFrame(() => {
    const btn = document.getElementById(id);
    if (btn && retry) btn.addEventListener("click", retry);
  });
  return `<div class="state state--error">${icon("alert", 26)}<h4>${title}</h4><p>${msg || ""}</p>${retry ? `<button class="btn btn--sm" id="${id}">${icon("refresh", 13)} Retry</button>` : ""}</div>`;
}

export function badge(text, kind = "grey", pulse = false) {
  return `<span class="badge badge--${kind}">${pulse ? '<span class="badge__dot badge__dot--pulse"></span>' : ""}${text}</span>`;
}

export function trendBadge(t) {
  const map = { UPTREND: "green", DOWNTREND: "red", RANGE: "grey", BREAKOUT: "amber", UNKNOWN: "grey" };
  return badge(t || "UNKNOWN", map[t] || "grey");
}
export function volBadge(v) {
  const map = { LOW: "info", NORMAL: "blue", ELEVATED: "amber", HIGH: "red" };
  return badge(v || "—", map[v] || "grey");
}
export function signalBadge(s) {
  if (!s) return badge("—", "grey");
  return badge(`${s.direction} ${s.score}`, s.direction === "LONG" ? "green" : "red");
}
export function statusBadge(s) {
  const map = {
    ELIGIBLE: "green", EVALUATING: "info", REJECTED: "red", EXPIRED: "amber",
    CANCELLED: "grey", ORDER_REQUESTED: "blue", EXECUTED: "green", CLOSED: "grey",
    FILLED: "green", PENDING: "amber", PARTIALLY_FILLED: "info", UNKNOWN: "red",
    RUNNING: "blue", COMPLETE: "green", FAILED: "red",
    DRAFT: "grey", TESTING: "info", VALIDATED: "green", PAPER: "blue", DEMO: "amber", LIVE: "red",
  };
  return badge(s || "—", map[s] || "grey");
}

export function sourceTag(source) {
  if (!source) return "";
  if (source === "SIMULATED") return `<span class="badge badge--amber" title="Local simulation — not live market data">SIMULATED</span>`;
  return `<span class="badge badge--info" title="Data source: ${source}">${source}</span>`;
}

export function meter(pct, kind = "") {
  const v = Math.max(0, Math.min(100, pct || 0));
  return `<div class="meter"><div class="meter__fill ${kind}" style="width:${v}%"></div></div>`;
}
