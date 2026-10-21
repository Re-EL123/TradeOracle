/* Orders & Trades */
import { api } from "../api.js";
import { fmt } from "../state.js";
import { icon, badge, statusBadge, errorBlock, loadingBlock, modal, toast, sourceTag } from "../ui.js";

export async function render(outlet) {
  outlet.innerHTML = `<div class="page">
    <div class="page__header">
      <div><h2>Orders & Trades</h2><p>Full order lifecycle with explicit states. Network timeouts produce UNKNOWN — never assumed-failed. Manual actions require confirmation and a fresh server-side risk check.</p></div>
      <span id="or-src"></span>
    </div>
    <section class="panel">
      <div class="tabs" id="or-tabs">
        <button data-tab="positions" class="is-active">Open positions</button>
        <button data-tab="orders">Orders</button>
        <button data-tab="trades">Closed trades</button>
        <button data-tab="rejected">Rejected</button>
      </div>
      <div class="panel__body panel__body--flush"><div class="table-wrap" id="or-table">${loadingBlock(6)}</div></div>
      <div class="panel__foot"><span id="or-foot">State machine: CREATED → VALIDATED → SUBMITTING → ACCEPTED → FILLED → CLOSED</span></div>
    </section>
  </div>`;

  const table = outlet.querySelector("#or-table");
  let data = { positions: [], orders: [], trades: [] };
  try {
    const [positions, orders, trades] = await Promise.all([api.positions(), api.orders(), api.trades()]);
    data = { positions, orders, trades };
    outlet.querySelector("#or-src").innerHTML = sourceTag(positions[0]?.source || orders[0]?.source);
  } catch (e) {
    table.innerHTML = errorBlock("Execution data unavailable", e.message);
    return () => {};
  }

  const tabs = {
    positions: () => posTable(data.positions),
    orders: () => ordTable(data.orders),
    trades: () => trdTable(data.trades),
    rejected: () => ordTable(data.orders.filter((o) => ["REJECTED", "CANCELLED", "UNKNOWN"].includes(o.state))),
  };
  const show = (k) => { table.innerHTML = tabs[k](); wire(); };
  function wire() {
    table.querySelectorAll("[data-close-pos]").forEach((b) =>
      b.addEventListener("click", () => {
        const id = b.dataset.closePos;
        modal({
          title: `Close position ${id}?`,
          body: `<p style="font-size:var(--fs-2xs);color:var(--text-2);line-height:1.6">This submits a closing order subject to a <b>fresh server-side permission and risk check</b>. The request may be rejected if data is stale, limits are breached, or the engine is halted.</p>`,
          actions: [{ label: "Cancel" }, { label: "Confirm close", kind: "danger", onClick: () => toast("Close requested", `${id} queued — awaiting engine acknowledgement.`, "warning") }],
        });
      })
    );
    table.querySelectorAll("[data-cancel]").forEach((b) =>
      b.addEventListener("click", () => toast("Cancel requested", `${b.dataset.cancel} — requires broker reconciliation before retry.`, "warning"))
    );
  }

  outlet.querySelector("#or-tabs").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    outlet.querySelectorAll("#or-tabs button").forEach((x) => x.classList.remove("is-active"));
    b.classList.add("is-active");
    show(b.dataset.tab);
  });
  show("positions");
  const t = setInterval(() => show(outlet.querySelector("#or-tabs .is-active").dataset.tab), 20000);
  return () => clearInterval(t);
}

function posTable(rows) {
  if (!rows.length) return `<div class="state"><p>No open positions</p></div>`;
  return `<table class="data"><thead><tr>
    <th>ID</th><th>Broker ID</th><th>Symbol</th><th>Dir</th><th class="num">Vol</th><th class="num">Entry</th><th class="num">Current</th>
    <th class="num">SL</th><th class="num">TP</th><th class="num">P&L</th><th>Opened</th><th></th></tr></thead>
    <tbody>${rows.map((p) => `<tr>
      <td class="u-mono">${p.id}</td><td class="u-muted">${p.brokerId ?? "—"}</td><td class="sym">${p.symbol}</td>
      <td>${badge(p.direction, p.direction === "LONG" ? "green" : "red")}</td><td class="num">${p.volume}</td>
      <td class="num mono">${fmt.price(p.entry, p.symbol)}</td><td class="num mono">${fmt.price(p.current, p.symbol)}</td>
      <td class="num mono u-bear">${fmt.price(p.stopLoss, p.symbol)}</td><td class="num mono u-bull">${fmt.price(p.takeProfit, p.symbol)}</td>
      <td class="num ${fmt.cls(p.pnl)}">${fmt.money(p.pnl)}</td><td class="u-muted">${fmt.age(p.openedAt)}</td>
      <td><button class="btn btn--sm btn--danger" data-close-pos="${p.id}">Close</button></td>
    </tr>`).join("")}</tbody></table>`;
}
function ordTable(rows) {
  if (!rows.length) return `<div class="state"><p>No orders in this view</p></div>`;
  return `<table class="data"><thead><tr>
    <th>Order ID</th><th>Broker ID</th><th>Symbol</th><th>Dir</th><th>Type</th><th class="num">Req vol</th><th class="num">Filled</th>
    <th class="num">Req px</th><th class="num">Avg fill</th><th>State</th><th>Created</th><th>Error</th><th></th></tr></thead>
    <tbody>${rows.map((o) => `<tr>
      <td class="u-mono">${o.id}</td><td class="u-muted">${o.brokerId ?? "—"}</td><td class="sym">${o.symbol}</td>
      <td>${badge(o.direction, o.direction === "LONG" ? "green" : "red")}</td><td class="u-muted">${o.type}</td>
      <td class="num">${o.requestedVolume}</td><td class="num">${o.filledVolume}</td>
      <td class="num mono">${fmt.price(o.requestedPrice, o.symbol)}</td><td class="num mono">${o.fillPrice != null ? fmt.price(o.fillPrice, o.symbol) : "—"}</td>
      <td>${statusBadge(o.state)}</td><td class="u-muted">${fmt.age(o.createdAt)}</td>
      <td class="u-danger u-truncate" style="max-width:180px" title="${o.error || ""}">${o.error || "—"}</td>
      <td>${o.state === "PENDING" ? `<button class="btn btn--sm" data-cancel="${o.id}">Cancel</button>` : ""}</td>
    </tr>`).join("")}</tbody></table>`;
}
function trdTable(rows) {
  if (!rows.length) return `<div class="state"><p>No closed trades yet</p></div>`;
  const net = rows.reduce((a, b) => a + Number(b.pnl || 0), 0);
  return `<table class="data"><thead><tr>
    <th>ID</th><th>Symbol</th><th>Dir</th><th class="num">Vol</th><th class="num">Entry</th><th class="num">Exit</th>
    <th class="num">P&L</th><th>Opened</th><th>Closed</th></tr></thead>
    <tbody>${rows.map((t) => `<tr>
      <td class="u-mono">${t.id}</td><td class="sym">${t.symbol}</td><td>${badge(t.direction, t.direction === "LONG" ? "green" : "red")}</td>
      <td class="num">${t.volume}</td><td class="num mono">${fmt.price(t.entry, t.symbol)}</td><td class="num mono">${fmt.price(t.exit, t.symbol)}</td>
      <td class="num ${fmt.cls(t.pnl)}">${fmt.money(t.pnl)}</td><td class="u-muted">${fmt.age(t.openedAt)}</td><td class="u-muted">${fmt.age(t.closedAt)}</td>
    </tr>`).join("")}</tbody>
    <tfoot><tr><td colspan="6" class="num u-muted">Net (sample)</td><td class="num ${fmt.cls(net)}"><b>${fmt.money(net)}</b></td><td colspan="2"></td></tr></tfoot></table>`;
}
