import { notFound, redirect } from "next/navigation";

import { orNotFound } from "@/components/documents";
import { LeaseGuard } from "@/components/lease-guard";
import { OrderEditor } from "@/components/order-editor";
import { LinkButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { toMoneyInput } from "@/domain/money";
import { dateTime } from "@/lib/format";
import { routeId } from "@/lib/params";
import { savePurchaseOrderAction } from "@/server/actions/purchasing";
import { requireUser } from "@/server/auth/session";
import { acquireLease, purchaseOrderLease } from "@/server/kv/locks";
import { getPurchaseOrder, purchaseFormOptions } from "@/server/modules/purchasing/queries";

export const metadata = { title: "Edit purchase order" };
export const instant = false;

export default async function EditPurchaseOrderPage(props: PageProps<"/purchasing/orders/[id]/edit">) {
  const { user, ctx } = await requireUser("purchasing.write");
  const id = routeId((await props.params).id);
  if (!id) notFound();
  const [{ order, lines }, options] = await Promise.all([orNotFound(getPurchaseOrder(ctx, id)), purchaseFormOptions(ctx)]);
  if (order.status !== "draft") redirect(`/purchasing/orders/${id}`);

  const crumbs = [
    { label: "Purchase orders", href: "/purchasing/orders" },
    { label: order.number, href: `/purchasing/orders/${id}` },
    { label: "Edit" },
  ];
  const lease = await acquireLease(purchaseOrderLease(id), user);
  if (!lease.acquired) {
    return (
      <>
        <PageHeader crumbs={crumbs} title={`Edit ${order.number}`} />
        <Alert tone="warn" title={`${lease.holder.name} is editing this purchase order`}>
          They opened the editor at {dateTime(lease.holder.since)}. Editing is locked until they finish.
          <div className="mt-3">
            <LinkButton href={`/purchasing/orders/${id}`} size="sm">
              Back to purchase order
            </LinkButton>
          </div>
        </Alert>
      </>
    );
  }

  return (
    <>
      <PageHeader crumbs={crumbs} title={`Edit ${order.number}`} />
      <LeaseGuard kind="purchase_order" id={id} degraded={lease.degraded} />
      <OrderEditor
        kind="purchase"
        action={savePurchaseOrderAction}
        idem={crypto.randomUUID()}
        options={options}
        cancelHref={`/purchasing/orders/${id}`}
        initial={{
          id,
          version: order.version,
          partyId: order.supplierId,
          warehouseId: order.warehouseId,
          orderDate: order.orderDate,
          expectedDate: order.expectedDate ?? "",
          taxRateBp: order.taxRateBp,
          notes: order.notes ?? "",
          lines: lines.map((l) => ({ productId: l.productId, qty: String(l.qty), unitPrice: toMoneyInput(l.unitCost) })),
        }}
      />
    </>
  );
}
