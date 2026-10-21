/* Positions: open list, close request (goes through engine command queue). */
import { ok, fail, methodNotAllowed } from "../lib/responses.js";
import { requireUser } from "../lib/auth.js";
import { tryCollection } from "../lib/database.js";

export default async function handler(req, res) {
  if (req.method === "GET") return list(req, res);
  if (req.method === "DELETE") return close(req, res);
  return methodNotAllowed(res, ["GET", "DELETE"]);
}

async function list(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  const store = await tryCollection("positions");
  let items = [];
  try {
    items = await store.find({ state: "OPEN" }).sort({ opened_at: -1 }).limit(50).toArray();
  } catch {
    items = [];
  }
  return ok(res, { positions: items, count: items.length });
}

async function close(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  const id = String(req.query.id || "");
  if (!id) return fail(res, 400, "VALIDATION_ERROR", "position id required");
  const store = await tryCollection("positions");
  const pos = await store.findOne({ id });
  if (!pos) return fail(res, 404, "NOT_FOUND", `Position ${id} not found`);
  if (pos.state !== "OPEN") return fail(res, 409, "CONFLICT", "Position already closed");

  const cmds = await tryCollection("engine_commands");
  await cmds.insertOne({
    id: crypto.randomUUID(),
    command: "RECONCILE_BROKER_STATE",
    payload: { action: "CLOSE_POSITION", position_id: id },
    requested_by: user.sub ?? "owner",
    created_at: new Date().toISOString(),
    status: "PENDING",
  });
  const audit = await tryCollection("audit_logs");
  await audit.insertOne({
    id: crypto.randomUUID(),
    action: "POSITION_CLOSE_REQUEST",
    detail: id,
    actor: user.sub ?? "owner",
    created_at: new Date().toISOString(),
  });
  return ok(res, { positionId: id, status: "CLOSING_REQUESTED" }, 202);
}
