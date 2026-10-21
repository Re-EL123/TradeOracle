/* Overview — system-at-a-glance */
import { api } from "../api.js";
import { fmt, state } from "../state.js";
import { icon, badge, statusBadge, sourceTag, errorBlock, loadingBlock, meter } from "../ui.js";
import { lineChart, sparkline } from "../charts.js";

export async function render(outlet) {
  let [risk, perf, markets, signals, positions, engine] = await Promise.all([
    api.riskSummary().catch(() => null),
    api.performance("30d").catch(() => null),
    api.markets().catch(() => []),
    api.signals().catch(() => []),
    api.positions().catch(() => []),
    api.engineStatus().catch(() => state.engine || { status: "UNKNOWN", components: {} }),
  ]);

  const sim = risk?.source === "SIMULATED";
  const halted = engine.mode === "HALTED" || state.halted;
  const activeSignals = (signals || []).filter((s) => ["ELIGIBLE", "EVALUATING"].includes(s.status));

  outlet.innerHTML = `
  <div class="page">
    ${halted ? `<div class="halt-banner">${icon("alert", 18)} <div><b>EMERGENCY STOP ACTIVE</b> — new order submissions are blocked. Existing positions remain monitored.</div></div>` : ""}
    <div class="page__header">
      <div>
        <h2>Overview</h2>
        <p>System state, account summary, market conditions and engine health in a single view. All values carry their source and timestamp.</p>
      </div>
      <div class="u-flex u-gap-2 u-items-center">
        ${sourceTag(risk?.source)}
        ${risk ? `<span class="chip"><span class="chip__dot"></span>Updated ${fmt.age(new Date().toISOString())}</span>` : ""}
      </div>
    </div>

    <div class="grid grid--metrics" id="metrics">
      ${risk ? metricCards(risk) : loadingMetrics()}
    </div>

    <div class="grid grid--sidebar-right" style="margin-top:var(--sp-4)">
      <div class="grid" style="gap:var(--sp-4)">
        <section class="panel">
          <div class="panel__head">
            <div class="panel__title">${icon("trend")} Equity curve — 30 days</div>
            <div class="panel__actions">
              <div class="seg" id="range-seg">
                <button data-r="7d">7D</button><button data-r="30d" class="is-active">30D</button><button data-r="90d">90D</button>
              </div>
            </div>
          </div>
          <div class="panel__body">
            <div id="equity-chart" style="min-height:260px">${loadingBlock(3)}</div>
            <p class="u-faint" style="font-size:var(--fs-3xs);margin-top:var(--sp-2)">
              Solid line: account equity (realised + mark-to-market). Drawdown shown beneath.
              ${sim ? "Values are simulated until the API and engine are connected." : ""}
            </p>
          </div>
        </section>

        <section class="panel">
          <div class="panel__head"><div class="panel__title">${icon("markets")} Market overview</div>
            <div class="panel__actions"><button class="btn btn--sm" data-goto="markets">Open markets ${icon("trend", 13)}</button></div>
          </div>
          <div class="panel__body panel__body--flush">
            <div class="table-wrap">
              <table class="data">
                <thead><tr>
                  <th>Instrument</th><th class="num">Bid</th><th class="num">Ask</th><th class="num">Spread</th>
                  <th class="num">Change</th><th>Trend</th><th>Volatility</th><th>Signal</th><th>Data age</th>
                </tr></thead>
                <tbody>
                  ${(markets || []).slice(0, 7).map((m) => `
                    <tr class="is-clickable" data-symbol="${m.symbol}">
                      <td class="sym">${m.symbol}</td>
                      <td class="num">${fmt.price(m.bid, m.symbol)}</td>
                      <td class="num">${fmt.price(m.ask, m.symbol)}</td>
                      <td class="num">${m.spreadPips} pips</td>
                      <td class="num ${fmt.cls(m.changePct)}">${fmt.pct(m.changePct)}</td>
                      <td>${trendTag(m.trend)}</td>
                      <td>${volTag(m.volatility)}</td>
                      <td>${m.signal ? badge(`${m.signal.direction} ${m.signal.score}`, m.signal.direction === "LONG" ? "green" : "red") : badge("—", "grey")}</td>
                      <td class="u-muted">${fmt.age(m.updatedAt)}</td>
                    </tr>`).join("") || `<tr><td colspan="9">${errorBlock("No market data", "Start the API/engine or check provider configuration.", () => render(outlet))}</td></tr>`}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>

      <div class="grid" style="gap:var(--sp-4);align-content:start">
        <section class="panel">
          <div class="panel__head"><div class="panel__title">${icon("risk")} Risk utilisation</div></div>
          <div class="panel__body">
            ${risk ? riskPanel(risk) : loadingBlock(5)}
          </div>
        </section>

        <section class="panel">
          <div class="panel__head"><div class="panel__title">${icon("signals")} Active signals</div>
            <span class="badge badge--blue">${activeSignals.length}</span>
          </div>
          <div class="panel__body panel__body--flush">
            <div class="feed">
              ${activeSignals.length ? activeSignals.slice(0, 5).map((s) => `
                <div class="feed__item">
                  <div class="feed__icon feed__icon--signal">${icon("signals", 11)}</div>
                  <div class="feed__text"><b>${s.symbol}</b> ${s.direction} · ${s.strategy} · score ${s.score}
                    <div class="u-faint" style="font-size:var(--fs-3xs)">R:R ${s.rr ?? "—"} · ${s.timeframe} · ${s.regime}</div>
                  </div>
                  <div class="feed__time">${fmt.age(s.timestamp)}</div>
                </div>`).join("") : `<div class="state" style="min-height:120px"><p>No active signals</p></div>`}
            </div>
          </div>
          <div class="panel__foot"><span>Signals are opportunities, not guarantees.</span><button class="btn btn--ghost btn--sm" data-goto="signals">All signals</button></div>
        </section>

        <section class="panel">
          <div class="panel__head"><div class="panel__title">${icon("paper")} Open positions</div>
            <span class="badge badge--grey">${(positions || []).length}</span>
          </div>
          <div class="panel__body panel__body--flush">
            ${(positions || []).length ? positions.map((p) => `
              <div class="feed__item">
                <div class="feed__icon ${p.direction === "LONG" ? "feed__icon--ok" : "feed__icon--risk"}">${icon("paper", 11)}</div>
                <div class="feed__text"><b>${p.symbol}</b> ${p.direction} · ${p.volume}
                  <div class="u-faint" style="font-size:var(--fs-3xs)">@ ${fmt.price(p.entry, p.symbol)} · SL ${fmt.price(p.stopLoss, p.symbol)}</div>
                </div>
                <div class="feed__time ${fmt.cls(p.pnl)}">${fmt.money(p.pnl, "ZAR")}</div>
              </div>`).join("") : `<div class="state" style="min-height:100px"><p>No open positions</p></div>`}
          </div>
          <div class="panel__foot"><span>Mode: ${engine.mode || "—"}</span><button class="btn btn--ghost btn--sm" data-goto="portfolio">Risk detail</button></div>
        </section>
      </div>
    </div>

    <p class="disclaimer">
      ${icon("info", 12)} TradeOracle outputs analysis and research. Nothing here is financial advice or a guarantee of profit.
      Backtest and paper results are estimates. ${sim ? "This session is displaying SIMULATED fallback data because the API is unreachable." : ""}
    </p>
  </div>`;

  /* Wire interactions */
  outlet.querySelectorAll("[data-goto]").forEach((b) => b.addEventListener("click", () => import("../router.js").then((r) => r.navigate(b.dataset.goto))));
  outlet.querySelectorAll("[data-symbol]").forEach((tr) =>
    tr.addEventListener("click", () => {
      sessionStorage.setItem("to:symbol", tr.dataset.symbol);
      import("../router.js").then((r) => r.navigate("chart"));
    })
  );

  const chartEl = outlet.querySelector("#equity-chart");
  const draw = async (range) => {
    const p = await api.performance(range).catch(() => null);
    if (!p) { chartEl.innerHTML = errorBlock("Performance unavailable", "Connect the API to load equity history.", () => draw(range)); return; }
    lineChart(chartEl, [
      { key: "eq", label: "Equity (ZAR)", color: "#2878ff", fill: true, data: p.equity.map((d) => ({ value: d.value })) },
    ], { height: 260, yFormat: (v) => "R" + Math.round(v).toLocaleString("en-ZA") });
    const ddEl = document.createElement("div");
    ddEl.style.marginTop = "8px";
    chartEl.parentElement.insertBefore(ddEl, chartEl.nextSibling);
    lineChart(ddEl, [
      { key: "dd", label: "Drawdown %", color: "#ef4444", fill: true, data: p.drawdown.map((d) => ({ value: d.value })) },
    ], { height: 90, yFormat: (v) => v.toFixed(1) + "%" });
    const old = chartEl.parentElement.querySelectorAll("div[style*='margin-top: 8px'], div[style*='margin-top:8px']");
    void old;
  };
  draw("30d");
  outlet.querySelector("#range-seg").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    outlet.querySelectorAll("#range-seg button").forEach((x) => x.classList.remove("is-active"));
    b.classList.add("is-active");
    draw(b.dataset.r);
  });

  /* Metric card sparklines */
  if (perf?.equity) {
    outlet.querySelectorAll("[data-spark]").forEach((c) => {
      sparkline(c, perf.equity.slice(-30).map((d) => d.value), { color: c.dataset.spark === "neg" ? "#ef4444" : "#2878ff" });
    });
  }

  return () => {};
}

function metricCards(r) {
  const cards = [
    { label: "Account equity", value: fmt.money(r.equity), sub: `Balance ${fmt.money(r.balance)}`, spark: "pos" },
    { label: "Today realised P&L", value: fmt.money(r.realisedToday), cls: fmt.cls(r.realisedToday), sub: "Closed trades", spark: r.realisedToday >= 0 ? "pos" : "neg" },
    { label: "Today unrealised P&L", value: fmt.money(r.unrealised), cls: fmt.cls(r.unrealised), sub: "Mark-to-market", spark: r.unrealised >= 0 ? "pos" : "neg" },
    { label: "Open positions", value: String(r.openPositions), sub: `Max ${r.limits?.maxPositions ?? "—"}`, spark: "" },
    { label: "Current drawdown", value: fmt.pct(-Math.abs(r.drawdownPct), 2, false), cls: r.drawdownPct > 3 ? "u-warning" : "", sub: `Limit ${r.limits?.maxDrawdownPct}%`, spark: "neg" },
    { label: "Daily risk consumed", value: fmt.pct(r.dailyLossUsedPct, 2, false), cls: r.dailyLossUsedPct > 0.7 * (r.limits?.maxDailyLossPct || 1) ? "u-warning" : "", sub: `Limit ${r.limits?.maxDailyLossPct}%/day`, spark: "" },
    { label: "Open risk", value: fmt.pct(r.openRiskPct, 2, false), sub: `Aggregate cap ${r.limits?.maxOpenRiskPct}%`, spark: "" },
    { label: "Margin used", value: fmt.pct(r.marginUsedPct, 1, false), sub: "Of free margin", spark: "" },
  ];
  return cards
    .map(
      (c) => `<div class="metric">
      <div class="metric__label">${c.label}</div>
      <div class="metric__value ${c.cls || ""}">${c.value}</div>
      <div class="metric__sub">${c.sub}</div>
      <div class="metric__spark" data-spark="${c.spark}"></div>
    </div>`
    )
    .join("");
}

function loadingMetrics() {
  return Array.from({ length: 8 }, () => `<div class="metric"><div class="skeleton skeleton--text"></div><div class="skeleton skeleton--value"></div><div class="skeleton skeleton--text"></div></div>`).join("");
}

function riskPanel(r) {
  const rows = [
    ["Risk / trade", r.limits?.riskPerTradePct, 1, "%"],
    ["Daily loss used", r.dailyLossUsedPct, r.limits?.maxDailyLossPct, "%"],
    ["Drawdown", r.drawdownPct, r.limits?.maxDrawdownPct, "%"],
    ["Open risk", r.openRiskPct, r.limits?.maxOpenRiskPct, "%"],
    ["Positions", r.openPositions, r.limits?.maxPositions, ""],
  ];
  return `<div class="evidence">${rows
    .map(([label, v, max, unit]) => {
      const pct = max ? (Number(v) / Number(max)) * 100 : 0;
      const kind = pct > 90 ? "meter__fill--danger" : pct > 65 ? "meter__fill--warn" : "";
      return `<div class="evidence__row" style="grid-template-columns:1fr">
        <div class="u-flex u-between" style="font-size:var(--fs-2xs)"><span class="u-muted">${label}</span><span class="mono">${v}${unit}</span></div>
        ${meter(pct, kind)}
      </div>`;
    })
    .join("")}</div>
    <div class="u-flex u-between" style="margin-top:var(--sp-4);font-size:var(--fs-2xs)">
      <span class="u-muted">Consecutive losses</span><span>${r.consecutiveLosses ?? 0}</span>
    </div>`;
}

function trendTag(t) {
  const map = { UPTREND: ["green", "▲"], DOWNTREND: ["red", "▼"], RANGE: ["grey", "↔"], BREAKOUT: ["amber", "↗"] };
  const [k, g] = map[t] || ["grey", "·"];
  return `<span class="badge badge--${k}">${g} ${t || "—"}</span>`;
}
function volTag(v) {
  const map = { LOW: "info", NORMAL: "blue", ELEVATED: "amber", HIGH: "red" };
  return `<span class="badge badge--${map[v] || "grey"}">${v || "—"}</span>`;
}
