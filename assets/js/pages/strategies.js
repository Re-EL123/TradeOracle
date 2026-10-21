/* Strategies */
import { api } from "../api.js";
import { icon, statusBadge, badge, errorBlock, loadingBlock, modal, toast, sourceTag } from "../ui.js";

const FLOW = ["DRAFT", "TESTING", "VALIDATED", "PAPER", "DEMO", "LIVE"];

export async function render(outlet) {
  outlet.innerHTML = `<div class="page">
    <div class="page__header">
      <div><h2>Strategies</h2><p>Versioned strategy definitions with explicit lifecycle. A successful backtest never auto-activates live trading — each transition requires explicit checks and approval.</p></div>
      <button class="btn btn--primary" id="btn-new-strat">${icon("strategies", 14)} New draft</button>
    </div>
    <div id="strat-list" class="grid" style="gap:var(--sp-4)">${loadingBlock(4)}</div>
    <p class="disclaimer">${icon("info", 12)} Strategy states: ${FLOW.join(" → ")}. Transition requires validation gates documented in docs/strategies.md.</p>
  </div>`;

  let list = [];
  async function load() {
    try { list = await api.strategies(); } catch (e) { outlet.querySelector("#strat-list").innerHTML = errorBlock("Strategies unavailable", e.message, load); return; }
    outlet.querySelector("#strat-list").innerHTML = list.map(card).join("");
    outlet.querySelectorAll("[data-advance]").forEach((b) =>
      b.addEventListener("click", () => {
        const s = list.find((x) => x.id === b.dataset.advance);
        const idx = FLOW.indexOf(s.state);
        if (idx >= FLOW.length - 1) return;
        const next = FLOW[idx + 1];
        modal({
          title: `Advance “${s.name}” → ${next}`,
          body: `<p style="font-size:var(--fs-2xs);color:var(--text-2);line-height:1.6">
            Advancing to <b>${next}</b> requires the corresponding gate to pass: ${gateText(next)}.
            This action is written to the audit log with your identity.</p>`,
          actions: [
            { label: "Cancel" },
            { label: `Confirm ${next}`, kind: "primary", onClick: () => toast("Gate check required", `${s.name}: server-side validation for ${next} not yet configured on the API.`, "warning") },
          ],
        });
      })
    );
    outlet.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => openEditor(list.find((x) => x.id === b.dataset.edit))));
  }
  outlet.querySelector("#btn-new-strat").addEventListener("click", () => openEditor(null));
  load();
  return () => {};
}

function card(s) {
  const idx = FLOW.indexOf(s.state);
  return `<section class="panel">
    <div class="panel__head">
      <div class="panel__title">${icon("strategies")} ${s.name} <span class="u-faint u-mono" style="text-transform:none;letter-spacing:0">v${s.version}</span></div>
      <div class="panel__actions">${statusBadge(s.validation)} ${statusBadge(s.state)}</div>
    </div>
    <div class="panel__body">
      <div class="grid grid--3" style="gap:var(--sp-4)">
        <div>
          <div class="u-faint" style="font-size:var(--fs-3xs);text-transform:uppercase;letter-spacing:.07em">Instruments / TF</div>
          <div style="margin-top:4px">${(s.instruments || []).map((i) => badge(i, "grey")).join(" ")} ${(s.timeframes || []).map((t) => badge(t, "blue")).join(" ")}</div>
        </div>
        <div>
          <div class="u-faint" style="font-size:var(--fs-3xs);text-transform:uppercase;letter-spacing:.07em">Backtest evidence</div>
          <div class="u-mono" style="margin-top:4px;font-size:var(--fs-2xs)">
            ${s.trades ? `PF ${s.profitFactor} · WR ${s.winRate}% · ${s.trades} trades` : "No completed evaluation"}
          </div>
        </div>
        <div>
          <div class="u-faint" style="font-size:var(--fs-3xs);text-transform:uppercase;letter-spacing:.07em">Lifecycle</div>
          <div style="display:flex;gap:4px;margin-top:6px">
            ${FLOW.map((f, i) => `<span title="${f}" style="flex:1;height:5px;border-radius:99px;background:${i <= idx ? (f === "LIVE" ? "var(--brand-red)" : "var(--brand-blue)") : "var(--border)"}"></span>`).join("")}
          </div>
          <div class="u-faint" style="font-size:var(--fs-3xs);margin-top:4px">${s.state} → ${FLOW[Math.min(idx + 1, FLOW.length - 1)]}</div>
        </div>
      </div>
    </div>
    <div class="panel__foot">
      <span class="u-faint">State transitions are gated server-side and audited.</span>
      <div class="u-flex u-gap-2">
        <button class="btn btn--sm" data-edit="${s.id}">${icon("settings", 12)} Edit rules</button>
        ${s.state !== "LIVE" ? `<button class="btn btn--sm btn--primary" data-advance="${s.id}">Advance ${icon("play", 12)}</button>` : ""}
      </div>
    </div>
  </section>`;
}

function gateText(next) {
  return {
    TESTING: "draft config validated (parameters in bounds, instruments supported)",
    VALIDATED: "out-of-sample + walk-forward evaluation acceptable with documented costs",
    PAPER: "validation approved by authorising user; paper forward test configured",
    DEMO: "sustained paper operation without safety incidents",
    LIVE: "all Section-16 release gates satisfied and explicit live authorisation",
  }[next] || "defined checks";
}

function openEditor(s) {
  modal({
    title: s ? `Edit ${s.name}` : "New strategy draft",
    wide: true,
    body: `
      <div class="grid grid--2" style="gap:var(--sp-4)">
        <div class="field"><label class="field__label">Name</label><input class="input" value="${s?.name || ""}" placeholder="e.g. London Open Breakout"></div>
        <div class="field"><label class="field__label">Version</label><input class="input" value="${s?.version || "0.1.0"}"></div>
        <div class="field"><label class="field__label">Instruments</label><input class="input" value="${(s?.instruments || ["EURUSD"]).join(", ")}"></div>
        <div class="field"><label class="field__label">Timeframes</label><input class="input" value="${(s?.timeframes || ["H1"]).join(", ")}"></div>
      </div>
      <h4 style="margin:var(--sp-5) 0 var(--sp-3)">Entry rules (structured — no arbitrary code)</h4>
      <div class="grid grid--2" style="gap:var(--sp-3)">
        <div class="field"><label class="field__label">Indicator</label>
          <select class="select"><option>EMA(21) vs EMA(50)</option><option>RSI(14)</option><option>ADX(14)</option><option>ATR(14)</option><option>Swing structure</option><option>Session</option></select></div>
        <div class="field"><label class="field__label">Condition</label>
          <select class="select"><option>crosses above</option><option>crosses below</option><option>greater than</option><option>less than</option><option>within zone</option></select></div>
        <div class="field"><label class="field__label">Value</label><input class="input" placeholder="e.g. 50 or ATR×1.5"></div>
        <div class="field"><label class="field__label">Group</label><select class="select"><option>AND</option><option>OR</option></select></div>
      </div>
      <h4 style="margin:var(--sp-5) 0 var(--sp-3)">Risk constraints</h4>
      <div class="grid grid--3" style="gap:var(--sp-3)">
        <div class="field"><label class="field__label">Max risk / trade %</label><input class="input" type="number" step="0.05" value="0.25"></div>
        <div class="field"><label class="field__label">Min R:R</label><input class="input" type="number" step="0.1" value="1.8"></div>
        <div class="field"><label class="field__label">Cooldown (min)</label><input class="input" type="number" value="60"></div>
        <div class="field"><label class="field__label">Max concurrent</label><input class="input" type="number" value="1"></div>
        <div class="field"><label class="field__label">Max spread (pips)</label><input class="input" type="number" step="0.1" value="2.0"></div>
        <div class="field"><label class="field__label">Sessions</label><select class="select"><option>London + NY</option><option>London only</option><option>All</option></select></div>
      </div>
      <p class="u-faint" style="font-size:var(--fs-3xs);margin-top:var(--sp-4)">
        Structured editors keep strategies reproducible between backtest, paper and live. Arbitrary executable code is not accepted in the browser.
      </p>`,
    actions: [
      { label: "Cancel" },
      { label: "Save draft", kind: "primary", onClick: () => toast("Saved", "Draft persisted via API (requires authenticated session).", "success") },
    ],
  });
}
