import { createHash } from "node:crypto";

import { createKit, EmberKV, type Kit, type Namespace } from "@emberkv/client";

import { env } from "../env";

/**
 * The ERP's only door to EmberKV (the Rust service in ../emberkv), through
 * its official TypeScript SDK. EmberKV holds hot, short-lived state:
 *
 *   sessions     login sessions, 7-day sliding TTL
 *   limits       login throttling (fixed-window rate limits)
 *   idempotency  exactly-once form submissions (If-None-Match: *)
 *   locks        "someone else is editing this document" leases
 *   cache        dashboard aggregates, invalidated on every posting
 *
 * Business records never go here; see docs/adr/0002-emberkv-boundary.md.
 *
 * The features themselves (sessions, throttling, exactly-once, leases,
 * cache) come from the SDK's kit; the modules in this folder only adapt
 * them to the ERP's names, errors and policies.
 */
export const NAMESPACES = ["sessions", "limits", "idempotency", "locks", "cache"] as const;
export type NamespaceName = (typeof NAMESPACES)[number];

/** What the ERP stores with each session, next to the kit's own fields. */
export interface SessionMeta {
  userAgent: string | null;
}

export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

interface KvHandles {
  client: EmberKV;
  admin: EmberKV | null;
  ns: Record<NamespaceName, Namespace>;
  kit: Kit<SessionMeta>;
}

function handles(client: EmberKV, admin: EmberKV | null): KvHandles {
  const ns = Object.fromEntries(NAMESPACES.map((name) => [name, client.namespace(name)])) as KvHandles["ns"];
  const kit = createKit<SessionMeta>({ client, onDegraded: logDegraded, sessions: { ttlSeconds: SESSION_TTL_SECONDS } });
  return { client, admin, ns, kit };
}

const globalForKv = globalThis as unknown as { __kilnKv?: KvHandles };

function create(): KvHandles {
  const { EMBERKV_URL, EMBERKV_TOKEN, EMBERKV_ADMIN_TOKEN } = env();
  // Every request path that touches EmberKV is user-facing; fail fast and
  // let the caller's fallback decide instead of hanging a page for 5 s.
  const client = new EmberKV({ baseUrl: EMBERKV_URL, token: EMBERKV_TOKEN, timeoutMs: 1500 });
  const admin = EMBERKV_ADMIN_TOKEN
    ? new EmberKV({ baseUrl: EMBERKV_URL, token: EMBERKV_ADMIN_TOKEN, timeoutMs: 3000 })
    : null;
  return handles(client, admin);
}

export function kv(): KvHandles {
  globalForKv.__kilnKv ??= create();
  return globalForKv.__kilnKv;
}

/** Points the ERP at a different EmberKV (integration tests). */
export function overrideKv(client: EmberKV, admin: EmberKV | null = null): void {
  globalForKv.__kilnKv = handles(client, admin);
}

/**
 * EmberKV keys appear in its access logs, so anything personal (emails, IPs)
 * or secret (session tokens) is hashed before it becomes part of a key.
 */
export function opaqueKey(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

export { isUnavailable } from "@emberkv/client";

/** Structured log line for degraded-mode decisions, greppable in production. */
export function logDegraded(feature: string, err: unknown): void {
  const detail = err instanceof Error ? err.message : String(err);
  console.warn(JSON.stringify({ level: "warn", msg: "emberkv degraded", feature, detail }));
}
