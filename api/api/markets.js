/* Markets: instruments, quotes, candles proxy, market status. */
import { ok, fail, methodNotAllowed } from "../lib/responses.js";
import { tryCollection } from "../lib/database.js";
import { cleanSymbol, cleanTimeframe, clampNumber } from "../lib/validation.js";

const DEFAULT_INSTRUMENTS = ["EURUSD", "GBPUSD", "USDJPY"];

export default async function handler(req, res) {
  const path = (req.query.path || "").toString().replace(/^\/+|\/+$/g, "");

  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  if (path === "" || path === "instruments") return listInstruments(res);
  if (path === "quotes") return quotes(res);
  if (path.startsWith("candles/")) return candles(res, path.slice(8));
  if (path === "status") return marketStatus(res);
  return fail(res, 404, "NOT_FOUND", `Unknown markets route: ${path}`);
}

async function listInstruments(res) {
  const store = await tryCollection("instruments");
  let items = [];
  try {
    items = await store.find({}).limit(50).toArray();
  } catch {
    items = [];
  }
  if (!items.length) {
    items = DEFAULT_INSTRUMENTS.map((symbol) => ({
      symbol,
      class: "FX_MAJOR",
      pip_size: symbol.includes("JPY") ? 0.01 : 0.0001,
      base_currency: symbol.slice(0, 3),
      quote_currency: symbol.slice(3),
      enabled: true,
    }));
  }
  return ok(res, { instruments: items });
}

async function quotes(res) {
  const store = await tryCollection("quotes");
  let items = [];
  try {
    items = await store.find({}).limit(50).toArray();
  } catch {
    items = [];
  }
  return ok(res, { quotes: items, live: items.length > 0 });
}

async function candles(res, rest) {
  const [symbolRaw, tfRaw] = rest.split("/");
  const symbol = cleanSymbol(symbolRaw);
  const timeframe = cleanTimeframe(tfRaw);
  if (!symbol) return fail(res, 400, "VALIDATION_ERROR", "symbol required");
  const limit = clampNumber(req0(res)?.query?.limit, 1, 2000, 500);
  const store = await tryCollection("candles");
  let items = [];
  try {
    items = await store.find({ symbol, timeframe }).limit(limit).toArray();
  } catch {
    items = [];
  }
  return ok(res, { symbol, timeframe, count: items.length, candles: items });
}

// small helper so candles() can read req via closure-free pattern
function req0(res) {
  return res.__req || null;
}

async function marketStatus(res) {
  return ok(res, {
    open: true,
    note: "FX market open Sun 22:00 UTC → Fri 22:00 UTC; engine still filters per-session rules.",
    timestamp: new Date().toISOString(),
  });
}
