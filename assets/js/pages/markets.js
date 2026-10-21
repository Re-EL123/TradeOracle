/* Live Markets */
import { api } from "../api.js";
import { fmt } from "../state.js";
import { icon, badge, errorBlock, loadingBlock, sourceTag } from "../ui.js";

export async function render(outlet) {
  outlet.innerHTML = `<div class="page">
    <div class="page__header">
      <div><h2>Live Markets</h2><p>Configured instruments with price freshness, session state and classification. Stale data is labelled, never presented as current.</p></div>
      <div class="u-flex u-gap-2"><button class="btn" id="btn-refresh-mk">${icon("refresh", 14)} Refresh</button></div>
    </div>
    <section class="panel">
      <div class="panel__head">
        <div class="panel__title">${icon("search")} Instruments</div>
        <div class="panel__actions">
          <input class="input" id="mk-search" placeholder="Filter symbol…" style="width:180px;height:30px">
          <select class="select" id="mk-session" style="width:140px;height:30px">
            <option value="">All sessions</option><option>ASIAN</option><option>LONDON</option><option>NEWYORK</option><option>OVERLAP</option>
          </select>
          <select class="select" id="mk-trend" style="width:140px;height:30px">
            <option value="">All trends</option><option>UPTREND</option><option>DOWNTREND</option><option>RANGE</option>
          </select>
        </div>
      </div>
      <div class="panel__body panel__body--flush"><div class="table-wrap" id="mk-table">${loadingBlock(8)}</div></div>
      <div class="panel__foot"><span id="mk-source"></span><span>Quotes update on poll; engine heartbeat every 15s</span></div>
    </section>
  </div>`;

  const table = outlet.querySelector("#mk-table");
  let all = [];

  async function load() {
    try {
      all = await api.markets();
    } catch (e) {
      table.innerHTML = errorBlock("Market data unavailable", e.message, load);
      return;
    }
    outlet.querySelector("#mk-source").innerHTML = sourceTag(all[0]?.source) + ` <span style="margin-left:8px">${all.length} instruments configured</span>`;
    apply();
  }

  function apply() {
    const q = (outlet.querySelector("#mk-search").value || "").toUpperCase();
    const sess = outlet.querySelector("#mk-session").value;
    const tr = outlet.querySelector("#mk-trend").value;
    const rows = all.filter(
      (m) => (!q || m.symbol.includes(q)) && (!sess || m.session === sess) && (!tr || m.trend === tr)
    );
    if (!rows.length) {
      table.innerHTML = `<div class="state">${icon("search", 24)}<h4>No instruments match</h4><p>Adjust the filters or wait for the next data cycle.</p></div>`;
      return;
    }
    table.innerHTML = `<table class="data">
      <thead><tr>
        <th>Instrument</th><th class="num">Bid</th><th class="num">Ask</th><th class="num">Spread (pips)</th>
        <th class="num">Δ change</th><th>Trend</th><th>Volatility</th><th>Session</th><th>Signal</th><th>Freshness</th><th></th>
      </tr></thead>
      <tbody>
      ${rows.map((m) => {
        const stale = m.dataAgeMs > 60000;
        return `<tr>
          <td class="sym">${m.symbol}</td>
          <td class="num">${fmt.price(m.bid, m.symbol)}</td>
          <td class="num">${fmt.price(m.ask, m.symbol)}</td>
          <td class="num">${m.spreadPips}</td>
          <td class="num ${fmt.cls(m.changePct)}">${fmt.pct(m.changePct)}</td>
          <td>${badge(m.trend, m.trend === "UPTREND" ? "green" : m.trend === "DOWNTREND" ? "red" : "grey")}</td>
          <td>${badge(m.volatility, { LOW: "info", NORMAL: "blue", ELEVATED: "amber", HIGH: "red" }[m.volatility] || "grey")}</td>
          <td class="u-muted">${m.session}</td>
          <td>${m.signal ? badge(`${m.signal.direction} ${m.signal.score}`, m.signal.direction === "LONG" ? "green" : "red") : badge("—", "grey")}</td>
          <td>${stale ? badge(`STALE ${fmt.age(m.updatedAt)}`, "amber", true) : `<span class="u-muted">${fmt.age(m.updatedAt)}</span>`}</td>
          <td><button class="btn btn--sm" data-chart="${m.symbol}">${icon("chart", 12)}</button></td>
        </tr>`;
      }).join("")}
      </tbody></table>`;
    table.querySelectorAll("[data-chart]").forEach((b) =>
      b.addEventListener("click", () => {
        sessionStorage.setItem("to:symbol", b.dataset.chart);
        import("../router.js").then((r) => r.navigate("chart"));
      })
    );
  }

  ["#mk-search", "#mk-session", "#mk-trend"].forEach((s) => outlet.querySelector(s).addEventListener("input", apply));
  outlet.querySelector("#btn-refresh-mk").addEventListener("click", load);
  load();
  const t = setInterval(load, 20000);
  return () => clearInterval(t);
}
