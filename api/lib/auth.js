/* Session auth — signed httpOnly cookie session with server-side checks.
   Single-user first release; roles ready for multi-user. */
import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "./config.js";

const COOKIE = "to_session";
const MAX_AGE_S = 60 * 60 * 12;

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", config().sessionSecret || "dev-secret")
    .update(body)
    .digest("base64url");
  return `${body}.${sig}`;
}

function verify(token) {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const expected = createHmac("sha256", config().sessionSecret || "dev-secret")
    .update(body)
    .digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (payload.exp && payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

export function sessionFrom(req) {
  const header = req.headers.cookie || "";
  const match = header.split(";").map((s) => s.trim()).find((s) => s.startsWith(`${COOKIE}=`));
  if (!match) return null;
  return verify(decodeURIComponent(match.slice(COOKIE.length + 1)));
}

export function setSessionCookie(res, payload) {
  const token = sign({ ...payload, exp: Math.floor(Date.now() / 1000) + MAX_AGE_S });
  const cookie = `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${MAX_AGE_S}`;
  const existing = res.getHeader("Set-Cookie") || [];
  res.setHeader("Set-Cookie", [...(Array.isArray(existing) ? existing : [existing]), cookie]);
}

export function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
}

export function requireUser(req, res) {
  const s = sessionFrom(req);
  if (!s) {
    res.status(401).json({
      success: false,
      data: null,
      error: { code: "UNAUTHENTICATED", message: "Valid session required" },
    });
    return null;
  }
  return s;
}

/** Worker identity for engine↔API command channel (never a user session). */
export function requireWorker(req, res) {
  const token = req.headers["x-engine-token"];
  const expected = config().workerToken;
  if (!expected || token !== expected) {
    res.status(401).json({
      success: false,
      data: null,
      error: { code: "UNAUTHENTICATED", message: "Engine worker token required" },
    });
    return false;
  }
  return true;
}
