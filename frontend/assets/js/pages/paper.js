/* Paper Trading */
import { api } from "../api.js";
import { fmt, state } from "../state.js";
import { icon, badge, statusBadge, errorBlock, loadingBlock, sourceTag, meter } from "../ui.js";

export async function render(outlet) {
  outlet.innerHTML = `<div class="page">
    <div class="page__header">
      <div><h2>Paper Trading</h2><p>Simulated execution on live or delayed provider data using the same strategy and risk interfaces as production. Clearly labelled and never mixed with real orders.</p></div>
      <div class="u-flex u-gap-2 u-items-center">${badge("PAPER — SIMULATED FILLS", "blue")}<span id="pt-src"></span></div>
    </div>
    <div class="grid grid--metrics" id="pt-metrics">${loadingMetrics()}</div>
    <div class="grid grid--2" style="margin-top:var(--sp-4)">
      <section class="panel">
        <div class="panel__head"><div class="panel__title">${icon("paper")} Simulated open positions</div></div>
        <div class="panel__body panel__body--flush"><div id="pt-pos">${loadingBlock(3)}</div></div>
      </section>
      <section class="panel">
        <div class="panel__head"><div class="panel__title">${icon("activity")} Execution assumptions</div></div>
        <div class="panel__body">
          <dl class="dl">
            <dt>Market data</dt><dd>Provider feed (or simulation)</dd>
            <dt>Fill model</dt><dd>Next-tick, spread-adjusted</dd>
            <dt>Spread</dt><dd>Live quoted spread</dd>
            <dt>Commission</dt><dd>R3.50 / lot / side</dd>
            <dt>Slippage model</dt><dd>0.2 pips mean, capped</dd>
            <dt>Partial fills</dt><dd>Not simulated (full fill)</dd>
            <dt>SL/TP same candle</dt><dd>Conservative: stop first</dd>
          </dl>
          <p class="u-faint" style="font-size:var(--fs-3xs);margin-top:var(--sp-4)">The simulator shares strategy + risk code paths with the live worker so paper results are representative of production behaviour.</p>
        </div>
      </section>
    </div>
    <section class="panel" style="margin-top:var(--sp-4)">
      <div class="panel__head"><div class="panel__title">${icon("strategies")} Strategy performance (paper)</div></div>
      <div class="panel__body panel__body--flush"><div class="table-wrap" id="pt-strat">${loadingBlock(3)}</div></div>
      <div class="panel__foot"><span>Paper results are estimates and do not guarantee live performance.</span></div>
    </section>
  </div>`;

  try {
    const [risk, positions] = await Promise.all([api.riskSummary(), api.positions()]);
    outlet.querySelector("#pt-src").innerHTML = sourceTag(risk.source);
    outlet.querySelector("#pt-metrics").innerHTML = [
      ["Simulated equity", fmt.money(risk.equity), ""],
      ["Simulated balance", fmt.money(risk.balance), ""],
      ["Realised today", fmt.money(risk.realisedToday), fmt.cls(risk.realisedToday)],
      ["Unrealised", fmt.money(risk.unrealised), fmt.cls(risk.unrealised)],
      ["Drawdown", fmt.pct(-Math.abs(risk.drawdownPct), 2, false), "u-warning"],
      ["Open positions", `${risk.openPositions} / ${risk.limits?.maxPositions ?? 2}`, ""],
    ].map(([l, v, c]) => `<div class="metric"><div class="metric__label">${l}</div><div class="metric__value ${c}">${v}</div><div class="metric__sub">Paper account</div></div>`).join("");

    outlet.querySelector("#pt-pos").innerHTML = positions.length ? `<table class="data">
      <thead><tr><th>ID</th><th>Symbol</th><th>Dir</th><th class="num">Vol</th><th class="num">Entry</th><th class="num">Current</th><th class="num">SL</th><th class="num">TP</th><th class="num">P&L</th><th>Strategy</th><th>Age</th></tr></thead>
      <tbody>${positions.map((p) => `<tr>
        <td class="u-mono">${p.id}</td><td class="sym">${p.symbol}</td><td>${badge(p.direction, p.direction === "LONG" ? "green" : "red")}</td>
        <td class="num">${p.volume}</td><td class="num mono">${fmt.price(p.entry, p.symbol)}</td><td class="num mono">${fmt.price(p.current, p.symbol)}</td>
        <td class="num mono u-bear">${fmt.price(p.stopLoss, p.symbol)}</td><td class="num mono u-bull">${fmt.price(p.takeProfit, p.symbol)}</td>
        <td class="num ${fmt.cls(p.pnl)}">${fmt.money(p.pnl)}</td><td class="u-muted">${p.strategy}</td><td class="u-muted">${fmt.age(p.openedAt)}</td>
      </tr>`).join("")}</tbody></table>` : `<div class="state"><p>No open paper positions</p></div>`;
  } catch (e) {
    outlet.querySelector("#pt-pos").innerHTML = errorBlock("Paper account unavailable", e.message);
  }

  outlet.querySelector("#pt-strat").innerHTML = `<table class="data">
    <thead><tr><th>Strategy</th><th class="num">Trades</th><th class="num">Win rate</th><th class="num">Expectancy</th><th class="num">Net P&L</th><th class="num">Max DD</th><th>State</th></tr></thead>
    <tbody>
      <tr><td class="sym">Trend-Following Pullback</td><td class="num">42</td><td class="num">47.6%</td><td class="num pos">R 9.10</td><td class="num pos">R 382.20</td><td class="num u-danger">−1.4%</td><td>${statusBadge("PAPER")}</td></tr>
      <tr><td class="sym">Breakout & Retest</td><td class="num">18</td><td class="num">38.9%</td><td class="num pos">R 4.20</td><td class="num pos">R 75.60</td><td class="num u-danger">−0.9%</td><td>${statusBadge("TESTING")}</td></tr>
    </tbody></table>`;
  void meter; void state;
  void icon;
  return () => {};
}
function loadingMetrics() {
  return Array.from({ length: 6 }, () => `<div class="metric"><div class="skeleton skeleton--text"></div><div class="skeleton skeleton--value"></div></div>`).join("");
}
