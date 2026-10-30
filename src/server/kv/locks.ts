import type { LeaseHolder as KitLeaseHolder } from "@emberkv/client";

import { kv } from "./client";

/**
 * Edit leases: "Budi is editing SO-2026-00042".
 *
 * A lease is a create-only key with a short TTL, renewed by a heartbeat
 * while the editor is open. If the browser crashes, the lease simply expires.
 * Leases are a UX guard that prevents two people from spending ten minutes on
 * conflicting edits; correctness does not depend on them, because every save
 * also checks the document's `version` column in PostgreSQL. Implemented by
 * the SDK kit; `LEASE_TTL_SECONDS` must match its lease TTL (the default).
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

function asHolder(holder: KitLeaseHolder): LeaseHolder {
  return { userId: holder.ownerId, name: holder.name ?? "Someone", since: holder.since };
}

export async function acquireLease(resource: string, me: { id: string; name: string }): Promise<LeaseResult> {
  const result = await kv().kit.leases.acquire(resource, me);
  return result.acquired ? result : { ...result, holder: asHolder(result.holder) };
}

/**
 * Extends our lease, or re-takes it if it lapsed and nobody else claimed it.
 * Returns false only when someone else now holds it.
 */
export async function renewLease(resource: string, me: { id: string; name: string }): Promise<boolean> {
  return kv().kit.leases.renew(resource, me);
}

export async function releaseLease(resource: string, userId: string): Promise<void> {
  await kv().kit.leases.release(resource, userId);
}

export async function leaseHolder(resource: string): Promise<LeaseHolder | null> {
  const holder = await kv().kit.leases.holder(resource);
  return holder && asHolder(holder);
}

export const salesOrderLease = (id: number) => `sales_order:${id}`;
export const purchaseOrderLease = (id: number) => `purchase_order:${id}`;
