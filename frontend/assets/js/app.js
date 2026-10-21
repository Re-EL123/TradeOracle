/* App shell: sidebar, topbar, mode pill, engine chips, routing bootstrap */
import { state, fmt } from "./state.js";
import { api } from "./api.js";
import { route, startRouter, navigate, render } from "./router.js";
import { icon, toast, modal } from "./ui.js";

const NAV = [
  { section: "Workspace" },
  { id: "overview", label: "Overview", icon: "overview" },
  { id: "markets", label: "Live Markets", icon: "markets" },
  { id: "chart", label: "Chart Analysis", icon: "chart" },
  { id: "signals", label: "Signals", icon: "signals", badgeKey: "signalCount" },
  { section: "Research" },
  { id: "strategies", label: "Strategies", icon: "strategies" },
  { id: "backtesting", label: "Backtesting", icon: "backtest" },
  { id: "ai-lab", label: "AI Lab", icon: "ai" },
  { id: "reports", label: "Reports", icon: "reports" },
  { section: "Trading" },
  { id: "paper", label: "Paper Trading", icon: "paper" },
  { id: "orders", label: "Orders & Trades", icon: "orders" },
  { id: "portfolio", label: "Portfolio & Risk", icon: "risk" },
  { id: "alerts", label: "Alerts", icon: "alerts", badgeKey: "alertCount" },
  { section: "System" },
  { id: "engine", label: "Engine Monitor", icon: "engine" },
  { id: "brokers", label: "Broker Connections", icon: "broker" },
  { id: "settings", label: "Settings", icon: "settings" },
];

function buildSidebar() {
  const nav = document.getElementById("nav");
  nav.innerHTML = NAV.map((item) =>
    item.section
      ? `<div class="sidebar__section">${item.section}</div>`
      : `<button class="nav-item" data-nav="${item.id}">${icon(item.icon)}<span>${item.label}</span><span class="nav-item__badge u-hide" data-badge="${item.badgeKey || ""}"></span></button>`
  ).join("");
  nav.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-nav]");
    if (!btn) return;
    navigate(btn.dataset.nav);
    document.getElementById("sidebar").classList.remove("is-open");
    document.getElementById("scrim").classList.remove("is-open");
  });
}

function setActiveNav() {
  const path = state.route;
  document.querySelectorAll("[data-nav]").forEach((b) => b.classList.toggle("is-active", b.dataset.nav === path));
}

function renderTopbarStatus() {
  const e = state.engine || {};
  const mode = state.halted ? "HALTED" : (e.mode || state.mode || "PAPER");
  const engineOk = e.status === "RUNNING";
  const dataOk = e.components?.marketData !== "DOWN";
  const brokerOk = ["CONNECTED", "PAPER"].includes(e.components?.broker) || e.mode === "PAPER";
  document.getElementById("mode-pill").dataset.mode = mode;
  document.getElementById("mode-pill").innerHTML = `<span class="badge__dot badge__dot--pulse"></span>${mode}`;
  document.getElementById("chip-engine").className = `chip ${engineOk ? "chip--ok" : "chip--err"} chip--essential`;
  document.getElementById("chip-engine").innerHTML = `<span class="chip__dot"></span>Engine ${engineOk ? "ONLINE" : e.status === "SIMULATED" ? "SIM" : "OFFLINE"}`;
  document.getElementById("chip-data").className = `chip ${dataOk ? "chip--ok" : "chip--warn"}`;
  document.getElementById("chip-data").innerHTML = `<span class="chip__dot"></span>Market data`;
  document.getElementById("chip-broker").className = `chip ${brokerOk ? "chip--ok" : "chip--idle"}`;
  document.getElementById("chip-broker").innerHTML = `<span class="chip__dot"></span>${e.mode === "PAPER" || !e.components?.broker ? "Paper broker" : "Broker"}`;
  document.getElementById("heartbeat").textContent = e.lastHeartbeat ? `Heartbeat ${fmt.age(e.lastHeartbeat)}` : "No heartbeat";
  if (state.demoFallback) {
    document.getElementById("chip-demo").classList.remove("u-hide");
  }
}

async function refreshEngine() {
  try {
    const s = await api.engineStatus();
    state.set({ engine: s, mode: s.mode || "PAPER", halted: s.mode === "HALTED" });
    if (s.source === "SIMULATED") state.set({ demoFallback: true });
  } catch {
    state.set({ engine: { status: "OFFLINE", mode: state.mode, components: {} } });
  }
  renderTopbarStatus();
}

function bindShell() {
  const menuBtn = document.getElementById("menu-btn");
  const sidebar = document.getElementById("sidebar");
  const scrim = document.getElementById("scrim");
  menuBtn.addEventListener("click", () => {
    sidebar.classList.toggle("is-open");
    scrim.classList.toggle("is-open");
  });
  scrim.addEventListener("click", () => {
    sidebar.classList.remove("is-open");
    scrim.classList.remove("is-open");
  });

  document.getElementById("btn-refresh").addEventListener("click", async () => {
    await refreshEngine();
    render();
    toast("Refreshed", "Dashboard data reloaded.", "success", 2500);
  });

  document.getElementById("btn-emergency").addEventListener("click", () => {
    const mode = state.halted ? "resume" : "halt";
    modal({
      title: mode === "halt" ? "Emergency stop" : "Resume trading",
      body:
        mode === "halt"
          ? `<p style="font-size:var(--fs-2xs);color:var(--text-2);line-height:1.6">
              This immediately <b>blocks all new order submissions</b> and persists the halt state across restarts.
              Existing positions are <b>not</b> automatically closed — they remain monitored under the configured policy.
             </p>`
          : `<p style="font-size:var(--fs-2xs);color:var(--text-2);line-height:1.6">
              Resuming re-enables new entries. The engine will run preflight checks and reconcile state before accepting orders.
             </p>`,
      actions: [
        { label: "Cancel" },
        {
          label: mode === "halt" ? "Confirm emergency stop" : "Confirm resume",
          kind: mode === "halt" ? "danger" : "primary",
          onClick: async () => {
            try {
              await api.engineCommand(mode === "halt" ? "STOP_NEW_ENTRIES" : "RESUME_ENTRIES");
              state.set({ halted: mode === "halt" });
              toast(mode === "halt" ? "Emergency stop active" : "Trading resumed",
                mode === "halt" ? "New entries are blocked system-wide." : "Preflight checks running before new entries.",
                mode === "halt" ? "error" : "success");
              refreshEngine();
            } catch (err) {
              toast("Command failed", err.message, "error");
            }
          },
        },
      ],
    });
  });
}

function registerRoutes() {
  const pages = [
    ["overview", () => import("./pages/overview.js")],
    ["markets", () => import("./pages/markets.js")],
    ["chart", () => import("./pages/chart.js")],
    ["signals", () => import("./pages/signals.js")],
    ["strategies", () => import("./pages/strategies.js")],
    ["backtesting", () => import("./pages/backtesting.js")],
    ["paper", () => import("./pages/paper.js")],
    ["orders", () => import("./pages/orders.js")],
    ["portfolio", () => import("./pages/portfolio.js")],
    ["ai-lab", () => import("./pages/aiLab.js")],
    ["reports", () => import("./pages/reports.js")],
    ["alerts", () => import("./pages/alerts.js")],
    ["engine", () => import("./pages/engine.js")],
    ["brokers", () => import("./pages/brokers.js")],
    ["settings", () => import("./pages/settings.js")],
  ];
  pages.forEach(([path, loader]) => {
    route(path, async (outlet) => {
      const mod = await loader();
      return mod.render(outlet);
    });
  });
}

/* Boot */
buildSidebar();
bindShell();
registerRoutes();
state.on("route", setActiveNav);
startRouter();
refreshEngine();
state.addPoller("engine", refreshEngine, 15000);
setActiveNav();

/* Global unhandled errors */
window.addEventListener("unhandledrejection", (e) => {
  if (e.reason?.message?.includes("chart-lib")) return;
  console.error(e.reason);
});

export { refreshEngine };
