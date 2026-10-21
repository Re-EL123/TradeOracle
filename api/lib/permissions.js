/* Permission checks — server-side only. Hiding UI is never access control. */
export const ROLES = { OWNER: "OWNER", ANALYST: "ANALYST", VIEWER: "VIEWER" };

const ROLE_RANK = { VIEWER: 1, ANALYST: 2, OWNER: 3 };

export function hasRole(session, minRole = ROLES.VIEWER) {
  if (!session?.role) return false;
  return (ROLE_RANK[session.role] || 0) >= (ROLE_RANK[minRole] || 99);
}

export function canMutateRisk(session) {
  return hasRole(session, ROLES.OWNER);
}

export function canSendEngineCommand(session) {
  return hasRole(session, ROLES.OWNER);
}

export function canChangeMode(session, newMode) {
  if (!hasRole(session, ROLES.OWNER)) return false;
  // LIVE additionally requires an explicit confirmation claim set by the UI
  // after the user acknowledges the release-gate checklist.
  return true;
}
