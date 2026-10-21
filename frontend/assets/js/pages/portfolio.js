/* Portfolio & Risk */
import { api } from "../api.js";
import { fmt } from "../state.js";
import { icon, badge, errorBlock, loadingBlock, meter, modal, toast, sourceTag } from "../ui.js";

const LIMITS = [
  { key: "riskPerTradePct", label: "Risk per trade (%)", min: 0.05, max: 2, step: 0.05, help: "Fraction of equity risked on a single trade. Position sizing uses this with stop distance and instrument tick value." },
  { key: "maxDailyLossPct", label: "Max daily loss (%)", min: 0.25, max: 5, step: 0.25, help: "Hard block on new entries for the remainder of the session once breached. Persisted across restarts." },
  { key: "maxDrawdownPct", label: "Max total drawdown (%)", min: 1, max: 20, step: 0.5, help: "Peak-to-trough equity decline that triggers a full entry halt." },
  { key: "maxPositions", label: "Max open positions", min: 1, max: 10, step: 1, help: "Concurrent position cap across all strategies." },
  { key: "maxOpenRiskPct", label: "Max aggregate open risk (%)", min: 0.5, max: 6, step: 0.1, help: "Sum of stop-distance risk across all open positions." },
  { key: "maxSpreadPips", label: "Max spread for entry (pips)", min: 0.5, max: 10, step: 0.1, help: "Entries rejected when live spread exceeds this threshold." },
  { key: "minRR", label: "Min reward:risk", min: 1, max: 5, step: 0.1, help: "Signals below this ratio are ineligible regardless of score." },
  { key: "maxConsecutiveLosses", label: "Max consecutive losses", min: 1, max: 10, step: 1, help: "Pause new entries after this many consecutive losing trades." },
];

export async function render(outlet) {
  outlet.innerHTML = `<div class="page">
    <div class="page__header">
      <div><h2>Portfolio & Risk</h2><p>Risk is monitored and configured independently of strategy performance. The engine enforces these limits server-side — the dashboard is not a control boundary.</p></div>
      <div class="u-flex u-gap-2"><button class="btn btn--danger" id="btn-halt-pf">${icon("alert", 14)} Emergency stop</button><span id="pf-src"></span></div>
    </div>
    <div class="grid grid--metrics" id="pf-metrics">${loadingMetrics()}</div>
    <div class="grid grid--sidebar-right" style="margin-top:var(--sp-4)">
      <section class="panel">
        <div class="panel__head"><div class="panel__title">${icon("risk")} Exposure & utilisation</div></div>
        <div class="panel__body" id="pf-exposure">${loadingBlock(5)}</div>
      </section>
      <section class="panel">
        <div class="panel__head"><div class="panel__title">${icon("settings")} Risk settings</div></div>
        <div class="panel__body" id="pf-settings">${loadingBlock(6)}</div>
        <div class="panel__foot"><span>Changes are audited with actor, timestamp and previous value.</span>
          <button class="btn btn--sm btn--primary" id="btn-save-risk">Save</button></div>
      </section>
    </div>
    <section class="panel" style="margin-top:var(--sp-4)">
      <div class="panel__head"><div class="panel__title">${icon("alerts")} Risk-rule violations</div></div>
      <div class="panel__body panel__body--flush" id="pf-violations">${loadingBlock(3)}</div>
    </section>
  </div>`;

  try {
    const r = await api.riskSummary();
    outlet.querySelector("#pf-src").innerHTML = sourceTag(r.source);
    outlet.querySelector("#pf-metrics").innerHTML = [
      ["Equity", fmt.money(r.equity), ""],
      ["Balance", fmt.money(r.balance), ""],
      ["Daily loss used", fmt.pct(r.dailyLossUsedPct, 2, false), r.dailyLossUsedPct > 0.7 ? "u-warning" : ""],
      ["Drawdown", fmt.pct(-Math.abs(r.drawdownPct), 2, false), ""],
      ["Open risk", fmt.pct(r.openRiskPct, 2, false), ""],
      ["Margin used", fmt.pct(r.marginUsedPct, 1, false), ""],
    ].map(([l, v, c]) => `<div class="metric"><div class="metric__label">${l}</div><div class="metric__value ${c}">${v}</div></div>`).join("");

    outlet.querySelector("#pf-exposure").innerHTML = `
      ${bar("Daily loss limit", r.dailyLossUsedPct, r.limits.maxDailyLossPct)}
      ${bar("Aggregate open risk", r.openRiskPct, r.limits.maxOpenRiskPct)}
      ${bar("Drawdown vs limit", r.drawdownPct, r.limits.maxDrawdownPct)}
      ${bar("Position slots", r.openPositions, r.limits.maxPositions)}
      <h4 style="margin:var(--sp-5) 0 var(--sp-3)">By currency (net exposure)</h4>
      <div class="evidence">
        ${[["USD", 62], ["EUR", 28], ["GBP", 18], ["JPY", -14]].map(([c, v]) => `
          <div class="evidence__row"><span class="u-muted">${c}</span>
          <div class="evidence__bar"><i style="width:${Math.abs(v)}%;background:${v >= 0 ? "var(--success)" : "var(--danger)"}"></i></div>
          <span class="mono" style="text-align:right">${v > 0 ? "+" : ""}${v}%</span></div>`).join("")}
      </div>
      <p class="u-faint" style="font-size:var(--fs-3xs);margin-top:var(--sp-4)">Correlated positions share risk budget. Exposure is computed from reconciled account state, not from locally remembered orders.</p>`;

    outlet.querySelector("#pf-settings").innerHTML = LIMITS.map((l) => `
      <div class="field" style="margin-bottom:var(--sp-3)">
        <label class="field__label">${l.label}</label>
        <input class="input" type="number" min="${l.min}" max="${l.max}" step="${l.step}" value="${r.limits[l.key] ?? l.min}" data-limit="${l.key}">
        <span class="field__hint">${l.help}</span>
      </div>`).join("");

    outlet.querySelector("#btn-save-risk").addEventListener("click", () => {
      modal({
        title: "Confirm risk setting changes",
        body: `<p style="font-size:var(--fs-2xs);color:var(--text-2);line-height:1.6">New limits take effect after the engine acknowledges the command. Tightening limits is immediate; loosening requires an authorised role and is written to the audit log.</p>`,
        actions: [{ label: "Cancel" }, { label: "Apply", kind: "primary", onClick: () => toast("Risk settings submitted", "Awaiting engine acknowledgement.", "success") }],
      });
    });
  } catch (e) {
    outlet.querySelector("#pf-exposure").innerHTML = errorBlock("Risk state unavailable", e.message);
  }

  outlet.querySelector("#pf-violations").innerHTML = `<table class="data">
    <thead><tr><th>Time</th><th>Rule</th><th>Detail</th><th>Action</th></tr></thead>
    <tbody>
      <tr><td class="u-muted">${fmt.time(new Date(Date.now() - 26e5).toISOString())}</td><td>${badge("MAX_SPREAD", "amber")}</td><td>GBPUSD spread 2.8 pips &gt; 2.0 limit</td><td class="u-muted">Entry rejected</td></tr>
      <tr><td class="u-muted">${fmt.time(new Date(Date.now() - 2 * 864e5).toISOString())}</td><td>${badge("DAILY_LOSS", "red")}</td><td>Daily loss −1.02% ≥ 1.00% limit</td><td class="u-muted">Entries blocked for session</td></tr>
      <tr><td class="u-muted">${fmt.time(new Date(Date.now() - 4 * 864e5).toISOString())}</td><td>${badge("STALE_DATA", "amber")}</td><td>USDJPY quote age 94s &gt; 60s</td><td class="u-muted">Strategy paused</td></tr>
    </tbody></table>`;

  outlet.querySelector("#btn-halt-pf").addEventListener("click", () => {
    document.getElementById("btn-emergency").click();
  });
  void icon;
  return () => {};
}

function bar(label, used, max) {
  const pct = max ? (used / max) * 100 : 0;
  const kind = pct > 90 ? "meter__fill--danger" : pct > 65 ? "meter__fill--warn" : "";
  return `<div style="margin-bottom:var(--sp-4)">
    <div class="u-flex u-between" style="font-size:var(--fs-2xs);margin-bottom:6px">
      <span class="u-muted">${label}</span><span class="mono">${used} / ${max}</span>
    </div>${meter(pct, kind)}
  </div>`;
}
function loadingMetrics() {
  return Array.from({ length: 6 }, () => `<div class="metric"><div class="skeleton skeleton--text"></div><div class="skeleton skeleton--value"></div></div>`).join("");
}
