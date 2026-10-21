/* Engine: status, heartbeats, commands, alerts, audit-logs.
   POST commands require a user OWNER session (never the AI itself). */
import { ok, fail, methodNotAllowed } from "../lib/responses.js";
import { requireUser, requireWorker } from "../lib/auth.js";
import { canSendEngineCommand } from "../lib/permissions.js";
import { tryCollection } from "../lib/database.js";
import { isValidCommand } from "../lib/validation.js";

export default async function handler(req, res) {
  const path = (req.query.path || "").toString().replace(/^\/+|\/+$/g, "");

  if (path === "status" && req.method === "GET") return getStatus(res);
  if (path === "commands" && req.method === "POST") return postCommand(req, res);
  if (path === "commands" && req.method === "GET") return getCommands(req, res);
  if (path === "heartbeats" && req.method === "POST") return postHeartbeat(req, res);
  return fail(res, 404, "NOT_FOUND", `Unknown engine route: ${path || "(root)"}`);
}

async function getStatus(res) {
  const hb = await tryCollection("engine_heartbeats");
  const last = await hb.findOne({}, { sort: { timestamp: -1 } });
  return ok(res, {
    state: last?.status ?? "UNKNOWN",
    mode: last?.mode ?? "RESEARCH",
    cycleCount: last?.cycle_count ?? 0,
    lastSeen: last?.timestamp ?? null,
    halted: last?.halted ?? true,
    haltReason: last?.halt_reason ?? null,
  });
}

async function postCommand(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  if (!canSendEngineCommand(user)) {
    return fail(res, 403, "FORBIDDEN", "OWNER role required to command the engine");
  }
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const command = String(body.command || "");
  if (!isValidCommand(command)) {
    return fail(res, 400, "VALIDATION_ERROR", `Invalid command: ${command}`);
  }
  const store = await tryCollection("engine_commands");
  const doc = {
    id: crypto.randomUUID(),
    command,
    strategy_id: body.strategy_id ?? null,
    payload: body.payload ?? null,
    requested_by: user.sub ?? "owner",
    created_at: new Date().toISOString(),
    status: "PENDING",
  };
  await store.insertOne(doc);
  const audit = await tryCollection("audit_logs");
  await audit.insertOne({
    id: crypto.randomUUID(),
    action: "ENGINE_COMMAND",
    detail: command,
    actor: user.sub ?? "owner",
    created_at: doc.created_at,
  });
  return ok(res, { commandId: doc.id, status: "PENDING" }, 202);
}

async function getCommands(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  const store = await tryCollection("engine_commands");
  const items = await store.find({ status: "PENDING" }).sort({ created_at: 1 }).limit(20).toArray();
  return ok(res, { commands: items });
}

async function postHeartbeat(req, res) {
  if (!requireWorker(req, res)) return;
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const store = await tryCollection("engine_heartbeats");
  await store.insertOne({
    id: crypto.randomUUID(),
    status: body.status ?? "RUNNING",
    mode: body.mode ?? "RESEARCH",
    cycle_count: body.cycle_count ?? 0,
    halted: Boolean(body.halted),
    halt_reason: body.halt_reason ?? null,
    positions_open: body.positions_open ?? 0,
    timestamp: new Date().toISOString(),
  });
  return ok(res, { accepted: true }, 201);
}
