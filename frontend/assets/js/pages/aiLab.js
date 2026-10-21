/* AI Lab */
import { icon, badge, statusBadge } from "../ui.js";

const MODELS = [
  { id: "regime-clf-v1", name: "Market Regime Classifier", version: "1.0.0", type: "Gradient boosting", status: "VALIDATED", metric: "Macro-F1 0.71", data: "2022-01 → 2025-06", drift: "OK", promoted: true },
  { id: "vol-clf-v1", name: "Volatility Classifier", version: "0.9.2", type: "Logistic regression", status: "TESTING", metric: "Macro-F1 0.64", data: "2023-01 → 2026-03", drift: "OK", promoted: false },
  { id: "signal-rank-v0", name: "Signal Ranker", version: "0.3.0", type: "Learning-to-rank", status: "DRAFT", metric: "NDCG 0.58", data: "2024-06 → 2026-06", drift: "—", promoted: false },
  { id: "outcome-cal-v0", name: "Outcome Calibrator (SL↔TP)", version: "0.1.0", type: "Isotonic calibration", status: "DRAFT", metric: "Brier 0.22 (uncalibrated holdout)", data: "pending", drift: "—", promoted: false },
];

export async function render(outlet) {
  outlet.innerHTML = `<div class="page">
    <div class="page__header">
      <div><h2>AI Lab</h2><p>Model registry, validation and drift monitoring. Models support the analysis pipeline — they never issue broker orders and never override the deterministic risk engine.</p></div>
      <span class="badge badge--amber">${icon("lock", 12)}&nbsp; No model has live order authority</span>
    </div>
    <div class="grid grid--metrics" style="margin-bottom:var(--sp-4)">
      ${[
        ["Registered models", "4"],
        ["Promoted to production", "1"],
        ["Training jobs running", "0"],
        ["Drift alerts", "0"],
      ].map(([l, v]) => `<div class="metric"><div class="metric__label">${l}</div><div class="metric__value metric__value--sm">${v}</div></div>`).join("")}
    </div>
    <section class="panel" style="margin-bottom:var(--sp-4)">
      <div class="panel__head"><div class="panel__title">${icon("ai")} Model registry</div></div>
      <div class="panel__body panel__body--flush">
        <table class="data">
          <thead><tr><th>Model</th><th>Version</th><th>Type</th><th>Validation metric</th><th>Training window</th><th>Drift</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${MODELS.map((m) => `<tr>
              <td class="sym">${m.name}<div class="u-faint u-mono" style="font-weight:400">${m.id}</div></td>
              <td class="u-mono">${m.version}</td>
              <td class="u-muted">${m.type}</td>
              <td class="mono">${m.metric}</td>
              <td class="u-muted">${m.data}</td>
              <td>${badge(m.drift, m.drift === "OK" ? "green" : "grey")}</td>
              <td>${statusBadge(m.status)}</td>
              <td>${m.promoted ? badge("PRODUCTION", "blue") : `<button class="btn btn--sm" data-promote="${m.id}">Review</button>`}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>
      <div class="panel__foot"><span>Promotion requires out-of-sample validation + explicit approval. Rollback retained.</span></div>
    </section>
    <div class="grid grid--2">
      <section class="panel">
        <div class="panel__head"><div class="panel__title">${icon("strategies")} Feature importance — regime classifier</div></div>
        <div class="panel__body">
          <div class="evidence">
            ${[["ADX(14)", 86], ["ATR percentile", 74], ["EMA21−EMA50 gap", 68], ["Range expansion ratio", 52], ["Session hour", 41], ["Spread z-score", 22]].map(([l, v]) => `
              <div class="evidence__row"><span class="u-muted">${l}</span><div class="evidence__bar"><i style="width:${v}%"></i></div><span class="mono" style="text-align:right">${v}</span></div>`).join("")}
          </div>
        </div>
      </section>
      <section class="panel">
        <div class="panel__head"><div class="panel__title">${icon("shield")} Guardrails</div></div>
        <div class="panel__body" style="font-size:var(--fs-2xs);color:var(--text-2);line-height:1.7">
          <ul style="padding-left:1.1rem;display:flex;flex-direction:column;gap:6px">
            <li>Training datasets are versioned; look-ahead leakage tests are mandatory in CI.</li>
            <li>Train / validation / test periods are chronologically separated; walk-forward preferred.</li>
            <li>Probabilities are displayed only after out-of-sample calibration.</li>
            <li>Failed inference falls back to an approved baseline — or the system abstains.</li>
            <li>No reinforcement learning or self-modifying strategies in this release.</li>
            <li>A language model cannot place orders or change risk limits.</li>
          </ul>
        </div>
      </section>
    </div>
  </div>`;
  outlet.querySelectorAll("[data-promote]").forEach((b) => b.addEventListener("click", () => {
    import("../ui.js").then((u) => u.toast("Promotion review", "Requires validation report sign-off before entering paper.", "info"));
  }));
  return () => {};
}
