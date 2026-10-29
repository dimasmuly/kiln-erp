import { Ban, Banknote, PackageCheck, Pencil, Send } from "lucide-react";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { HistoryCard, LedgerCard, orNotFound, Timeline } from "@/components/documents";
import { TransitionButton } from "@/components/transition-button";
import { StatusBadge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card, CardBody, CardHeader, DescriptionList } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TD, TFoot, TH, THead, TR } from "@/components/ui/table";
import { formatTaxRate } from "@/domain/orders";
import { addDays } from "@/server/modules/shared";
import { date, money, qty } from "@/lib/format";
import { routeId } from "@/lib/params";
import { transitionPurchaseOrderAction } from "@/server/actions/purchasing";
import { requireUser } from "@/server/auth/session";
import { can } from "@/server/auth/rbac";
import { leaseHolder, purchaseOrderLease } from "@/server/kv/locks";
import { getPurchaseOrder } from "@/server/modules/purchasing/queries";

const STEPS = [
  { key: "draft", label: "Draft" },
  { key: "ordered", label: "Ordered" },
  { key: "received", label: "Received" },
  { key: "paid", label: "Paid" },
];

export const instant = false;

export default async function PurchaseOrderPage(props: PageProps<"/purchasing/orders/[id]">) {
  const { user, ctx } = await requireUser("purchasing.read");
  const id = routeId((await props.params).id);
  if (!id) notFound();
  const data = await orNotFound(getPurchaseOrder(ctx, id));
  const { order, supplier, warehouse, lines } = data;
  const holder = order.status === "draft" ? await leaseHolder(purchaseOrderLease(id)) : null;
  const lockedByOther = holder && holder.userId !== user.id;
  const idem = () => crypto.randomUUID();
  const t = (op: string, label: string, pendingLabel: string, icon: ReactNode, extra: { variant?: "danger"; confirmMessage?: string } = {}) => (
    <TransitionButton key={op} action={transitionPurchaseOrderAction} id={id} op={op} idem={idem()} label={label} pendingLabel={pendingLabel} icon={icon} {...extra} />
  );

  const actions = [];
  if (order.status === "draft" && can(user.role, "purchasing.write")) {
    if (!lockedByOther)
      actions.push(
        <LinkButton key="edit" href={`/purchasing/orders/${id}/edit`}>
          <Pencil /> Edit
        </LinkButton>,
      );
    actions.push(t("cancel", "Cancel", "Cancelling…", <Ban />, { variant: "danger", confirmMessage: `Cancel ${order.number}?` }), t("place", "Send to supplier", "Sending…", <Send />));
  }
  if (order.status === "ordered") {
    if (can(user.role, "purchasing.write")) actions.push(t("cancel", "Cancel", "Cancelling…", <Ban />, { variant: "danger", confirmMessage: `Cancel ${order.number}?` }));
    if (can(user.role, "purchasing.receive"))
      actions.push(t("receive", "Receive goods", "Posting…", <PackageCheck />, { confirmMessage: `Receive all goods on ${order.number} into ${warehouse.code}?` }));
  }
  if (order.status === "received" && can(user.role, "purchasing.payment")) {
    actions.push(t("pay", "Pay supplier", "Posting…", <Banknote />, { confirmMessage: `Record payment of ${money(order.total)} to ${supplier.name}?` }));
  }

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Purchase orders", href: "/purchasing/orders" }, { label: order.number }]}
        title={order.number}
        meta={<StatusBadge status={order.status} />}
        description={`${supplier.name} · ${date(order.orderDate)}`}
        actions={actions}
      />
      {lockedByOther && (
        <Alert tone="warn" title={`${holder.name} is editing this purchase order`} className="mb-4">
          Editing is locked until they save or close the editor.
        </Alert>
      )}
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>{order.status === "cancelled" ? <p className="px-5 py-4 text-sm text-bad">This purchase order was cancelled.</p> : <Timeline steps={STEPS} current={order.status} />}</Card>
          <Card>
            <CardHeader title="Lines" />
            <Table>
              <THead>
                <tr>
                  <TH>Product</TH>
                  <TH numeric>Qty</TH>
                  <TH numeric>Unit cost</TH>
                  <TH numeric>Amount</TH>
                </tr>
              </THead>
              <tbody>
                {lines.map((l) => (
                  <TR key={l.id}>
                    <TD>
                      <Link href={`/inventory/products/${l.productId}`} className="font-medium hover:text-accent-text">
                        {l.name}
                      </Link>
                      <span className="block text-[12px] text-muted">{l.sku}</span>
                    </TD>
                    <TD numeric>
                      {qty(l.qty)} <span className="text-muted">{l.unit}</span>
                    </TD>
                    <TD numeric>{money(l.unitCost)}</TD>
                    <TD numeric className="font-medium">
                      {money(l.lineTotal)}
                    </TD>
                  </TR>
                ))}
              </tbody>
              <TFoot>
                {[
                  ["Subtotal", money(order.subtotal)],
                  [`PPN ${formatTaxRate(order.taxRateBp)}`, money(order.tax)],
                  ["Total", money(order.total)],
                ].map(([label, value]) => (
                  <tr key={label}>
                    <TD colSpan={3} className="text-right text-muted">
                      {label}
                    </TD>
                    <TD numeric className={label === "Total" ? "text-base font-semibold" : ""}>
                      {value}
                    </TD>
                  </tr>
                ))}
              </TFoot>
            </Table>
          </Card>
          {order.notes && (
            <Card>
              <CardHeader title="Notes" />
              <CardBody className="text-sm whitespace-pre-wrap text-muted">{order.notes}</CardBody>
            </Card>
          )}
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <DescriptionList
                items={[
                  { label: "Supplier", value: supplier.name },
                  { label: "Tax ID (NPWP)", value: supplier.taxId ?? "—" },
                  { label: "Deliver to", value: `${warehouse.code} · ${warehouse.name}` },
                  { label: "Expected", value: date(order.expectedDate) },
                  { label: "Received", value: date(order.receivedOn) },
                  { label: order.paidOn ? "Paid" : "Payment due", value: order.paidOn ? date(order.paidOn) : order.receivedOn ? date(addDays(order.receivedOn, supplier.terms)) : `${supplier.terms} days after receipt` },
                  { label: "Created by", value: data.createdBy ?? "—" },
                ]}
              />
            </CardBody>
          </Card>
          <LedgerCard entries={data.entries} />
          <HistoryCard history={data.history} />
        </div>
      </div>
    </>
  );
}
