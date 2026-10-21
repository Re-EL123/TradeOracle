/* Input validation helpers. Reject unknown/unsafe payloads early. */
import { fail } from "./responses.js";

export function requireFields(body, fields, res) {
  const missing = fields.filter((f) => body?.[f] === undefined || body?.[f] === null || body?.[f] === "");
  if (missing.length) {
    fail(res, 400, "VALIDATION_ERROR", `Missing fields: ${missing.join(", ")}`);
    return false;
  }
  return true;
}

const COMMANDS = new Set([
  "REFRESH_MARKET_DATA",
  "RUN_ANALYSIS",
  "START_PAPER_TRADING",
  "STOP_NEW_ENTRIES",
  "RESUME_ENTRIES",
  "PAUSE_STRATEGY",
  "RESUME_STRATEGY",
  "RUN_BACKTEST",
  "RECONCILE_BROKER_STATE",
  "EMERGENCY_STOP",
]);

export function isValidCommand(cmd) {
  return COMMANDS.has(cmd);
}

export function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function cleanSymbol(s) {
  return String(s || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 10);
}

export function cleanTimeframe(s) {
  const tf = String(s || "H1").toUpperCase();
  return ["M5", "M15", "M30", "H1", "H4", "D1"].includes(tf) ? tf : "H1";
}
