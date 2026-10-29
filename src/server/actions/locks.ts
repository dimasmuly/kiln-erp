"use server";

import { getSession } from "../auth/session";
import { purchaseOrderLease, renewLease, salesOrderLease } from "../kv/locks";

/** Resources a client may hold a lease on. Anything else is rejected. */
function leaseResource(kind: string, id: number): string | null {
  if (!Number.isInteger(id) || id <= 0) return null;
  if (kind === "sales_order") return salesOrderLease(id);
  if (kind === "purchase_order") return purchaseOrderLease(id);
  return null;
}

/** Heartbeat from an open editor. Returns false once the lease is lost. */
export async function renewLeaseAction(kind: string, id: number): Promise<boolean> {
  const session = await getSession();
  const resource = leaseResource(kind, id);
  if (session.status !== "signed-in" || !resource) return false;
  return renewLease(resource, session.user);
}
