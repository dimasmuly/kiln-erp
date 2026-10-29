import { AlertTriangle, ArrowRight, CheckCircle2, Database, PackageOpen, Truck, Zap } from "lucide-react";
import Link from "next/link";

import { RevenueChart } from "@/components/revenue-chart";
import { StatTile } from "@/components/stat-tile";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { date, dateTime, money, moneyCompact, percent, qty, relative } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { can } from "@/server/auth/rbac";
import { getDashboard, recentActivity } from "@/server/modules/dashboard/queries";

export const metadata = { title: "Dashboard" };
export const instant = false;

const ENTITY_HREF: Record<string, string> = {
  sales_order: "/sales/orders/",
  purchase_order: "/purchasing/orders/",
  product: "/inventory/products/",
};

export default async function DashboardPage() {
  const { user, ctx } = await requireUser("inventory.read");
  const [dashboard, activity] = await Promise.all([getDashboard(ctx), recentActivity(ctx)]);
  const d = dashboard.value;
  const margin = d.revenueMtd ? d.grossProfitMtd / d.revenueMtd : 0;
  const revenueDelta = d.revenuePrevMtd ? (d.revenueMtd - d.revenuePrevMtd) / d.revenuePrevMtd : NaN;
  const reconciled = d.inventoryValue === d.glInventory;
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Jakarta" }).format(ctx.now));
  const greeting = hour < 11 ? "Good morning" : hour < 15 ? "Good afternoon" : "Good evening";
  const age = ctx.now.getTime() - dashboard.computedAt;

  const pipeline = [
    { label: "Draft sales orders", hint: "Waiting for confirmation", n: d.pipeline.drafts, href: "/sales/orders?status=draft", icon: PackageOpen, show: can(user.role, "sales.read") },
    { label: "Ready to deliver", hint: "Confirmed, stock reserved", n: d.pipeline.toDeliver, href: "/sales/orders?status=confirmed", icon: Truck, show: can(user.role, "sales.read") },
    { label: "Ready to invoice", hint: "Delivered, not yet billed", n: d.pipeline.toInvoice, href: "/sales/orders?status=delivered", icon: Zap, show: can(user.role, "sales.read") },
    { label: "Inbound purchase orders", hint: "Ordered, awaiting goods", n: d.pipeline.inbound, href: "/purchasing/orders?status=ordered", icon: Truck, show: can(user.role, "purchasing.read") },
  ].filter((p) => p.show);

  return (
    <>
      <PageHeader
        title={`${greeting}, ${user.name.split(" ")[0]}`}
        description={`Company performance as of ${date(d.asOf)}.`}
        actions={
          <Badge tone={dashboard.source === "emberkv" ? "accent" : "neutral"} className="py-1">
            {dashboard.source === "emberkv" ? <Zap className="size-3.5" aria-hidden /> : <Database className="size-3.5" aria-hidden />}
            {dashboard.source === "emberkv" ? `Served from EmberKV cache · computed ${relative(age)}` : "Computed from PostgreSQL just now"}
          </Badge>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Revenue, month to date" value={moneyCompact(d.revenueMtd)} delta={{ ratio: revenueDelta, period: "same period last month" }} />
        <StatTile label="Gross profit, month to date" value={moneyCompact(d.grossProfitMtd)} footer={<span>{percent(margin)} gross margin</span>} />
        <StatTile
          label="Receivables outstanding"
          value={moneyCompact(d.receivables)}
          href="/sales/invoices?filter=overdue"
          footer={
            d.overdueReceivables > 0 ? (
              <span className="inline-flex items-center gap-1 text-warn">
                <AlertTriangle className="size-3.5" aria-hidden /> {moneyCompact(d.overdueReceivables)} overdue
              </span>
            ) : (
              <span>Nothing overdue</span>
            )
          }
        />
        <StatTile label="Cash & bank" value={moneyCompact(d.cash)} footer={<span>{moneyCompact(d.payables)} owed to suppliers</span>} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Weekly invoiced revenue" description="Last 12 weeks, excluding PPN. Hover a week for gross profit." />
          <CardBody>
            <RevenueChart data={d.weekly} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Needs attention" />
          <ul className="divide-y divide-line">
            {pipeline.map((p) => (
              <li key={p.label}>
                <Link href={p.href} className="group flex items-center gap-3 px-5 py-3.5 hover:bg-surface-2">
                  <span className="grid size-9 place-items-center rounded-lg border border-line bg-surface-2 text-muted">
                    <p.icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{p.label}</span>
                    <span className="block text-[12px] text-muted">{p.hint}</span>
                  </span>
                  <span className="text-lg font-semibold">{p.n}</span>
                  <ArrowRight className="size-4 text-subtle group-hover:text-text" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          <div className="border-t border-line px-5 py-3.5">
            <p className="flex items-center gap-2 text-[13px]">
              {reconciled ? <CheckCircle2 className="size-4 text-ok" aria-hidden /> : <AlertTriangle className="size-4 text-bad" aria-hidden />}
              <span className="font-medium">{reconciled ? "Inventory reconciles with the ledger" : "Inventory does not reconcile"}</span>
            </p>
            <p className="mt-1 text-[12px] text-muted">
              Stock valuation {money(d.inventoryValue)} {reconciled ? "=" : "≠"} GL 1300 Inventory {money(d.glInventory)}
            </p>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader title="Top products" description="By invoiced revenue, last 30 days" />
          <ol className="divide-y divide-line">
            {d.topProducts.map((p, i) => (
              <li key={p.id}>
                <Link href={`/inventory/products/${p.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-surface-2">
                  <span className="num w-4 text-[12px] text-subtle">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{p.name}</span>
                    <span className="block text-[12px] text-muted">
                      {p.sku} · {qty(p.qty)} sold
                    </span>
                  </span>
                  <span className="num text-[13px] font-medium">{moneyCompact(p.revenue)}</span>
                </Link>
              </li>
            ))}
          </ol>
        </Card>

        <Card>
          <CardHeader
            title="Low stock"
            description="Available at or below reorder point"
            actions={
              <Link href="/inventory/products?filter=low" className="text-[13px] font-medium text-accent-text hover:underline">
                View all
              </Link>
            }
          />
          {d.lowStock.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted">Every product is above its reorder point.</p>
          ) : (
            <ul className="divide-y divide-line">
              {d.lowStock.map((p) => {
                const fill = Math.min(1, p.available / Math.max(1, p.reorderPoint));
                return (
                  <li key={p.id}>
                    <Link href={`/inventory/products/${p.id}`} className="block px-5 py-2.5 hover:bg-surface-2">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-[13px] font-medium">{p.name}</span>
                        <span className="num shrink-0 text-[12px] text-muted">
                          {qty(p.available)} / {qty(p.reorderPoint)}
                        </span>
                      </span>
                      <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-warn-soft" aria-hidden>
                        <span className={fill < 0.34 ? "block h-full rounded-full bg-bad" : "block h-full rounded-full bg-warn"} style={{ width: `${Math.max(fill * 100, 3)}%` }} />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-2 xl:col-span-1">
          <CardHeader title="Recent activity" />
          <ul className="divide-y divide-line">
            {activity.map((a) => {
              const href = ENTITY_HREF[a.entity] ? `${ENTITY_HREF[a.entity]}${a.entityId}` : null;
              const body = (
                <>
                  <span className="block text-[13px]">{a.summary}</span>
                  <span className="block text-[12px] text-muted">
                    {a.actor ?? "System"} · {dateTime(a.at)}
                  </span>
                </>
              );
              return (
                <li key={a.id}>
                  {href ? (
                    <Link href={href} className="block px-5 py-2.5 hover:bg-surface-2">
                      {body}
                    </Link>
                  ) : (
                    <div className="px-5 py-2.5">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </>
  );
}
