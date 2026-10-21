/* Hash router — SPA navigation with lazy page modules and poller teardown */
import { state } from "./state.js";

const routes = {};
let currentTeardown = null;

export function route(path, loader) {
  routes[path] = loader;
}

export function navigate(path) {
  if (location.hash === `#/${path}`) render();
  else location.hash = `#/${path}`;
}

export function currentPath() {
  return (location.hash.replace(/^#\/?/, "") || "overview").split("?")[0];
}

export async function render() {
  const path = currentPath();
  const loader = routes[path] || routes["overview"];
  state.clearPollers();
  if (typeof currentTeardown === "function") {
    try { currentTeardown(); } catch { /* noop */ }
  }
  const outlet = document.getElementById("outlet");
  if (!outlet) return;
  outlet.innerHTML = `<div class="page"><div class="skeleton skeleton--value" style="width:180px"></div><div class="skeleton" style="height:220px;margin-top:16px"></div></div>`;
  try {
    const result = await loader(outlet);
    currentTeardown = typeof result === "function" ? result : null;
    state.set({ route: path });
    outlet.parentElement.scrollTop = 0;
    document.title = `TradeOracle — ${path.replace(/^\w/, (c) => c.toUpperCase())}`;
  } catch (err) {
    outlet.innerHTML = `<div class="page"><div class="state state--error"><h4>Page failed to load</h4><p>${err?.message || err}</p></div></div>`;
  }
}

export function startRouter() {
  window.addEventListener("hashchange", render);
  if (!location.hash) location.hash = "#/overview";
  else render();
}
