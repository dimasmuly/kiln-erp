import { EmberKVError } from "@emberkv/client";

import { isUnavailable, kv, logDegraded } from "./client";

/**
 * Edit leases: "Budi is editing SO-2026-00042".
 *
 * A lease is a create-only key with a short TTL, renewed by a heartbeat
 * while the editor is open. If the browser crashes, the lease simply expires.
 * Leases are a UX guard that prevents two people from spending ten minutes on
 * conflicting edits; correctness does not depend on them, because every save
 * also checks the document's `version` column in PostgreSQL.
 */

export const LEASE_TTL_SECONDS = 60;

export interface LeaseHolder {
  userId: string;
  name: string;
  since: number;
}

export type LeaseResult =
  | { acquired: true; degraded: boolean }
  | { acquired: false; holder: LeaseHolder; expiresAt: number | null };

const ttl = `${LEASE_TTL_SECONDS}s`;

export async function acquireLease(resource: string, me: { id: string; name: string }): Promise<LeaseResult> {
  const ns = kv().ns.locks;
  try {
    if (await ns.putIfAbsent(resource, { userId: me.id, name: me.name, since: Date.now() } satisfies LeaseHolder, { ttl })) {
      return { acquired: true, degraded: false };
    }
    const current = await ns.get<LeaseHolder>(resource);
    if (!current) return acquireLease(resource, me); // expired between the two calls
    if (current.value.userId !== me.id) {
      return { acquired: false, holder: current.value, expiresAt: current.expiresAt };
    }
    // Our own lease (another tab): refresh it.
    await ns.put(resource, current.value, { ttl, ifMatch: current.etag }).catch(() => undefined);
    return { acquired: true, degraded: false };
  } catch (err) {
    if (!isUnavailable(err)) throw err;
    logDegraded("locks", err);
    return { acquired: true, degraded: true };
  }
}

/**
 * Extends our lease, or re-takes it if it lapsed and nobody else claimed it.
 * Returns false only when someone else now holds it.
 */
export async function renewLease(resource: string, me: { id: string; name: string }): Promise<boolean> {
  const ns = kv().ns.locks;
  try {
    const current = await ns.get<LeaseHolder>(resource);
    if (!current) return (await acquireLease(resource, me)).acquired;
    if (current.value.userId !== me.id) return false;
    await ns.put(resource, current.value, { ttl, ifMatch: current.etag });
    return true;
  } catch (err) {
    if (err instanceof EmberKVError && err.code === "precondition_failed") return renewLease(resource, me);
    if (isUnavailable(err)) return true;
    throw err;
  }
}

export async function releaseLease(resource: string, userId: string): Promise<void> {
  const ns = kv().ns.locks;
  try {
    const current = await ns.get<LeaseHolder>(resource);
    // `ifMatch` so we never delete a lease someone else acquired a moment ago.
    if (current?.value.userId === userId) await ns.delete(resource, { ifMatch: current.etag });
  } catch (err) {
    if (!isUnavailable(err) && !(err instanceof EmberKVError && err.code === "precondition_failed")) throw err;
  }
}

export async function leaseHolder(resource: string): Promise<LeaseHolder | null> {
  try {
    return (await kv().ns.locks.get<LeaseHolder>(resource))?.value ?? null;
  } catch (err) {
    if (isUnavailable(err)) return null;
    throw err;
  }
}

export const salesOrderLease = (id: number) => `sales_order:${id}`;
export const purchaseOrderLease = (id: number) => `purchase_order:${id}`;
