import { Ban, CheckCheck, FileText, Lock, Pencil, Truck } from "lucide-react";
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
import { date, money, percent, qty } from "@/lib/format";
import { routeId } from "@/lib/params";
import { transitionSalesOrderAction } from "@/server/actions/sales";
import { requireUser } from "@/server/auth/session";
import { can } from "@/server/auth/rbac";
import { leaseHolder, salesOrderLease } from "@/server/kv/locks";
import { getSalesOrder } from "@/server/modules/sales/queries";

const STEPS = [
  { key: "draft", label: "Draft" },
  { key: "confirmed", label: "Confirmed" },
  { key: "delivered", label: "Delivered" },
  { key: "invoiced", label: "Invoiced" },
  { key: "paid", label: "Paid" },
];

export const instant = false;

export default async function SalesOrderPage(props: PageProps<"/sales/orders/[id]">) {
  const { user, ctx } = await requireUser("sales.read");
  const id = routeId((await props.params).id);
  if (!id) notFound();
  const data = await orNotFound(getSalesOrder(ctx, id));
  const { order, customer, warehouse, lines, invoice } = data;
  const holder = order.status === "draft" ? await leaseHolder(salesOrderLease(id)) : null;
  const lockedByOther = holder && holder.userId !== user.id;
  const idem = () => crypto.randomUUID();
  const margin = order.costOfGoods !== null && order.subtotal > 0 ? (order.subtotal - order.costOfGoods) / order.subtotal : null;

  const actions = [];
  if (order.status === "draft" && can(user.role, "sales.write")) {
    actions.push(
      lockedByOther ? null : (
        <LinkButton key="edit" href={`/sales/orders/${id}/edit`}>
          <Pencil /> Edit
        </LinkButton>
      ),
      <TransitionButton key="cancel" action={transitionSalesOrderAction} id={id} op="cancel" idem={idem()} label="Cancel" pendingLabel="Cancelling…" variant="danger" icon={<Ban />} confirmMessage={`Cancel ${order.number}?`} />,
      <TransitionButton key="confirm" action={transitionSalesOrderAction} id={id} op="confirm" idem={idem()} label="Confirm & reserve stock" pendingLabel="Reserving…" icon={<CheckCheck />} />,
    );
  }
  if (order.status === "confirmed") {
    if (can(user.role, "sales.write"))
      actions.push(
        <TransitionButton key="cancel" action={transitionSalesOrderAction} id={id} op="cancel" idem={idem()} label="Cancel" pendingLabel="Cancelling…" variant="danger" icon={<Ban />} confirmMessage={`Cancel ${order.number} and release its reserved stock?`} />,
      );
    if (can(user.role, "sales.deliver"))
      actions.push(
        <TransitionButton key="deliver" action={transitionSalesOrderAction} id={id} op="deliver" idem={idem()} label="Mark delivered" pendingLabel="Posting…" icon={<Truck />} confirmMessage={`Ship ${order.number} from ${warehouse.code}? This issues stock and posts cost of goods.`} />,
      );
  }
  if (order.status === "delivered" && can(user.role, "sales.invoice")) {
    actions.push(<TransitionButton key="invoice" action={transitionSalesOrderAction} id={id} op="invoice" idem={idem()} label="Issue invoice" pendingLabel="Issuing…" icon={<FileText />} />);
  }
  if (invoice) {
    actions.push(
      <LinkButton key="inv" href={`/sales/invoices/${invoice.id}`}>
        <FileText /> {invoice.number}
      </LinkButton>,
    );
  }

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Sales orders", href: "/sales/orders" }, { label: order.number }]}
        title={order.number}
        meta={<StatusBadge status={order.status} />}
        description={`${customer.name} · ${date(order.orderDate)}`}
        actions={actions}
      />

      {lockedByOther && (
        <Alert tone="warn" title={`${holder.name} is editing this order`} className="mb-4">
          Editing is locked until they save or close the editor (the lock in EmberKV expires a minute after their last heartbeat).
        </Alert>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>{order.status === "cancelled" ? <p className="px-5 py-4 text-sm text-bad">This order was cancelled. Any reserved stock was released.</p> : <Timeline steps={STEPS} current={order.status} />}</Card>

          <Card>
            <CardHeader title="Lines" description={order.costOfGoods !== null ? "Cost is the weighted-average cost removed from inventory at delivery." : undefined} />
            <Table>
              <THead>
                <tr>
                  <TH>Product</TH>
                  <TH numeric>Qty</TH>
                  <TH numeric>Unit price</TH>
                  {order.costOfGoods !== null && <TH numeric>Line cost</TH>}
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
                    <TD numeric>{money(l.unitPrice)}</TD>
                    {order.costOfGoods !== null && <TD numeric className="text-muted">{l.cost !== null ? money(l.cost) : "—"}</TD>}
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
                    <TD colSpan={order.costOfGoods !== null ? 4 : 3} className="text-right text-muted">
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
                  { label: "Customer", value: customer.name },
                  { label: "Tax ID (NPWP)", value: customer.taxId ?? "—" },
                  { label: "Ship from", value: `${warehouse.code} · ${warehouse.name}` },
                  { label: "Payment terms", value: `${customer.terms} days` },
                  { label: "Created by", value: data.createdBy ?? "—" },
                  { label: "Gross margin", value: margin !== null ? `${money(order.subtotal - order.costOfGoods!)} (${percent(margin)})` : "After delivery" },
                ]}
              />
            </CardBody>
          </Card>
          {holder && !lockedByOther && (
            <p className="flex items-center gap-1.5 text-[12px] text-muted">
              <Lock className="size-3.5" /> You hold the edit lock in another tab.
            </p>
          )}
          <LedgerCard entries={data.entries} />
          <HistoryCard history={data.history} />
        </div>
      </div>
    </>
  );
}
