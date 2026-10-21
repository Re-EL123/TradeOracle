/* GET /api/v1/health — unauthenticated liveness/dependency check. */
import { ok, fail, methodNotAllowed } from "../lib/responses.js";
import { config } from "../lib/config.js";
import { tryCollection } from "../lib/database.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);

  const c = config();
  const checks = { api: "up", database: "unknown" };
  let status = 200;

  try {
    const hb = await tryCollection("engine_heartbeats");
    const last = await hb.findOne({}, { sort: { timestamp: -1 } });
    checks.database = last ? "reachable" : "empty";
    checks.engineLastSeen = last?.timestamp ?? null;
    checks.engineStatus = last?.status ?? "UNKNOWN";
  } catch {
    checks.database = "unavailable";
  }

  const body = {
    status: "ok",
    env: c.env,
    version: "1.0.0",
    checks,
    timestamp: new Date().toISOString(),
  };
  return ok(res, body, status);
}
