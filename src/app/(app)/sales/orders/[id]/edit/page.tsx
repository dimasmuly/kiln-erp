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
import { saveSalesOrderAction } from "@/server/actions/sales";
import { requireUser } from "@/server/auth/session";
import { acquireLease, salesOrderLease } from "@/server/kv/locks";
import { getSalesOrder, salesFormOptions } from "@/server/modules/sales/queries";

export const metadata = { title: "Edit sales order" };
export const instant = false;

export default async function EditSalesOrderPage(props: PageProps<"/sales/orders/[id]/edit">) {
  const { user, ctx } = await requireUser("sales.write");
  const id = routeId((await props.params).id);
  if (!id) notFound();
  const [{ order, lines }, options] = await Promise.all([orNotFound(getSalesOrder(ctx, id)), salesFormOptions(ctx)]);
  if (order.status !== "draft") redirect(`/sales/orders/${id}`);

  const crumbs = [
    { label: "Sales orders", href: "/sales/orders" },
    { label: order.number, href: `/sales/orders/${id}` },
    { label: "Edit" },
  ];
  const lease = await acquireLease(salesOrderLease(id), user);
  if (!lease.acquired) {
    return (
      <>
        <PageHeader crumbs={crumbs} title={`Edit ${order.number}`} />
        <Alert tone="warn" title={`${lease.holder.name} is editing this order`}>
          They opened the editor at {dateTime(lease.holder.since)}. To avoid conflicting changes, editing is locked until they finish.
          <div className="mt-3">
            <LinkButton href={`/sales/orders/${id}`} size="sm">
              Back to order
            </LinkButton>
          </div>
        </Alert>
      </>
    );
  }

  return (
    <>
      <PageHeader crumbs={crumbs} title={`Edit ${order.number}`} />
      <LeaseGuard kind="sales_order" id={id} degraded={lease.degraded} />
      <OrderEditor
        kind="sales"
        action={saveSalesOrderAction}
        idem={crypto.randomUUID()}
        options={options}
        cancelHref={`/sales/orders/${id}`}
        initial={{
          id,
          version: order.version,
          partyId: order.customerId,
          warehouseId: order.warehouseId,
          orderDate: order.orderDate,
          taxRateBp: order.taxRateBp,
          notes: order.notes ?? "",
          lines: lines.map((l) => ({ productId: l.productId, qty: String(l.qty), unitPrice: toMoneyInput(l.unitPrice) })),
        }}
      />
    </>
  );
}
