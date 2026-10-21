/* Risk: summary (read) + settings (OWNER write with validation).
   The engine remains the enforcement point; settings here are config, not bypass. */
import { ok, fail, methodNotAllowed } from "../lib/responses.js";
import { requireUser } from "../lib/auth.js";
import { hasRole, ROLES } from "../lib/permissions.js";
import { tryCollection } from "../lib/database.js";
import { clampNumber } from "../lib/validation.js";

const LIMITS = {
  risk_per_trade_pct: [0.01, 2.0],
  daily_loss_limit_pct: [0.1, 10.0],
  max_open_positions: [1, 10],
  max_daily_trades: [1, 200],
  max_weekly_drawdown_pct: [0.5, 25.0],
  min_risk_reward: [0.5, 5.0],
};

export default async function handler(req, res) {
  if (req.path?.endsWith("/settings") || req.query.path === "settings") {
    if (req.method === "GET") return getSettings(res);
    if (req.method === "PUT" || req.method === "PATCH") return putSettings(req, res);
    return methodNotAllowed(res, ["GET", "PUT", "PATCH"]);
  }
  if (req.method === "GET") return summary(res);
  return methodNotAllowed(res, ["GET"]);
}

async function summary(res) {
  const hb = await tryCollection("engine_heartbeats");
  const events = await tryCollection("risk_events");
  let last = null;
  let recent = [];
  try {
    last = await hb.findOne({}, { sort: { timestamp: -1 } });
    recent = await events.find({}).sort({ created_at: -1 }).limit(20).toArray();
  } catch {
    /* dev fallback */
  }
  return ok(res, {
    mode: last?.mode ?? "RESEARCH",
    halted: last?.halted ?? true,
    haltReason: last?.halt_reason ?? null,
    dailyLossPct: last?.daily_loss_pct ?? 0,
    positionsOpen: last?.positions_open ?? 0,
    recentEvents: recent,
  });
}

async function getSettings(res) {
  const store = await tryCollection("risk_settings");
  let doc = null;
  try {
    doc = await store.findOne({ id: "global" });
  } catch {
    doc = null;
  }
  return ok(res, {
    settings: doc?.settings ?? {
      risk_per_trade_pct: 0.25,
      daily_loss_limit_pct: 1.0,
      max_open_positions: 2,
      max_daily_trades: 20,
      max_weekly_drawdown_pct: 5.0,
      min_risk_reward: 1.5,
      news_blackout_minutes: 15,
    },
  });
}

async function putSettings(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  if (!hasRole(user, ROLES.OWNER)) return fail(res, 403, "FORBIDDEN", "OWNER role required");
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const settings = {};
  for (const [key, [min, max]] of Object.entries(LIMITS)) {
    if (body[key] !== undefined) {
      const n = Number(body[key]);
      if (Number.isNaN(n) || n < min || n > max) {
        return fail(res, 400, "VALIDATION_ERROR", `${key} must be between ${min} and ${max}`);
      }
      settings[key] = n;
    }
  }
  if (body.news_blackout_minutes !== undefined) {
    settings.news_blackout_minutes = clampNumber(body.news_blackout_minutes, 0, 240, 15);
  }
  if (!Object.keys(settings).length) {
    return fail(res, 400, "VALIDATION_ERROR", "No valid settings supplied");
  }

  const store = await tryCollection("risk_settings");
  await store.updateOne(
    { id: "global" },
    { $set: { id: "global", settings, updated_by: user.sub ?? "owner", updated_at: new Date().toISOString() } },
    { upsert: true },
  );
  const audit = await tryCollection("audit_logs");
  await audit.insertOne({
    id: crypto.randomUUID(),
    action: "RISK_SETTINGS_UPDATE",
    detail: JSON.stringify(settings),
    actor: user.sub ?? "owner",
    created_at: new Date().toISOString(),
  });
  return ok(res, { settings });
}
