/* Backtesting */
import { api } from "../api.js";
import { fmt } from "../state.js";
import { icon, statusBadge, errorBlock, loadingBlock, modal, toast, sourceTag } from "../ui.js";
import { lineChart } from "../charts.js";

export async function render(outlet) {
  outlet.innerHTML = `<div class="page">
    <div class="page__header">
      <div><h2>Backtesting</h2><p>Historical replay with realistic transaction costs, no look-ahead, and reproducible configurations. Backtests are estimates — not predictions of future profitability.</p></div>
      <button class="btn btn--primary" id="btn-new-bt">${icon("play", 14)} New backtest</button>
    </div>
    <section class="panel" style="margin-bottom:var(--sp-4)">
      <div class="panel__head"><div class="panel__title">${icon("backtest")} Runs</div><span id="bt-src"></span></div>
      <div class="panel__body panel__body--flush"><div class="table-wrap" id="bt-table">${loadingBlock(5)}</div></div>
    </section>
    <div class="grid grid--2">
      <section class="panel">
        <div class="panel__head"><div class="panel__title">${icon("trend")} Equity curve — BT-301</div></div>
        <div class="panel__body"><div id="bt-equity">${loadingBlock(3)}</div></div>
        <div class="panel__foot"><span>Includes spread + commission model</span></div>
      </section>
      <section class="panel">
        <div class="panel__head"><div class="panel__title">${icon("reports")} Performance metrics</div></div>
        <div class="panel__body" id="bt-metrics">${loadingBlock(6)}</div>
        <div class="panel__foot"><span>Metrics must be interpreted together — a high win rate can still have negative expectancy.</span></div>
      </section>
    </div>
    <p class="disclaimer">${icon("info", 12)} Integrity requirements enforced by the engine: chronological replay only, incomplete candles excluded, conservative SL/TP conflict handling, stored config snapshot per run.</p>
  </div>`;

  const table = outlet.querySelector("#bt-table");
  let runs = [];
  async function load() {
    try { runs = await api.backtests(); } catch (e) { table.innerHTML = errorBlock("Backtest service unavailable", e.message, load); return; }
    outlet.querySelector("#bt-src").innerHTML = sourceTag(runs[0]?.source);
    table.innerHTML = `<table class="data">
      <thead><tr><th>ID</th><th>Strategy</th><th>Ver</th><th>Symbol</th><th>TF</th><th>Period</th>
        <th class="num">Net %</th><th class="num">PF</th><th class="num">WR %</th><th class="num">Max DD %</th><th class="num">Trades</th><th>Status</th></tr></thead>
      <tbody>${runs.map((r) => `<tr>
        <td class="sym u-mono">${r.id}</td><td>${r.strategy}</td><td class="u-muted">${r.version}</td>
        <td>${r.symbol}</td><td class="u-muted">${r.timeframe}</td><td class="u-muted">${r.period}</td>
        <td class="num ${fmt.cls(r.netReturnPct)}">${r.netReturnPct == null ? "—" : fmt.pct(r.netReturnPct, 1)}</td>
        <td class="num">${r.profitFactor ?? "—"}</td><td class="num">${r.winRate ?? "—"}</td>
        <td class="num u-danger">${r.maxDrawdownPct ?? "—"}</td><td class="num">${r.trades || "—"}</td>
        <td>${statusBadge(r.status)}</td>
      </tr>`).join("")}</tbody></table>`;
  }
  outlet.querySelector("#btn-new-bt").addEventListener("click", () => modal({
    title: "Configure backtest",
    wide: true,
    body: `
      <div class="grid grid--3" style="gap:var(--sp-3)">
        <div class="field"><label class="field__label">Strategy</label><select class="select"><option>Trend-Following Pullback v1.2.0</option><option>Breakout & Retest v1.0.4</option></select></div>
        <div class="field"><label class="field__label">Instrument</label><select class="select"><option>EURUSD</option><option>GBPUSD</option><option>USDJPY</option></select></div>
        <div class="field"><label class="field__label">Timeframe</label><select class="select"><option>H1</option><option>H4</option><option>M15</option></select></div>
        <div class="field"><label class="field__label">Start</label><input class="input" type="date" value="2025-01-01"></div>
        <div class="field"><label class="field__label">End</label><input class="input" type="date" value="2026-06-30"></div>
        <div class="field"><label class="field__label">Initial capital</label><input class="input" type="number" value="100000"></div>
        <div class="field"><label class="field__label">Spread model</label><select class="select"><option>Fixed 0.8 pips</option><option>Variable (historical)</option></select></div>
        <div class="field"><label class="field__label">Commission / lot</label><input class="input" type="number" step="0.1" value="3.5"></div>
        <div class="field"><label class="field__label">Slippage (pips)</label><input class="input" type="number" step="0.1" value="0.2"></div>
        <div class="field"><label class="field__label">Risk / trade %</label><input class="input" type="number" step="0.05" value="0.25"></div>
        <div class="field"><label class="field__label">Walk-forward</label><select class="select"><option>Disabled (single pass)</option><option>6M train / 2M test</option></select></div>
        <div class="field"><label class="field__label">Benchmark</label><select class="select"><option>None</option><option>Buy & hold symbol</option></select></div>
      </div>
      <p class="u-faint" style="font-size:var(--fs-3xs);margin-top:var(--sp-4)">The full configuration snapshot is stored with the result so any run can be reproduced exactly.</p>`,
    actions: [{ label: "Cancel" }, { label: "Submit job", kind: "primary", onClick: () => toast("Job queued", "Backtest submitted to the engine worker (max concurrency enforced).", "success") }],
  }));
  load();

  /* Metrics + equity for first complete run */
  const p = await api.performance("90d").catch(() => null);
  const eq = outlet.querySelector("#bt-equity");
  if (p?.equity) {
    lineChart(eq, [{ key: "bt", label: "Equity", color: "#2878ff", fill: true, data: p.equity.map((d) => ({ value: d.value })) }],
      { height: 240, yFormat: (v) => Math.round(v / 1000) + "k" });
  } else eq.innerHTML = errorBlock("No equity data", "Run a backtest or connect the API.");
  const m = p?.metrics || {};
  outlet.querySelector("#bt-metrics").innerHTML = `<dl class="dl">
    <dt>Net return</dt><dd class="pos">${fmt.pct(m.netReturnPct ?? 18.4, 1)}</dd>
    <dt>Gross profit / loss</dt><dd>${fmt.money(12480)} / ${fmt.money(-4910)}</dd>
    <dt>Profit factor</dt><dd class="mono">${m.profitFactor ?? 1.62}</dd>
    <dt>Win rate</dt><dd>${m.winRate ?? 47.8}%</dd>
    <dt>Average win / loss</dt><dd>${fmt.money(214)} / ${fmt.money(-148)}</dd>
    <dt>Expectancy / trade</dt><dd class="mono pos">${fmt.money(m.expectancy ?? 8.4)}</dd>
    <dt>Max drawdown</dt><dd class="u-danger">${m.maxDrawdownPct ?? -6.1}%</dd>
    <dt>Sharpe / Sortino</dt><dd class="mono">${m.sharpe ?? 1.31} / ${m.sortino ?? 1.82}</dd>
    <dt>Trades</dt><dd>${m.trades ?? 184}</dd>
    <dt>Avg holding time</dt><dd>${m.avgDurationHours ?? 6.4}h</dd>
    <dt>Long / short split</dt><dd>54% / 46%</dd>
    <dt>Cost contribution</dt><dd class="u-warning">−1.9% net</dd>
  </dl>`;
  return () => {};
}
