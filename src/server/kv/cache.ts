import { isUnavailable, kv, logDegraded } from "./client";

/**
 * Read-through cache for expensive aggregates (dashboard KPIs). Shared by all
 * ERP instances, unlike an in-process cache, and invalidated explicitly by
 * every command that posts to the ledger, so the TTL is only a safety net.
 */

interface CachedValue<T> {
  value: T;
  computedAt: number;
}

export interface CacheRead<T> extends CachedValue<T> {
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
  const ns = kv().ns.cache;
  try {
    const hit = await ns.get<CachedValue<T>>(key);
    if (hit && isFresh(hit.value.value)) return { ...hit.value, source: "emberkv" };
  } catch (err) {
    if (!isUnavailable(err)) throw err;
    logDegraded("cache-read", err);
  }

  const fresh: CachedValue<T> = { value: await load(), computedAt: Date.now() };
  await ns.put(key, fresh, { ttl }).catch((err: unknown) => logDegraded("cache-write", err));
  return { ...fresh, source: "postgres" };
}

/** Call after a transaction commits; a failed invalidation only delays freshness by one TTL. */
export async function invalidate(...keys: string[]): Promise<void> {
  await kv()
    .ns.cache.batch(keys.map((key) => ({ op: "delete" as const, key })))
    .catch((err: unknown) => logDegraded("cache-invalidate", err));
}
