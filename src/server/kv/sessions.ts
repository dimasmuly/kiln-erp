import { kv, SESSION_TTL_SECONDS } from "./client";

/**
 * Login sessions, via the SDK kit. The cookie holds `<userId>.<token>`;
 * EmberKV stores the session under `<userId>:<sha256(token)>`, so a leaked
 * EmberKV log or backup never contains a usable token, and every session of
 * a user can be listed or revoked with one scan.
 */

export { SESSION_TTL_SECONDS };

export interface SessionRecord {
  userId: string;
  createdAt: number;
  renewedAt: number;
  userAgent: string | null;
}

export interface ActiveSession extends SessionRecord {
  id: string;
  expiresAt: number | null;
}

export async function createSession(userId: string, userAgent: string | null): Promise<string> {
  return kv().kit.sessions.create(userId, { userAgent: userAgent?.slice(0, 200) ?? null });
}

/** Returns the session's user id, or null if the cookie is malformed, expired or revoked. */
export async function resolveSession(cookie: string): Promise<string | null> {
  return (await kv().kit.sessions.resolve(cookie))?.userId ?? null;
}

export async function destroySession(cookie: string): Promise<void> {
  await kv().kit.sessions.destroy(cookie);
}

export async function listSessions(userId: string): Promise<ActiveSession[]> {
  const sessions = await kv().kit.sessions.list(userId);
  return sessions.map(({ id, record, expiresAt }) => ({ ...record, id, expiresAt }));
}

/** Revokes every session of a user. Returns how many were removed. */
export async function destroyAllSessions(userId: string): Promise<number> {
  return kv().kit.sessions.destroyAll(userId);
}
