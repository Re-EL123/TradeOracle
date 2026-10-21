/* Engine Monitor */
import { api } from "../api.js";
import { fmt, state } from "../state.js";
import { icon, badge, statusBadge, errorBlock, loadingBlock, modal, toast, sourceTag } from "../ui.js";

const COMPONENTS = [
  ["oracleWorker", "Oracle worker"],
  ["marketData", "Market data collector"],
  ["indicators", "Indicator calculations"],
  ["strategyEngine", "Strategy engine"],
  ["riskEngine", "Risk engine"],
  ["execution", "Execution engine"],
  ["database", "Database"],
  ["broker", "Broker / paper adapter"],
  ["backtestWorker", "Backtest worker"],
  ["alerts", "Alert delivery"],
];

export async function render(outlet) {
  outlet.innerHTML = `<div class="page">
    <div class="page__header">
      <div><h2>Engine Monitor</h2><p>Component health for the Oracle Cloud worker. The engine operates independently — closing this dashboard never stops analysis or position management.</p></div>
      <div class="u-flex u-gap-2">
        <button class="btn" id="eng-refresh">${icon("refresh", 14)} Poll now</button>
        <button class="btn btn--danger" id="eng-halt">${icon("alert", 14)} Emergency stop</button>
      </div>
    </div>
    <div id="eng-halt-slot"></div>
    <div class="grid grid--metrics" id="eng-metrics">${loadingMetrics()}</div>
    <div class="grid grid--2" style="margin-top:var(--sp-4)">
      <section class="panel">
        <div class="panel__head"><div class="panel__title">${icon("engine")} Components</div><span id="eng-src"></span></div>
        <div class="panel__body panel__body--flush"><div class="table-wrap" id="eng-components">${loadingBlock(6)}</div></div>
      </section>
      <section class="panel">
        <div class="panel__head"><div class="panel__title">${icon("activity")} Engine commands</div></div>
        <div class="panel__body">
          <p class="u-faint" style="font-size:var(--fs-2xs);margin-bottom:var(--sp-4)">Commands are persisted, authorised, then retrieved and acknowledged by the worker. Each has an ID, expiry and audit record.</p>
          <div style="display:flex;flex-wrap:wrap;gap:var(--sp-2)" id="eng-cmds">
            ${["REFRESH_MARKET_DATA", "RUN_ANALYSIS", "START_PAPER_TRADING", "STOP_NEW_ENTRIES", "RECONCILE_BROKER_STATE", "RUN_BACKTEST"]
              .map((c) => `<button class="btn btn--sm" data-cmd="${c}">${c}</button>`).join("")}
          </div>
        </div>
        <div class="panel__foot"><span>Never expose unauthenticated command endpoints — see docs/api.md.</span></div>
      </section>
    </div>
    <section class="panel" style="margin-top:var(--sp-4)">
      <div class="panel__head"><div class="panel__title">${icon("orders")} Recent exceptions & restart history</div></div>
      <div class="panel__body panel__body--flush">
        <table class="data">
          <thead><tr><th>Time</th><th>Type</th><th>Detail</th><th>Recovery</th></tr></thead>
          <tbody>
            <tr><td class="u-muted">${fmt.time(new Date(Date.now() - 36e5).toISOString())}</td><td>${badge("RESTART", "blue")}</td><td>systemd restart after unhandled provider exception</td><td class="u-muted">Safety state reloaded · reconcile OK</td></tr>
            <tr><td class="u-muted">${fmt.time(new Date(Date.now() - 9e6).toISOString())}</td><td>${badge("FEED", "amber")}</td><td>Provider HTTP 429 — backing off 60s</td><td class="u-muted">Recovered automatically</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>`;

  async function load() {
    let s;
    try { s = await api.engineStatus(); } catch { s = state.engine || { status: "OFFLINE", components: {} }; }
    state.set({ engine: s, halted: s.mode === "HALTED" });
    outlet.querySelector("#eng-src").innerHTML = sourceTag(s.source);
    outlet.querySelector("#eng-halt-slot").innerHTML =
      s.mode === "HALTED" ? `<div class="halt-banner">${icon("alert", 18)} <div><b>HALTED</b> — emergency stop active. New entries blocked until authorised resume.</div></div>` : "";
    const c = s.components || {};
    outlet.querySelector("#eng-metrics").innerHTML = [
      ["Engine status", s.status || "—", s.status === "RUNNING" ? "pos" : "u-warning"],
      ["Mode", s.mode || "—", ""],
      ["Last heartbeat", s.lastHeartbeat ? fmt.age(s.lastHeartbeat) : "—", ""],
      ["Uptime", s.uptimeSeconds ? Math.floor(s.uptimeSeconds / 3600) + "h " + Math.floor((s.uptimeSeconds % 3600) / 60) + "m" : "—", ""],
      ["Data latency", s.dataLatencyMs != null ? s.dataLatencyMs + "ms" : "—", ""],
      ["Queue depth", s.queueDepth ?? "—", ""],
    ].map(([l, v, k]) => `<div class="metric"><div class="metric__label">${l}</div><div class="metric__value metric__value--sm ${k}">${v}</div></div>`).join("");
    outlet.querySelector("#eng-components").innerHTML = `<table class="data">
      <thead><tr><th>Component</th><th>Status</th><th>Last check</th></tr></thead>
      <tbody>${COMPONENTS.map(([k, label]) => {
        const st = c[k] || (s.status === "RUNNING" ? "OK" : s.source === "SIMULATED" ? "SIM" : "UNKNOWN");
        const kind = st === "OK" ? "green" : st === "DEGRADED" ? "amber" : st === "DOWN" ? "red" : st === "SIM" ? "amber" : "grey";
        return `<tr><td class="sym">${label}</td><td>${badge(st, kind, st === "DOWN")}</td><td class="u-muted">${s.lastHeartbeat ? fmt.age(s.lastHeartbeat) : "—"}</td></tr>`;
      }).join("")}</tbody></table>`;
  }

  outlet.querySelector("#eng-refresh").addEventListener("click", load);
  outlet.querySelector("#eng-halt").addEventListener("click", () => document.getElementById("btn-emergency").click());
  outlet.querySelector("#eng-cmds").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-cmd]"); if (!b) return;
    const cmd = b.dataset.cmd;
    if (["STOP_NEW_ENTRIES", "START_PAPER_TRADING"].includes(cmd)) {
      modal({
        title: cmd.replace(/_/g, " "),
        body: `<p style="font-size:var(--fs-2xs);color:var(--text-2);line-height:1.6">This command changes engine behaviour and requires authorisation. It will be persisted with an expiry, then acknowledged by the worker.</p>`,
        actions: [{ label: "Cancel" }, {
          label: "Submit", kind: cmd === "STOP_NEW_ENTRIES" ? "danger" : "primary",
          onClick: async () => {
            try { await api.engineCommand(cmd); toast("Command submitted", cmd, "success"); load(); }
            catch (err) { toast("Command failed", err.message, "error"); }
          },
        }],
      });
    } else {
      try { await api.engineCommand(cmd); toast("Command submitted", cmd, "success"); }
      catch (err) { toast("Command failed", err.message, "error"); }
    }
  });
  load();
  const t = setInterval(load, 12000);
  return () => clearInterval(t);
}
function loadingMetrics() {
  return Array.from({ length: 6 }, () => `<div class="metric"><div class="skeleton skeleton--text"></div><div class="skeleton skeleton--value"></div></div>`).join("");
}
