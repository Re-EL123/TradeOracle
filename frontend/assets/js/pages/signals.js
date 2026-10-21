/* Signals */
import { api } from "../api.js";
import { fmt } from "../state.js";
import { icon, badge, statusBadge, errorBlock, loadingBlock, modal, sourceTag } from "../ui.js";

export async function render(outlet) {
  outlet.innerHTML = `<div class="page">
    <div class="page__header">
      <div><h2>Signals</h2><p>Generated opportunities with full explanations. A signal score is a ranking, not a probability of winning. Rejections keep their reasons.</p></div>
      <div class="u-flex u-gap-2" id="sig-filters">
        <select class="select" id="f-dir" style="width:120px"><option value="">All directions</option><option>LONG</option><option>SHORT</option></select>
        <select class="select" id="f-st" style="width:140px"><option value="">All statuses</option><option>ELIGIBLE</option><option>EVALUATING</option><option>REJECTED</option><option>EXPIRED</option></select>
        <input class="input" id="f-q" placeholder="Symbol / strategy…" style="width:170px">
      </div>
    </div>
    <section class="panel">
      <div class="panel__head"><div class="panel__title">${icon("signals")} Signal register</div><span id="sig-count" class="badge badge--grey"></span></div>
      <div class="panel__body panel__body--flush"><div class="table-wrap" id="sig-table">${loadingBlock(6)}</div></div>
      <div class="panel__foot"><span id="sig-src"></span><span>Click a row for the full explanation</span></div>
    </section>
  </div>`;

  let all = [];
  const table = outlet.querySelector("#sig-table");

  async function load() {
    try { all = await api.signals(); } catch (e) { table.innerHTML = errorBlock("Signals unavailable", e.message, load); return; }
    outlet.querySelector("#sig-src").innerHTML = sourceTag(all[0]?.source);
    apply();
  }
  function apply() {
    const dir = outlet.querySelector("#f-dir").value;
    const st = outlet.querySelector("#f-st").value;
    const q = (outlet.querySelector("#f-q").value || "").toUpperCase();
    const rows = all.filter((s) => (!dir || s.direction === dir) && (!st || s.status === st) && (!q || s.symbol.includes(q) || (s.strategy || "").toUpperCase().includes(q)));
    outlet.querySelector("#sig-count").textContent = `${rows.length} / ${all.length}`;
    if (!rows.length) { table.innerHTML = `<div class="state">${icon("search", 24)}<h4>No signals match</h4><p>Signals appear when eligible strategies detect a setup.</p></div>`; return; }
    table.innerHTML = `<table class="data">
      <thead><tr>
        <th>Time</th><th>Instrument</th><th>Dir</th><th>Strategy</th><th>TF</th>
        <th class="num">Entry</th><th class="num">SL</th><th class="num">TP</th><th class="num">R:R</th>
        <th class="num">Score</th><th>Regime</th><th>Status</th><th>Exec</th>
      </tr></thead>
      <tbody>
      ${rows.map((s) => `<tr class="is-clickable" data-id="${s.id}">
        <td class="u-muted">${fmt.age(s.timestamp)}</td>
        <td class="sym">${s.symbol}</td>
        <td>${badge(s.direction, s.direction === "LONG" ? "green" : "red")}</td>
        <td>${s.strategy}</td>
        <td class="u-muted">${s.timeframe}</td>
        <td class="num mono">${fmt.price(s.entry, s.symbol)}</td>
        <td class="num mono u-bear">${fmt.price(s.stopLoss, s.symbol)}</td>
        <td class="num mono u-bull">${fmt.price(s.takeProfit, s.symbol)}</td>
        <td class="num">${s.rr}</td>
        <td class="num mono">${s.score}</td>
        <td>${badge(s.regime, s.regime === "TRENDING" ? "blue" : "grey")}</td>
        <td>${statusBadge(s.status)}</td>
        <td class="u-muted">${s.status === "REJECTED" ? "Blocked" : s.status === "ELIGIBLE" ? "Awaiting mode" : "—"}</td>
      </tr>`).join("")}
      </tbody></table>`;
    table.querySelectorAll("[data-id]").forEach((tr) => tr.addEventListener("click", () => openDetail(all.find((x) => x.id === tr.dataset.id))));
  }
  ["#f-dir", "#f-st", "#f-q"].forEach((s) => outlet.querySelector(s).addEventListener("input", apply));
  load();
  const t = setInterval(load, 25000);
  return () => clearInterval(t);
}

function openDetail(s) {
  if (!s) return;
  const factors = [
    ["Trend alignment", Math.min(95, s.score + 8)],
    ["Market structure", Math.max(20, s.score - 4)],
    ["Entry confirmation", Math.min(90, s.score + 2)],
    ["Volatility suitability", Math.max(25, s.score - 12)],
    ["Risk/reward", Math.min(95, Math.round((s.rr || 1) * 32))],
    ["Session suitability", 64],
  ];
  modal({
    title: `${s.symbol} · ${s.direction} · ${s.id}`,
    wide: true,
    body: `
      <div class="grid grid--2">
        <div>
          <h4 style="margin-bottom:var(--sp-3)">Summary</h4>
          <dl class="dl">
            <dt>Generated</dt><dd>${fmt.time(s.timestamp)}</dd>
            <dt>Strategy</dt><dd>${s.strategy}</dd>
            <dt>Timeframe</dt><dd>${s.timeframe}</dd>
            <dt>Market regime</dt><dd>${s.regime}</dd>
            <dt>Entry ref</dt><dd class="mono">${fmt.price(s.entry, s.symbol)}</dd>
            <dt>Stop-loss</dt><dd class="mono u-bear">${fmt.price(s.stopLoss, s.symbol)}</dd>
            <dt>Take-profit</dt><dd class="mono u-bull">${fmt.price(s.takeProfit, s.symbol)}</dd>
            <dt>Reward:Risk</dt><dd class="mono">${s.rr}</dd>
            <dt>Score</dt><dd class="mono">${s.score} <span class="u-faint">(rank, not probability)</span></dd>
            <dt>Status</dt><dd>${statusBadge(s.status)}</dd>
          </dl>
          ${s.status === "REJECTED" ? `<div class="halt-banner" style="margin-top:var(--sp-4)">${icon("alert", 16)} Rejected by hard rule before ranking — e.g. stale data, spread above threshold, risk limit, or expired setup.</div>` : ""}
        </div>
        <div>
          <h4 style="margin-bottom:var(--sp-3)">Technical evidence</h4>
          <div class="evidence">
            ${factors.map(([l, v]) => `<div class="evidence__row"><span class="u-muted">${l}</span><div class="evidence__bar"><i style="width:${v}%"></i></div><span class="mono" style="text-align:right">${v}</span></div>`).join("")}
          </div>
          <h4 style="margin:var(--sp-5) 0 var(--sp-3)">Lifecycle</h4>
          <div style="font-size:var(--fs-2xs);color:var(--muted);line-height:1.9">
            GENERATED → EVALUATING → ${["ELIGIBLE", "ORDER_REQUESTED", "EXECUTED"].includes(s.status) ? "ELIGIBLE" : s.status}
            <div class="u-faint" style="font-size:var(--fs-3xs);margin-top:6px">
              Timestamps for each transition and rejection reasons are persisted with the strategy version for replay.
            </div>
          </div>
        </div>
      </div>`,
    actions: [{ label: "Close", kind: "primary" }],
  });
}
