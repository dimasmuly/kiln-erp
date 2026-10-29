import { Plus, Search, ShoppingCart } from "lucide-react";
import Link from "next/link";

import { StatusBadge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Input } from "@/components/ui/form";
import { LinkTabs, Pagination } from "@/components/ui/nav";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { SALES_ORDER_STATUSES } from "@/domain/workflow";
import { date, money } from "@/lib/format";
import { oneOf, pageNumber, str, withQuery } from "@/lib/params";
import { requireUser } from "@/server/auth/session";
import { can } from "@/server/auth/rbac";
import { listSalesOrders } from "@/server/modules/sales/queries";

export const metadata = { title: "Sales orders" };
export const instant = false;

export default async function SalesOrdersPage(props: PageProps<"/sales/orders">) {
  const { user, ctx } = await requireUser("sales.read");
  const params = await props.searchParams;
  const status = oneOf(params.status, SALES_ORDER_STATUSES);
  const q = str(params.q);
  const data = await listSalesOrders(ctx, { status, q, page: pageNumber(params.page) });
  const all = Object.values(data.statusCounts).reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHeader
        title="Sales orders"
        description="Quotes become orders: confirm to reserve stock, deliver to post cost of goods, invoice to bill the customer."
        actions={
          can(user.role, "sales.write") && (
            <LinkButton href="/sales/orders/new" variant="primary">
              <Plus /> New order
            </LinkButton>
          )
        }
      />
      <Card>
        <LinkTabs
          items={[
            { label: "All", href: withQuery("/sales/orders", { q }), active: !status, count: all },
            ...SALES_ORDER_STATUSES.map((s) => ({
              label: s.charAt(0).toUpperCase() + s.slice(1),
              href: withQuery("/sales/orders", { status: s, q }),
              active: status === s,
              count: data.statusCounts[s] ?? 0,
            })),
          ]}
        />
        <form className="flex items-center gap-2 border-b border-line px-5 py-3" role="search">
          {status && <input type="hidden" name="status" value={status} />}
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" aria-hidden />
            <Input name="q" defaultValue={q} placeholder="Search number or customer…" className="pl-9" aria-label="Search orders" />
          </div>
        </form>
        {data.rows.length === 0 ? (
          <EmptyState icon={<ShoppingCart />} title="No orders match" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Order</TH>
                <TH>Customer</TH>
                <TH>Date</TH>
                <TH>From</TH>
                <TH>Status</TH>
                <TH numeric>Total</TH>
              </tr>
            </THead>
            <tbody>
              {data.rows.map((o) => (
                <TR key={o.id}>
                  <TD>
                    <Link href={`/sales/orders/${o.id}`} className="font-medium hover:text-accent-text">
                      {o.number}
                    </Link>
                    <span className="block text-[12px] text-muted">
                      {o.lineCount} line{o.lineCount === 1 ? "" : "s"}
                    </span>
                  </TD>
                  <TD className="max-w-64 truncate">{o.customer}</TD>
                  <TD className="whitespace-nowrap text-muted">{date(o.orderDate)}</TD>
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
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} href={(page) => withQuery("/sales/orders", { status, q, page })} />
      </Card>
    </>
  );
}
