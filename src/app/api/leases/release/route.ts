import { getSession } from "@/server/auth/session";
import { purchaseOrderLease, releaseLease, salesOrderLease } from "@/server/kv/locks";

/** Target of `navigator.sendBeacon` when an editor tab closes. */
export async function POST(request: Request) {
  const session = await getSession();
  if (session.status !== "signed-in") return new Response(null, { status: 401 });
  const body = (await request.json().catch(() => null)) as { kind?: string; id?: number } | null;
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) return new Response(null, { status: 400 });
  const resource = body?.kind === "sales_order" ? salesOrderLease(id) : body?.kind === "purchase_order" ? purchaseOrderLease(id) : null;
  if (!resource) return new Response(null, { status: 400 });
  await releaseLease(resource, session.user.id);
  return new Response(null, { status: 204 });
}
