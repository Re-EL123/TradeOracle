/* Broker Connections */
import { icon, badge } from "../ui.js";

export async function render(outlet) {
  outlet.innerHTML = `<div class="page">
    <div class="page__header">
      <div><h2>Broker Connections</h2><p>Credentials are handled exclusively through secure backend operations — never in browser JavaScript. The engine authenticates with its own dedicated identity.</p></div>
    </div>
    <div class="grid grid--2">
      <section class="panel">
        <div class="panel__head"><div class="panel__title">${icon("broker")} Active connection</div>${badge("PAPER", "blue")}</div>
        <div class="panel__body">
          <dl class="dl">
            <dt>Provider</dt><dd>Paper simulator (built-in)</dd>
            <dt>Environment</dt><dd>SIMULATED</dd>
            <dt>Account</dt><dd class="u-mono">PAPER-0001</dd>
            <dt>Currency</dt><dd>ZAR</dd>
            <dt>Status</dt><dd>${badge("CONNECTED", "green", true)}</dd>
            <dt>Last sync</dt><dd>just now</dd>
            <dt>Order types</dt><dd>Market, Limit, Stop, SL/TP attached</dd>
            <dt>Permissions</dt><dd>Simulated fills only — no real orders possible</dd>
          </dl>
          <div class="halt-banner" style="margin-top:var(--sp-4);background:var(--brand-blue-soft);border-color:rgba(40,120,255,.35);color:#9cc0ff">
            ${icon("info", 16)} Live order execution is disabled until a broker adapter is validated and the Section-16 release gates pass.
          </div>
        </div>
      </section>
      <section class="panel">
        <div class="panel__head"><div class="panel__title">${icon("lock")} Add broker adapter</div></div>
        <div class="panel__body">
          <p class="u-faint" style="font-size:var(--fs-2xs);margin-bottom:var(--sp-4)">Two integration routes are supported behind a common <span class="u-mono">BrokerAdapter</span> interface. The rest of the engine is independent of the choice.</p>
          <div class="grid" style="gap:var(--sp-3)">
            <div class="panel" style="border-radius:var(--r-md)">
              <div class="panel__body">
                <b style="font-size:var(--fs-sm)">Option A — MetaTrader 5</b>
                <p class="u-faint" style="font-size:var(--fs-2xs);margin-top:6px">Requires the MT5 terminal process on the host. Verify OS/CPU compatibility on the Oracle instance before selecting. Not Linux-native.</p>
              </div>
            </div>
            <div class="panel" style="border-radius:var(--r-md)">
              <div class="panel__body">
                <b style="font-size:var(--fs-sm)">Option B — Direct broker REST API</b>
                <p class="u-faint" style="font-size:var(--fs-2xs);margin-top:6px">Preferred for a Linux-hosted worker. Verify demo access, rate limits, market-data rights and regulatory availability for your jurisdiction.</p>
              </div>
            </div>
          </div>
          <div class="grid grid--2" style="gap:var(--sp-3);margin-top:var(--sp-4)">
            <div class="field"><label class="field__label">Provider</label>
              <select class="select"><option>Select provider…</option><option>Direct REST (generic)</option><option>MetaTrader 5 bridge</option></select></div>
            <div class="field"><label class="field__label">Environment</label>
              <select class="select"><option>DEMO</option><option disabled>LIVE (locked)</option></select></div>
            <div class="field"><label class="field__label">API key</label><input class="input" type="password" placeholder="••••••••" autocomplete="off"></div>
            <div class="field"><label class="field__label">API secret</label><input class="input" type="password" placeholder="••••••••" autocomplete="off"></div>
          </div>
          <p class="u-faint" style="font-size:var(--fs-3xs);margin-top:var(--sp-3)">
            Secrets are stored server-side only (environment / secrets manager). Submission is audited. The browser never receives them back.
          </p>
        </div>
        <div class="panel__foot"><span></span><button class="btn btn--primary" id="btn-connect">${icon("lock", 13)} Connect securely</button></div>
      </section>
    </div>
  </div>`;
  outlet.querySelector("#btn-connect").addEventListener("click", () =>
    import("../ui.js").then((u) => u.toast("Backend required", "Broker credential submission runs through an authenticated API endpoint with server-side validation.", "info"))
  );
  return () => {};
}
