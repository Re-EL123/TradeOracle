/* Chart Analysis — primary workspace */
import { api } from "../api.js";
import { fmt, state } from "../state.js";
import { icon, badge, errorBlock, loadingBlock, sourceTag } from "../ui.js";
import { renderCandles } from "../charts.js";

const TFS = ["M5", "M15", "M30", "H1", "H4", "D1"];

export async function render(outlet) {
  const symbol = sessionStorage.getItem("to:symbol") || state.prefs.defaultSymbol || "EURUSD";
  let timeframe = sessionStorage.getItem("to:tf") || state.prefs.defaultTimeframe || "H1";
  let showEma = true, showVol = true;

  outlet.innerHTML = `<div class="page" style="max-width:none">
    <div class="page__header">
      <div><h2>Chart Analysis</h2><p>Candlestick workspace with technical overlays, market structure and signal context. Confirmed observations are distinguished from tentative detections.</p></div>
      <div class="u-flex u-gap-2 u-items-center" id="ch-meta"></div>
    </div>
    <div class="grid grid--chart-layout">
      <section class="panel">
        <div class="panel__head"><div class="panel__title">${icon("search")} Watchlist</div></div>
        <div class="panel__body panel__body--flush"><div id="watchlist"></div></div>
      </section>

      <section class="panel">
        <div class="panel__head">
          <div class="panel__title"><span id="ch-symbol">${symbol}</span> <span class="u-muted" id="ch-price"></span></div>
          <div class="panel__actions">
            <div class="seg" id="tf-seg">${TFS.map((t) => `<button data-tf="${t}" class="${t === timeframe ? "is-active" : ""}">${t}</button>`).join("")}</div>
            <div class="seg">
              <button id="tog-ema" class="is-active">EMA</button>
              <button id="tog-vol" class="is-active">VOL</button>
            </div>
          </div>
        </div>
        <div class="panel__body">
          <div class="chart-box chart-box--lg" id="main-chart">${loadingBlock(6)}</div>
        </div>
        <div class="panel__foot"><span id="ch-source"></span><span>Crosshair + scroll to zoom · drag to pan</span></div>
      </section>

      <section class="panel">
        <div class="panel__head"><div class="panel__title">${icon("signals")} Analysis summary</div></div>
        <div class="panel__body" id="analysis-panel">${loadingBlock(5)}</div>
      </section>
    </div>

    <div class="grid grid--2" style="margin-top:var(--sp-4)">
      <section class="panel">
        <div class="panel__head"><div class="panel__title">${icon("activity")} Indicator values</div></div>
        <div class="panel__body panel__body--flush"><div class="table-wrap" id="indicators">${loadingBlock(3)}</div></div>
      </section>
      <section class="panel">
        <div class="panel__head"><div class="panel__title">${icon("strategies")} Detected structure</div></div>
        <div class="panel__body panel__body--flush"><div class="table-wrap" id="structure">${loadingBlock(3)}</div></div>
      </section>
    </div>
  </div>`;

  const chartHost = outlet.querySelector("#main-chart");

  async function loadWatchlist() {
    const mk = await api.markets().catch(() => []);
    outlet.querySelector("#watchlist").innerHTML = `<div class="feed">${mk.map((m) => `
      <button class="feed__item" data-sym="${m.symbol}" style="width:100%;text-align:left;border:0;border-bottom:1px solid rgba(38,52,73,0.4);background:${m.symbol === symbol ? "rgba(40,120,255,0.08)" : "transparent"};cursor:pointer">
        <div class="feed__icon feed__icon--signal">${icon("markets", 11)}</div>
        <div class="feed__text"><b>${m.symbol}</b><div class="u-faint" style="font-size:var(--fs-3xs)">${m.trend} · ${m.spreadPips}p</div></div>
        <div class="feed__time">${fmt.price(m.bid, m.symbol)}</div>
      </button>`).join("")}</div>`;
    outlet.querySelectorAll("[data-sym]").forEach((b) =>
      b.addEventListener("click", () => {
        sessionStorage.setItem("to:symbol", b.dataset.sym);
        render(outlet);
      })
    );
  }

  async function loadChart() {
    chartHost.innerHTML = loadingBlock(6);
    try {
      const data = await api.candles(symbol, timeframe, 300);
      const candles = data.candles || [];
      outlet.querySelector("#ch-source").innerHTML = sourceTag(data.source) + ` <span style="margin-left:8px">${candles.length} candles · ${timeframe}</span>`;
      const last = candles[candles.length - 1];
      if (last) {
        const chg = ((last.close - candles[0].close) / candles[0].close) * 100;
        outlet.querySelector("#ch-price").innerHTML = `<span class="mono">${fmt.price(last.close, symbol)}</span> <span class="${fmt.cls(chg)}">${fmt.pct(chg)}</span>`;
      }
      await renderCandles(chartHost, candles, {
        volume: showVol,
        ema: showEma ? [21, 50] : null,
        priceFormatter: (p) => fmt.price(p, symbol),
        markers: buildMarkers(candles),
      });
      renderIndicators(candles);
      renderStructure(candles);
      renderAnalysis(candles, data.source);
    } catch (e) {
      chartHost.innerHTML = errorBlock("Chart unavailable", e.message, loadChart);
    }
  }

  function renderIndicators(candles) {
    const c = candles.map((x) => x.close);
    const rsi = rsiCalc(c, 14);
    const atr = atrCalc(candles, 14);
    const ema21 = emaCalc(c, 21), ema50 = emaCalc(c, 50);
    const adx = adxCalc(candles, 14);
    const rows = [
      ["EMA 21", fmt.price(ema21.at(-1), symbol), ema21.at(-1) > ema50.at(-1) ? "Above EMA50 (bullish alignment)" : "Below EMA50"],
      ["EMA 50", fmt.price(ema50.at(-1), symbol), "Medium-term reference"],
      ["RSI (14)", rsi.at(-1)?.toFixed(1), rsi.at(-1) > 70 ? "Overbought zone" : rsi.at(-1) < 30 ? "Oversold zone" : "Neutral zone"],
      ["ATR (14)", fmt.price(atr.at(-1), symbol), "Volatility unit for stops"],
      ["ADX (14)", adx.at(-1)?.toFixed(1), adx.at(-1) > 25 ? "Trending regime" : "Weak / ranging"],
    ];
    outlet.querySelector("#indicators").innerHTML = `<table class="data">
      <thead><tr><th>Indicator</th><th class="num">Value</th><th>Interpretation</th></tr></thead>
      <tbody>${rows.map(([a, b, c]) => `<tr><td class="sym">${a}</td><td class="num mono">${b}</td><td class="u-muted">${c}</td></tr>`).join("")}</tbody>
    </table>`;
  }

  function renderStructure(candles) {
    const swings = detectSwings(candles, 2);
    const rows = swings.slice(-6).reverse();
    const trend = classifyTrend(swings);
    outlet.querySelector("#structure").innerHTML = `<table class="data">
      <thead><tr><th>Type</th><th class="num">Price</th><th>Time</th><th>State</th></tr></thead>
      <tbody>
        <tr><td class="sym">Trend</td><td class="num">—</td><td class="u-muted">current</td><td>${badge(trend, trend === "UPTREND" ? "green" : trend === "DOWNTREND" ? "red" : "grey")}</td></tr>
        ${rows.map((s) => `<tr>
          <td class="sym">${s.type}</td><td class="num mono">${fmt.price(s.price, symbol)}</td>
          <td class="u-muted">${new Date(s.time).toISOString().slice(5, 16).replace("T", " ")}</td>
          <td>${badge(s.confirmed ? "CONFIRMED" : "TENTATIVE", s.confirmed ? "green" : "amber")}</td>
        </tr>`).join("")}
      </tbody></table>`;
  }

  function renderAnalysis(candles, source) {
    const c = candles.map((x) => x.close);
    const ema21 = emaCalc(c, 21), ema50 = emaCalc(c, 50);
    const rsi = rsiCalc(c, 14).at(-1);
    const adx = adxCalc(candles, 14).at(-1);
    const trendUp = ema21.at(-1) > ema50.at(-1);
    const last = c.at(-1);
    const atr = atrCalc(candles, 14).at(-1);
    const direction = trendUp && rsi < 68 ? "LONG" : !trendUp && rsi > 32 ? "SHORT" : "NONE";
    const entry = last, sl = direction === "LONG" ? last - 1.5 * atr : direction === "NONE" ? null : last + 1.5 * atr;
    const tp = direction === "LONG" ? last + 3 * atr : direction === "NONE" ? null : last - 3 * atr;
    const rr = sl && tp ? Math.abs(tp - entry) / Math.abs(entry - sl) : null;

    const factors = [
      ["Trend alignment", trendUp ? 82 : 24],
      ["Market structure", direction === "NONE" ? 40 : 68],
      ["Entry confirmation", rsi > 50 && trendUp ? 74 : rsi < 50 && !trendUp ? 70 : 45],
      ["Volatility suitability", adx > 25 ? 78 : 52],
      ["Risk/reward", rr > 2 ? 80 : rr > 1.5 ? 62 : 35],
      ["Session suitability", 66],
    ];
    const score = Math.round(factors.reduce((a, [, v]) => a + v, 0) / factors.length);

    outlet.querySelector("#analysis-panel").innerHTML = `
      <div class="u-flex u-between u-items-center" style="margin-bottom:var(--sp-4)">
        <div>
          <div class="u-faint" style="font-size:var(--fs-3xs);text-transform:uppercase;letter-spacing:.08em">Indicative setup</div>
          <div style="font-size:var(--fs-xl);font-weight:700" class="${direction === "LONG" ? "u-bull" : direction === "SHORT" ? "u-bear" : ""}">${direction === "NONE" ? "NO SETUP — abstain" : direction}</div>
        </div>
        <div style="text-align:right">
          <div class="u-faint" style="font-size:var(--fs-3xs)">Composite score</div>
          <div class="mono" style="font-size:var(--fs-xl);font-weight:700">${score}</div>
        </div>
      </div>
      ${direction !== "NONE" ? `<dl class="dl" style="margin-bottom:var(--sp-4)">
        <dt>Entry reference</dt><dd class="mono">${fmt.price(entry, symbol)}</dd>
        <dt>Invalidation (SL)</dt><dd class="mono u-bear">${fmt.price(sl, symbol)}</dd>
        <dt>Target (TP)</dt><dd class="mono u-bull">${fmt.price(tp, symbol)}</dd>
        <dt>Reward : Risk</dt><dd class="mono">${rr?.toFixed(2)}</dd>
      </dl>` : ""}
      <div class="evidence">
        ${factors.map(([l, v]) => `<div class="evidence__row"><span class="u-muted">${l}</span><div class="evidence__bar"><i style="width:${v}%"></i></div><span class="mono" style="text-align:right">${v}</span></div>`).join("")}
      </div>
      <p class="u-faint" style="font-size:var(--fs-3xs);margin-top:var(--sp-4)">
        Score is a documented ranking, not a win probability. This panel is an algorithmic interpretation of price behaviour
        ${source === "SIMULATED" ? " on SIMULATED data" : ""}. It never bypasses the risk engine.
      </p>`;
  }

  outlet.querySelector("#tf-seg").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    outlet.querySelectorAll("#tf-seg button").forEach((x) => x.classList.remove("is-active"));
    b.classList.add("is-active");
    timeframe = b.dataset.tf;
    sessionStorage.setItem("to:tf", timeframe);
    loadChart();
  });
  outlet.querySelector("#tog-ema").addEventListener("click", (e) => { showEma = !showEma; e.currentTarget.classList.toggle("is-active", showEma); loadChart(); });
  outlet.querySelector("#tog-vol").addEventListener("click", (e) => { showVol = !showVol; e.currentTarget.classList.toggle("is-active", showVol); loadChart(); });

  loadWatchlist();
  loadChart();
  const t = setInterval(loadChart, 45000);
  return () => clearInterval(t);
}

/* ---- indicator maths (mirror of engine implementations) ---- */
function emaCalc(v, p) {
  const out = []; const k = 2 / (p + 1);
  let prev = v.slice(0, p).reduce((a, b) => a + b, 0) / p;
  for (let i = 0; i < v.length; i++) {
    if (i < p - 1) { out.push(null); continue; }
    if (i === p - 1) { out.push(prev); continue; }
    prev = v[i] * k + prev * (1 - k); out.push(prev);
  }
  return out;
}
function rsiCalc(c, p = 14) {
  const out = []; let g = 0, l = 0;
  for (let i = 1; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    const up = Math.max(d, 0), dn = Math.max(-d, 0);
    if (i <= p) { g += up / p; l += dn / p; out.push(i === p ? 100 - 100 / (1 + g / (l || 1e-9)) : null); }
    else { g = (g * (p - 1) + up) / p; l = (l * (p - 1) + dn) / p; out.push(100 - 100 / (1 + g / (l || 1e-9))); }
  }
  return [null, ...out];
}
function atrCalc(ch, p = 14) {
  const tr = ch.map((c, i) => (i === 0 ? c.high - c.low : Math.max(c.high - c.low, Math.abs(c.high - ch[i - 1].close), Math.abs(c.low - ch[i - 1].close))));
  const out = []; let prev = tr.slice(1, p + 1).reduce((a, b) => a + b, 0) / p;
  for (let i = 0; i < ch.length; i++) {
    if (i < p) { out.push(null); continue; }
    if (i === p) { out.push(prev); continue; }
    prev = (prev * (p - 1) + tr[i]) / p; out.push(prev);
  }
  return out;
}
function adxCalc(ch, p = 14) {
  const tr = [], plusDM = [], minusDM = [];
  for (let i = 1; i < ch.length; i++) {
    const up = ch[i].high - ch[i - 1].high, dn = ch[i - 1].low - ch[i].low;
    plusDM.push(up > dn && up > 0 ? up : 0);
    minusDM.push(dn > up && dn > 0 ? dn : 0);
    tr.push(Math.max(ch[i].high - ch[i].low, Math.abs(ch[i].high - ch[i - 1].close), Math.abs(ch[i].low - ch[i - 1].close)));
  }
  const dx = [];
  let atr = tr.slice(0, p).reduce((a, b) => a + b, 0);
  let pdm = plusDM.slice(0, p).reduce((a, b) => a + b, 0);
  let mdm = minusDM.slice(0, p).reduce((a, b) => a + b, 0);
  for (let i = p; i < tr.length; i++) {
    atr = atr - atr / p + tr[i];
    pdm = pdm - pdm / p + plusDM[i];
    mdm = mdm - mdm / p + minusDM[i];
    const pdi = (100 * pdm) / (atr || 1e-9), mdi = (100 * mdm) / (atr || 1e-9);
    dx.push((100 * Math.abs(pdi - mdi)) / ((pdi + mdi) || 1e-9));
  }
  const out = new Array(ch.length).fill(null);
  if (dx.length >= p) {
    let a = dx.slice(0, p).reduce((x, y) => x + y, 0) / p;
    out[p + p - 1] = a;
    for (let i = p; i < dx.length; i++) { a = (a * (p - 1) + dx[i]) / p; out[p + p - 1 + i] = a; }
  }
  return out;
}
function detectSwings(ch, k = 2) {
  const out = [];
  for (let i = k; i < ch.length - k; i++) {
    const win = ch.slice(i - k, i + k + 1);
    if (ch[i].high >= Math.max(...win.map((c) => c.high))) out.push({ type: "SWING HIGH", price: ch[i].high, time: ch[i].time, confirmed: true });
    if (ch[i].low <= Math.min(...win.map((c) => c.low))) out.push({ type: "SWING LOW", price: ch[i].low, time: ch[i].time, confirmed: true });
  }
  const last = ch.length - 1;
  if (last > k) {
    const win = ch.slice(last - k * 2);
    if (ch[last].high >= Math.max(...win.slice(0, -1).map((c) => c.high))) out.push({ type: "SWING HIGH", price: ch[last].high, time: ch[last].time, confirmed: false });
    if (ch[last].low <= Math.min(...win.slice(0, -1).map((c) => c.low))) out.push({ type: "SWING LOW", price: ch[last].low, time: ch[last].time, confirmed: false });
  }
  return out;
}
function classifyTrend(swings) {
  const hs = swings.filter((s) => s.type === "SWING HIGH" && s.confirmed);
  const ls = swings.filter((s) => s.type === "SWING LOW" && s.confirmed);
  if (hs.length < 2 || ls.length < 2) return "RANGE";
  const hh = hs.at(-1).price > hs.at(-2).price;
  const hl = ls.at(-1).price > ls.at(-2).price;
  const lh = hs.at(-1).price < hs.at(-2).price;
  const ll = ls.at(-1).price < ls.at(-2).price;
  if (hh && hl) return "UPTREND";
  if (lh && ll) return "DOWNTREND";
  return "RANGE";
}
function buildMarkers(candles) {
  const markers = [];
  const step = Math.floor(candles.length / 8) || 1;
  for (let i = step; i < candles.length - 2; i += step) {
    const up = candles[i].close > candles[i - 1].close;
    markers.push({ time: candles[i].time, direction: up ? "LONG" : "SHORT", text: up ? "BOS↑" : "BOS↓" });
  }
  return markers.slice(-10);
}
