/* Backtests: list runs, get one report, enqueue a run (engine executes). */
import { ok, fail, methodNotAllowed } from "../lib/responses.js";
import { requireUser } from "../lib/auth.js";
import { tryCollection } from "../lib/database.js";
import { cleanSymbol, cleanTimeframe, clampNumber } from "../lib/validation.js";

const KNOWN_STRATEGIES = ["trend_pullback", "breakout_retest"];

export default async function handler(req, res) {
  if (req.method === "GET") return get(req, res);
  if (req.method === "POST") return post(req, res);
  return methodNotAllowed(res, ["GET", "POST"]);
}

async function get(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  const id = String(req.query.id || "");
  const store = await tryCollection("backtests");
  try {
    if (id) {
      const doc = await store.findOne({ id });
      if (!doc) return fail(res, 404, "NOT_FOUND", `Backtest ${id} not found`);
      return ok(res, { backtest: doc });
    }
    const limit = clampNumber(req.query.limit, 1, 200, 50);
    const items = await store.find({}).sort({ created_at: -1 }).limit(limit).toArray();
    return ok(res, { backtests: items, count: items.length });
  } catch {
    return ok(res, { backtests: [], count: 0 });
  }
}

async function post(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const strategy = String(body.strategy || "");
  if (!KNOWN_STRATEGIES.includes(strategy)) {
    return fail(res, 400, "VALIDATION_ERROR", `Unknown strategy: ${strategy}`);
  }
  const doc = {
    id: crypto.randomUUID(),
    strategy,
    symbol: cleanSymbol(body.symbol || "EURUSD"),
    timeframe: cleanTimeframe(body.timeframe || "H1"),
    start: body.start ?? null,
    end: body.end ?? null,
    spread_pips: clampNumber(body.spread_pips, 0, 20, 0.8),
    commission: clampNumber(body.commission, 0, 50, 3.5),
    slippage_pips: clampNumber(body.slippage_pips, 0, 10, 0.2),
    initial_capital: clampNumber(body.initial_capital, 1000, 10_000_000, 100_000),
    status: "QUEUED",
    requested_by: user.sub ?? "owner",
    created_at: new Date().toISOString(),
  };
  const store = await tryCollection("backtests");
  await store.insertOne(doc);

  // Enqueue a command for the engine worker (which owns data access).
  const cmds = await tryCollection("engine_commands");
  await cmds.insertOne({
    id: crypto.randomUUID(),
    command: "RUN_BACKTEST",
    strategy_id: strategy,
    payload: { backtest_id: doc.id, symbol: doc.symbol, timeframe: doc.timeframe, spread_pips: doc.spread_pips, commission: doc.commission, slippage_pips: doc.slippage_pips, initial_capital: doc.initial_capital },
    requested_by: user.sub ?? "owner",
    created_at: new Date().toISOString(),
    status: "PENDING",
  });
  return ok(res, { backtestId: doc.id, status: "QUEUED" }, 202);
}
