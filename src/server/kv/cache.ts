import { kv } from "./client";

/**
 * Read-through cache for expensive aggregates (dashboard KPIs). Shared by all
 * ERP instances, unlike an in-process cache, and invalidated explicitly by
 * every command that posts to the ledger, so the TTL is only a safety net.
 */

export interface CacheRead<T> {
  value: T;
  computedAt: number;
  source: "emberkv" | "postgres";
}

export const CACHE_KEYS = {
  dashboard: "dashboard:v1",
} as const;

export async function readThrough<T>(
  key: string,
  ttl: string,
  load: () => Promise<T>,
  isFresh: (value: T) => boolean = () => true,
): Promise<CacheRead<T>> {
  const read = await kv().kit.cache.readThrough(key, { ttl, load, isFresh });
  return { value: read.value, computedAt: read.computedAt, source: read.source === "cache" ? "emberkv" : "postgres" };
}

/** Call after a transaction commits; a failed invalidation only delays freshness by one TTL. */
export async function invalidate(...keys: string[]): Promise<void> {
  await kv().kit.cache.invalidate(...keys);
}
