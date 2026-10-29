import { createHash, randomBytes } from "node:crypto";

import { kv } from "./client";

/**
 * Server-side sessions in EmberKV.
 *
 * The cookie holds `<userId>.<token>`; EmberKV stores the session under
 * `<userId>:<sha256(token)>`. A leaked EmberKV log or backup therefore never
 * contains a usable token, and the `<userId>:` prefix lets us list and revoke
 * every session of a user (sign out everywhere, deactivation) with one scan.
 */

export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
/** Sliding expiry: extend the TTL at most once per this interval. */
const RENEW_AFTER_MS = 24 * 60 * 60 * 1000;

const COOKIE_PATTERN = /^([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/;

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

function storageKey(userId: string, token: string): string {
  return `${userId}:${createHash("sha256").update(token).digest("hex")}`;
}

function parseCookie(cookie: string): { userId: string; token: string } | null {
  const match = COOKIE_PATTERN.exec(cookie);
  return match ? { userId: match[1], token: match[2] } : null;
}

export async function createSession(userId: string, userAgent: string | null): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  const record: SessionRecord = { userId, createdAt: now, renewedAt: now, userAgent: userAgent?.slice(0, 200) ?? null };
  await kv().ns.sessions.put(storageKey(userId, token), record, { ttl: `${SESSION_TTL_SECONDS}s` });
  return `${userId}.${token}`;
}

/** Returns the session's user id, or null if the cookie is malformed, expired or revoked. */
export async function resolveSession(cookie: string): Promise<string | null> {
  const parsed = parseCookie(cookie);
  if (!parsed) return null;
  const key = storageKey(parsed.userId, parsed.token);
  const entry = await kv().ns.sessions.get<SessionRecord>(key);
  if (!entry || entry.value.userId !== parsed.userId) return null;

  if (Date.now() - entry.value.renewedAt > RENEW_AFTER_MS) {
    // `ifMatch` makes concurrent renewals harmless: one wins, the rest no-op.
    const renewed = { ...entry.value, renewedAt: Date.now() };
    await kv()
      .ns.sessions.put(key, renewed, { ttl: `${SESSION_TTL_SECONDS}s`, ifMatch: entry.etag })
      .catch(() => undefined);
  }
  return parsed.userId;
}

export async function destroySession(cookie: string): Promise<void> {
  const parsed = parseCookie(cookie);
  if (parsed) await kv().ns.sessions.delete(storageKey(parsed.userId, parsed.token));
}

export async function listSessions(userId: string): Promise<ActiveSession[]> {
  const sessions: ActiveSession[] = [];
  for await (const item of kv().ns.sessions.scan<SessionRecord>({ prefix: `${userId}:` })) {
    if (item.value) sessions.push({ ...item.value, id: item.key.slice(userId.length + 1, userId.length + 13), expiresAt: item.expiresAt });
  }
  return sessions.sort((a, b) => b.renewedAt - a.renewedAt);
}

/** Revokes every session of a user atomically. Returns how many were removed. */
export async function destroyAllSessions(userId: string): Promise<number> {
  const keys: string[] = [];
  for await (const item of kv().ns.sessions.scan({ prefix: `${userId}:` })) keys.push(item.key);
  for (let i = 0; i < keys.length; i += 1000) {
    await kv().ns.sessions.batch(keys.slice(i, i + 1000).map((key) => ({ op: "delete" as const, key })));
  }
  return keys.length;
}
