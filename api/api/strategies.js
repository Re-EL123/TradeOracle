/* Strategies: list, get, enable/disable, edit parameters (validation + audit). */
import { ok, fail, methodNotAllowed } from "../lib/responses.js";
import { requireUser } from "../lib/auth.js";
import { hasRole, ROLES } from "../lib/permissions.js";
import { tryCollection } from "../lib/database.js";

const BUILTIN = [
  { id: "trend_pullback", name: "Trend Pullback", version: "1.0.0", timeframes: ["H1", "H4"], default_params: { ema_fast: 20, ema_slow: 50, rsi_min: 40, rsi_max: 65, atr_mult_sl: 1.5, rr: 2.0 } },
  { id: "breakout_retest", name: "Breakout Retest", version: "1.0.0", timeframes: ["M15", "H1"], default_params: { lookback: 50, atr_mult_sl: 1.2, rr: 1.8, volume_confirm: true } },
];

export default async function handler(req, res) {
  if (req.method === "GET") return get(req, res);
  if (req.method === "PATCH") return patch(req, res);
  return methodNotAllowed(res, ["GET", "PATCH"]);
}

async function get(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  const id = String(req.query.id || "");
  const store = await tryCollection("strategies");
  let items = [];
  try {
    items = id ? [await store.findOne({ id })].filter(Boolean) : await store.find({}).limit(50).toArray();
  } catch {
    items = [];
  }
  if (id) {
    const one = items[0] || BUILTIN.find((b) => b.id === id);
    if (!one) return fail(res, 404, "NOT_FOUND", `Strategy ${id} not found`);
    return ok(res, { strategy: one });
  }
  const overrides = new Map(items.map((s) => [s.id, s]));
  const merged = BUILTIN.map((b) => ({ ...b, ...(overrides.get(b.id) || {}) }));
  return ok(res, { strategies: merged });
}

async function patch(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  if (!hasRole(user, ROLES.OWNER)) return fail(res, 403, "FORBIDDEN", "OWNER role required");
  const id = String(req.query.id || "");
  if (!id) return fail(res, 400, "VALIDATION_ERROR", "strategy id required");
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

  const store = await tryCollection("strategies");
  const update = { id, updated_at: new Date().toISOString(), updated_by: user.sub ?? "owner" };
  if (typeof body.enabled === "boolean") update.enabled = body.enabled;
  if (body.params && typeof body.params === "object") {
    const builtin = BUILTIN.find((b) => b.id === id);
    const keys = builtin ? Object.keys(builtin.default_params) : Object.keys(body.params);
    const params = {};
    for (const k of keys) {
      if (body.params[k] !== undefined) {
        const n = Number(body.params[k]);
        if (Number.isNaN(n)) return fail(res, 400, "VALIDATION_ERROR", `param ${k} must be numeric`);
        params[k] = n;
      } else if (builtin) {
        params[k] = builtin.default_params[k];
      }
    }
    update.params = params;
  }
  await store.updateOne({ id }, { $set: update }, { upsert: true });
  const audit = await tryCollection("audit_logs");
  await audit.insertOne({
    id: crypto.randomUUID(),
    action: "STRATEGY_UPDATE",
    detail: JSON.stringify({ id, enabled: body.enabled, params: body.params }),
    actor: user.sub ?? "owner",
    created_at: new Date().toISOString(),
  });
  return ok(res, { id, updated: update });
}
