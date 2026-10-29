import { Plus, Search, Truck } from "lucide-react";
import Link from "next/link";

import { StatusBadge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Input } from "@/components/ui/form";
import { LinkTabs, Pagination } from "@/components/ui/nav";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { PURCHASE_ORDER_STATUSES } from "@/domain/workflow";
import { date, money } from "@/lib/format";
import { oneOf, pageNumber, str, withQuery } from "@/lib/params";
import { requireUser } from "@/server/auth/session";
import { can } from "@/server/auth/rbac";
import { listPurchaseOrders } from "@/server/modules/purchasing/queries";

export const metadata = { title: "Purchase orders" };
export const instant = false;

export default async function PurchaseOrdersPage(props: PageProps<"/purchasing/orders">) {
  const { user, ctx } = await requireUser("purchasing.read");
  const params = await props.searchParams;
  const status = oneOf(params.status, PURCHASE_ORDER_STATUSES);
  const q = str(params.q);
  const data = await listPurchaseOrders(ctx, { status, q, page: pageNumber(params.page) });
  const all = Object.values(data.statusCounts).reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHeader
        title="Purchase orders"
        description="Receiving goods adds stock at the PO cost and posts the supplier payable."
        actions={
          can(user.role, "purchasing.write") && (
            <LinkButton href="/purchasing/orders/new" variant="primary">
              <Plus /> New purchase order
            </LinkButton>
          )
        }
      />
      <Card>
        <LinkTabs
          items={[
            { label: "All", href: withQuery("/purchasing/orders", { q }), active: !status, count: all },
            ...PURCHASE_ORDER_STATUSES.map((s) => ({
              label: s.charAt(0).toUpperCase() + s.slice(1),
              href: withQuery("/purchasing/orders", { status: s, q }),
              active: status === s,
              count: data.statusCounts[s] ?? 0,
            })),
          ]}
        />
        <form className="flex items-center gap-2 border-b border-line px-5 py-3" role="search">
          {status && <input type="hidden" name="status" value={status} />}
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" aria-hidden />
            <Input name="q" defaultValue={q} placeholder="Search number or supplier…" className="pl-9" aria-label="Search purchase orders" />
          </div>
        </form>
        {data.rows.length === 0 ? (
          <EmptyState icon={<Truck />} title="No purchase orders match" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Order</TH>
                <TH>Supplier</TH>
                <TH>Ordered</TH>
                <TH>Expected</TH>
                <TH>To</TH>
                <TH>Status</TH>
                <TH numeric>Total</TH>
              </tr>
            </THead>
            <tbody>
              {data.rows.map((o) => (
                <TR key={o.id}>
                  <TD>
                    <Link href={`/purchasing/orders/${o.id}`} className="font-medium hover:text-accent-text">
                      {o.number}
                    </Link>
                    <span className="block text-[12px] text-muted">
                      {o.lineCount} line{o.lineCount === 1 ? "" : "s"}
                    </span>
                  </TD>
                  <TD className="max-w-64 truncate">{o.supplier}</TD>
                  <TD className="whitespace-nowrap text-muted">{date(o.orderDate)}</TD>
                  <TD className="whitespace-nowrap text-muted">{date(o.expectedDate)}</TD>
                  <TD className="text-muted">{o.warehouse}</TD>
                  <TD>
                    <StatusBadge status={o.status} />
                  </TD>
                  <TD numeric className="font-medium">
                    {money(o.total)}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} href={(page) => withQuery("/purchasing/orders", { status, q, page })} />
      </Card>
    </>
  );
}
