/* Orders (write) + Trades (read). Order creation requires OWNER + goes to
   the engine command queue; API never places orders directly with a broker. */
import { ok, fail, methodNotAllowed } from "../lib/responses.js";
import { requireUser } from "../lib/auth.js";
import { hasRole, ROLES } from "../lib/permissions.js";
import { tryCollection } from "../lib/database.js";
import { cleanSymbol, cleanTimeframe, clampNumber } from "../lib/validation.js";

export default async function handler(req, res) {
  const path = (req.query.path || "").toString().replace(/^\/+|\/+$/g, "");
  if (path === "trades") {
    if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
    return trades(req, res);
  }
  if (req.method === "GET") return orders(req, res);
  if (req.method === "POST") return createOrder(req, res);
  return methodNotAllowed(res, ["GET", "POST"]);
}

async function orders(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  const store = await tryCollection("orders");
  let items = [];
  try {
    items = await store.find({}).sort({ created_at: -1 }).limit(100).toArray();
  } catch {
    items = [];
  }
  return ok(res, { orders: items, count: items.length });
}

async function trades(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  const store = await tryCollection("trades");
  let items = [];
  try {
    items = await store.find({}).sort({ closed_at: -1 }).limit(200).toArray();
  } catch {
    items = [];
  }
  return ok(res, { trades: items, count: items.length });
}

async function createOrder(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  if (!hasRole(user, ROLES.OWNER)) return fail(res, 403, "FORBIDDEN", "OWNER role required to create orders");
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

  const direction = String(body.direction || "").toUpperCase();
  if (!["LONG", "SHORT"].includes(direction)) {
    return fail(res, 400, "VALIDATION_ERROR", "direction must be LONG or SHORT");
  }
  const symbol = cleanSymbol(body.symbol);
  if (!symbol) return fail(res, 400, "VALIDATION_ERROR", "symbol required");
  const volume = Number(body.volume);
  if (!(volume > 0)) return fail(res, 400, "VALIDATION_ERROR", "volume must be > 0");
  const stopLoss = Number(body.stop_loss);
  const takeProfit = Number(body.take_profit);
  if (!(stopLoss > 0) || !(takeProfit > 0)) {
    return fail(res, 400, "VALIDATION_ERROR", "stop_loss and take_profit required (no naked orders)");
  }

  const cmdId = crypto.randomUUID();
  const cmds = await tryCollection("engine_commands");
  await cmds.insertOne({
    id: cmdId,
    command: "RUN_ANALYSIS",
    payload: {
      manual_order: {
        symbol,
        timeframe: cleanTimeframe(body.timeframe || "H1"),
        direction,
        volume: clampNumber(volume, 0.01, 100, 0.01),
        entry: body.entry ?? null,
        stop_loss: stopLoss,
        take_profit: takeProfit,
        reason: String(body.reason || "manual").slice(0, 200),
      },
    },
    requested_by: user.sub ?? "owner",
    created_at: new Date().toISOString(),
    status: "PENDING",
  });
  const audit = await tryCollection("audit_logs");
  await audit.insertOne({
    id: crypto.randomUUID(),
    action: "ORDER_REQUEST",
    detail: `${direction} ${symbol} ${volume}`,
    actor: user.sub ?? "owner",
    created_at: new Date().toISOString(),
  });
  return ok(res, { commandId: cmdId, status: "QUEUED_FOR_ENGINE" }, 202);
}
