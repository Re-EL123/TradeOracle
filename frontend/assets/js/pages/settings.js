/* Settings */
import { state } from "../state.js";
import { icon, badge, toast } from "../ui.js";

export async function render(outlet) {
  const p = state.prefs;
  outlet.innerHTML = `<div class="page">
    <div class="page__header">
      <div><h2>Settings</h2><p>User preferences, display defaults and connection status. Risk, mode and broker changes are audited server-side and cannot be made from the UI alone.</p></div>
    </div>
    <div class="grid grid--2">
      <section class="panel">
        <div class="panel__head"><div class="panel__title">${icon("user")} Preferences</div></div>
        <div class="panel__body">
          <div class="grid grid--2" style="gap:var(--sp-4)">
            <div class="field"><label class="field__label">Default instrument</label>
              <select class="select" id="st-symbol">${["EURUSD", "GBPUSD", "USDJPY", "AUDUSD"].map((s) => `<option ${s === p.defaultSymbol ? "selected" : ""}>${s}</option>`).join("")}</select></div>
            <div class="field"><label class="field__label">Default timeframe</label>
              <select class="select" id="st-tf">${["M5", "M15", "M30", "H1", "H4", "D1"].map((s) => `<option ${s === p.defaultTimeframe ? "selected" : ""}>${s}</option>`).join("")}</select></div>
            <div class="field"><label class="field__label">Timezone display</label>
              <select class="select" id="st-tz"><option>UTC</option><option>Africa/Johannesburg</option><option>Europe/London</option><option>America/New_York</option></select>
              <span class="field__hint">Timestamps are stored in UTC; display conversion only.</span></div>
            <div class="field"><label class="field__label">Theme</label>
              <select class="select" disabled><option>Dark (default)</option></select>
              <span class="field__hint">Light theme planned; dark-first for trading focus.</span></div>
          </div>
          <h4 style="margin:var(--sp-5) 0 var(--sp-3)">Notifications</h4>
          ${[["New eligible signals", true], ["Order accepted / rejected", true], ["Risk-limit warnings", true], ["Broker disconnects", true], ["Engine restarts", false], ["Daily performance summary", false]]
            .map(([l, on]) => `<label class="u-flex u-between u-items-center" style="padding:8px 0;font-size:var(--fs-2xs);border-bottom:1px solid rgba(38,52,73,.4)">
              <span>${l}</span><button class="switch" role="switch" aria-checked="${on}"></button></label>`).join("")}
        </div>
        <div class="panel__foot"><span></span><button class="btn btn--primary btn--sm" id="st-save">Save preferences</button></div>
      </section>
      <section class="panel" style="align-content:start">
        <div class="panel__head"><div class="panel__title">${icon("lock")} Security & connections</div></div>
        <div class="panel__body">
          <dl class="dl">
            <dt>Session</dt><dd>${badge("AUTHENTICATED", "green")} <span class="u-faint">(server-enforced)</span></dd>
            <dt>API base</dt><dd class="u-mono">${state.apiBase}</dd>
            <dt>API status</dt><dd>${state.demoFallback ? badge("UNREACHABLE — SIM MODE", "amber") : badge("OK", "green")}</dd>
            <dt>MFA</dt><dd>${badge("AVAILABLE", "grey")} — enable in account panel</dd>
            <dt>Role</dt><dd>OWNER</dd>
            <dt>Last login</dt><dd>current session</dd>
          </dl>
          <h4 style="margin:var(--sp-5) 0 var(--sp-3)">Danger zone</h4>
          <div class="u-flex u-gap-2" style="flex-wrap:wrap">
            <button class="btn btn--danger btn--sm" id="st-revoke">Revoke all sessions</button>
            <button class="btn btn--sm" id="st-rotate">Rotate API credentials</button>
          </div>
          <p class="u-faint" style="font-size:var(--fs-3xs);margin-top:var(--sp-4)">
            Access control is enforced server-side on every request. Hiding dashboard controls is never used as a security boundary.
          </p>
        </div>
      </section>
    </div>
    <p class="disclaimer">${icon("info", 12)} Changing a risk limit, trading mode or broker connection is recorded in the audit log with actor, timestamp, previous value and correlation ID.</p>
  </div>`;

  outlet.querySelectorAll(".switch").forEach((s) =>
    s.addEventListener("click", () => s.setAttribute("aria-checked", s.getAttribute("aria-checked") !== "true"))
  );
  outlet.querySelector("#st-save").addEventListener("click", () => {
    state.set({ prefs: {
      defaultSymbol: outlet.querySelector("#st-symbol").value,
      defaultTimeframe: outlet.querySelector("#st-tf").value,
      timezone: outlet.querySelector("#st-tz").value,
    }});
    toast("Preferences saved", "Applied to this session.", "success");
  });
  outlet.querySelector("#st-revoke").addEventListener("click", () => toast("Revoke sessions", "Requires re-authentication via the API.", "warning"));
  outlet.querySelector("#st-rotate").addEventListener("click", () => toast("Rotate credentials", "Server-side rotation — new secrets never returned to the browser.", "warning"));
  return () => {};
}
