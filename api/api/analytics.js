/* Analytics: performance summary assembled from closed trades + engine state. */
import { ok, methodNotAllowed } from "../lib/responses.js";
import { requireUser } from "../lib/auth.js";
import { tryCollection } from "../lib/database.js";
import { clampNumber } from "../lib/validation.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  const user = requireUser(req, res);
  if (!user) return;

  const limit = clampNumber(req.query.limit, 1, 1000, 200);
  const store = await tryCollection("trades");
  let trades = [];
  try {
    trades = await store.find({}).sort({ closed_at: -1 }).limit(limit).toArray();
  } catch {
    trades = [];
  }

  const pnls = trades.map((t) => Number(t.pnl ?? 0) - Number(t.commission ?? 0));
  const wins = pnls.filter((p) => p > 0);
  const losses = pnls.filter((p) => p < 0);
  const grossProfit = wins.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
  const longs = trades.filter((t) => t.direction === "LONG");
  const shorts = trades.filter((t) => t.direction === "SHORT");

  return ok(res, {
    tradeCount: trades.length,
    netPnl: pnls.reduce((a, b) => a + b, 0),
    winRatePct: trades.length ? (wins.length / trades.length) * 100 : null,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
    expectancy: trades.length ? pnls.reduce((a, b) => a + b, 0) / trades.length : null,
    grossProfit,
    grossLoss,
    longCount: longs.length,
    shortCount: shorts.length,
    longPnl: longs.reduce((a, t) => a + Number(t.pnl ?? 0), 0),
    shortPnl: shorts.reduce((a, t) => a + Number(t.pnl ?? 0), 0),
    byStrategy: groupBy(trades, (t) => t.strategy ?? "unknown"),
    note: "Values derived from closed trades only; dashboard shows LIVE vs SIMULATED explicitly.",
  });
}

function groupBy(items, keyFn) {
  const out = {};
  for (const item of items) {
    const k = keyFn(item);
    out[k] = out[k] || { count: 0, pnl: 0 };
    out[k].count += 1;
    out[k].pnl += Number(item.pnl ?? 0) - Number(item.commission ?? 0);
  }
  return out;
}
