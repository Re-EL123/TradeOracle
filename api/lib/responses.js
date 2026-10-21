/* Consistent API responses (§12.3). Never leak secrets or stack traces. */
import { randomUUID } from "node:crypto";

export function ok(res, data, status = 200) {
  return res.status(status).json({
    success: true,
    data,
    error: null,
    requestId: requestId(res),
  });
}

export function fail(res, status, code, message, details) {
  return res.status(status).json({
    success: false,
    data: null,
    error: { code, message, details: details ?? null },
    requestId: requestId(res),
  });
}

export function requestId(res) {
  if (!res.locals) res.locals = {};
  if (!res.locals.requestId) res.locals.requestId = randomUUID();
  return res.locals.requestId;
}

export function methodNotAllowed(res, allowed) {
  res.setHeader("Allow", allowed.join(", "));
  return fail(res, 405, "METHOD_NOT_ALLOWED", `Allowed: ${allowed.join(", ")}`);
}
