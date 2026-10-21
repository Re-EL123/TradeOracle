/* Alerts */
import { api } from "../api.js";
import { fmt } from "../state.js";
import { icon, badge, errorBlock, loadingBlock, sourceTag } from "../ui.js";

export async function render(outlet) {
  outlet.innerHTML = `<div class="page">
    <div class="page__header">
      <div><h2>Alerts</h2><p>Informational, warning and critical system events. Critical failures also dispatch to the configured notification channel.</p></div>
      <span id="al-src"></span>
    </div>
    <section class="panel">
      <div class="panel__head"><div class="panel__title">${icon("alerts")} Alert log</div>
        <div class="panel__actions">
          <select class="select" id="al-level" style="width:140px;height:30px">
            <option value="">All levels</option><option>CRITICAL</option><option>WARNING</option><option>INFO</option>
          </select>
        </div>
      </div>
      <div class="panel__body panel__body--flush"><div id="al-list">${loadingBlock(5)}</div></div>
      <div class="panel__foot"><span>Retention: 90 days for INFO, permanent for CRITICAL</span></div>
    </section>
  </div>`;
  const host = outlet.querySelector("#al-list");
  let all = [];
  async function load() {
    try { all = await api.alerts(); } catch (e) { host.innerHTML = errorBlock("Alerts unavailable", e.message, load); return; }
    outlet.querySelector("#al-src").innerHTML = sourceTag(all[0]?.source);
    apply();
  }
  function apply() {
    const lvl = outlet.querySelector("#al-level").value;
    const rows = all.filter((a) => !lvl || a.level === lvl);
    if (!rows.length) { host.innerHTML = `<div class="state">${icon("check", 24)}<h4>No alerts</h4><p>Nothing matches this filter.</p></div>`; return; }
    host.innerHTML = `<div class="feed">${rows.map((a) => `
      <div class="feed__item">
        <div class="feed__icon ${a.level === "CRITICAL" ? "feed__icon--risk" : a.level === "WARNING" ? "feed__icon--order" : "feed__icon--ok"}">${icon(a.level === "INFO" ? "info" : "alert", 11)}</div>
        <div class="feed__text">${badge(a.level, a.level === "CRITICAL" ? "red" : a.level === "WARNING" ? "amber" : "blue")} &nbsp;${a.message}</div>
        <div class="feed__time">${fmt.time(a.at)}</div>
      </div>`).join("")}</div>`;
  }
  outlet.querySelector("#al-level").addEventListener("change", apply);
  load();
  const t = setInterval(load, 30000);
  return () => clearInterval(t);
}
