/* Signals: list, fetch one, acknowledge/dismiss. */
import { ok, fail, methodNotAllowed } from "../lib/responses.js";
import { requireUser } from "../lib/auth.js";
import { tryCollection } from "../lib/database.js";
import { cleanSymbol, clampNumber } from "../lib/validation.js";

export default async function handler(req, res) {
  res.__req = req;
  if (req.method === "GET") return list(req, res);
  if (req.method === "PATCH") return update(req, res);
  return methodNotAllowed(res, ["GET", "PATCH"]);
}

async function list(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  const q = {};
  const symbol = cleanSymbol(req.query.symbol);
  if (symbol) q.symbol = symbol;
  if (req.query.status) q.status = String(req.query.status);
  if (req.query.min_score) q.score = { $gte: Number(req.query.min_score) || 0 };
  const limit = clampNumber(req.query.limit, 1, 500, 100);

  const store = await tryCollection("signals");
  let items = [];
  try {
    items = await store.find(q).sort({ timestamp: -1 }).limit(limit).toArray();
  } catch {
    items = [];
  }
  return ok(res, { signals: items, count: items.length });
}

async function update(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  const id = String(req.query.id || "");
  if (!id) return fail(res, 400, "VALIDATION_ERROR", "signal id required");
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const status = String(body.status || "");
  if (!["ACKNOWLEDGED", "DISMISSED", "EXECUTED", "EXPIRED"].includes(status)) {
    return fail(res, 400, "VALIDATION_ERROR", "status must be ACKNOWLEDGED|DISMISSED|EXECUTED|EXPIRED");
  }
  const store = await tryCollection("signals");
  await store.updateOne({ id }, { $set: { status, updated_by: user.sub ?? "owner", updated_at: new Date().toISOString() } });
  const audit = await tryCollection("audit_logs");
  await audit.insertOne({
    id: crypto.randomUUID(),
    action: "SIGNAL_STATUS",
    detail: `${id} → ${status}`,
    actor: user.sub ?? "owner",
    created_at: new Date().toISOString(),
  });
  return ok(res, { id, status });
}
