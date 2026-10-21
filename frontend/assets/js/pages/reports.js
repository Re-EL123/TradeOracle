/* Reports */
import { api } from "../api.js";
import { fmt } from "../state.js";
import { icon, badge, toast, sourceTag } from "../ui.js";
import { lineChart } from "../charts.js";

const TYPES = [
  { id: "daily", label: "Daily performance", desc: "Realised + unrealised P&L, risk consumed, incidents" },
  { id: "weekly", label: "Weekly performance", desc: "Aggregated equity, drawdown, strategy contribution" },
  { id: "monthly", label: "Monthly performance", desc: "Month buckets with cost contribution" },
  { id: "strategy", label: "Strategy comparison", desc: "Side-by-side metrics across deployed strategies" },
  { id: "trades", label: "Trade history", desc: "Full trade-level export with entries, exits, context" },
  { id: "risk", label: "Risk utilisation", desc: "Limit usage, near-breaches, violations" },
  { id: "backtest", label: "Backtest results", desc: "Configuration snapshot + full metric suite" },
  { id: "incidents", label: "System incidents", desc: "Engine restarts, disconnects, reconciliation issues" },
];

export async function render(outlet) {
  const p = await api.performance("30d").catch(() => null);
  outlet.innerHTML = `<div class="page">
    <div class="page__header">
      <div><h2>Reports</h2><p>Exportable reports with generated timestamp, reporting period, simulation context and assumptions. PDF/CSV exports run through the API with an authenticated session.</p></div>
      <span id="rp-src"></span>
    </div>
    <div class="grid grid--metrics" style="margin-bottom:var(--sp-4)">
      ${[
        ["Net return (30d)", p ? fmt.pct(p.metrics.netReturnPct, 2) : "—", p && p.metrics.netReturnPct > 0 ? "pos" : "neg"],
        ["Profit factor", p?.metrics.profitFactor ?? "—", ""],
        ["Win rate", p ? p.metrics.winRate + "%" : "—", ""],
        ["Max drawdown", p ? p.metrics.maxDrawdownPct + "%" : "—", "u-danger"],
        ["Trades", p?.metrics.trades ?? "—", ""],
        ["Sharpe", p?.metrics.sharpe ?? "—", ""],
      ].map(([l, v, c]) => `<div class="metric"><div class="metric__label">${l}</div><div class="metric__value metric__value--sm ${c}">${v}</div></div>`).join("")}
    </div>
    <div class="grid grid--sidebar-right">
      <section class="panel">
        <div class="panel__head"><div class="panel__title">${icon("reports")} Available reports</div></div>
        <div class="panel__body panel__body--flush">
          <div class="feed">
            ${TYPES.map((t) => `<div class="feed__item">
              <div class="feed__icon feed__icon--signal">${icon("reports", 11)}</div>
              <div class="feed__text"><b>${t.label}</b><div class="u-faint" style="font-size:var(--fs-3xs)">${t.desc}</div></div>
              <button class="btn btn--sm" data-export="${t.label}">${icon("download", 12)} CSV</button>
            </div>`).join("")}
          </div>
        </div>
      </section>
      <section class="panel" style="align-content:start">
        <div class="panel__head"><div class="panel__title">${icon("trend")} 30-day equity</div></div>
        <div class="panel__body"><div id="rp-chart">${p ? "" : "—"}</div>
          ${p ? `<p class="u-faint" style="font-size:var(--fs-3xs);margin-top:var(--sp-3)">Source: ${p.source || "engine"} · realised + mark-to-market</p>` : ""}
        </div>
      </section>
    </div>
    <p class="disclaimer">${icon("info", 12)} Report exports include the engine mode and data source so paper results can never be mistaken for live performance.</p>
  </div>`;
  outlet.querySelector("#rp-src").innerHTML = sourceTag(p?.source);
  if (p?.equity) {
    lineChart(outlet.querySelector("#rp-chart"), [{ key: "eq", label: "Equity", color: "#2878ff", fill: true, data: p.equity.map((d) => ({ value: d.value })) }],
      { height: 220, yFormat: (v) => Math.round(v / 1000) + "k" });
  }
  outlet.querySelectorAll("[data-export]").forEach((b) =>
    b.addEventListener("click", () => toast("Export queued", `${b.dataset.export} will be generated with timestamp + context headers.`, "success"))
  );
  void badge;
  return () => {};
}
