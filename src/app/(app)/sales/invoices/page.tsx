import { FileText } from "lucide-react";
import Link from "next/link";

import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { LinkTabs, Pagination } from "@/components/ui/nav";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { AGING_BUCKETS, type AgingBucket } from "@/domain/workflow";
import { cn } from "@/lib/cn";
import { date, money, moneyCompact } from "@/lib/format";
import { oneOf, pageNumber, withQuery } from "@/lib/params";
import { requireUser } from "@/server/auth/session";
import { listInvoices } from "@/server/modules/sales/queries";

export const metadata = { title: "Invoices" };
export const instant = false;

const FILTERS = ["open", "overdue", "paid", "all"] as const;
const BUCKET_LABEL: Record<AgingBucket, string> = { current: "Not yet due", "1-30": "1–30 days", "31-60": "31–60 days", "61-90": "61–90 days", "90+": "Over 90 days" };
// Sequential: one hue, light → dark, as lateness grows.
const BUCKET_FILL: Record<AgingBucket, string> = { current: "bg-line-strong", "1-30": "bg-[#f8c9a8]", "31-60": "bg-[#f0975e]", "61-90": "bg-[#d9480f]", "90+": "bg-[#9c2f06]" };

export default async function InvoicesPage(props: PageProps<"/sales/invoices">) {
  const { ctx } = await requireUser("sales.read");
  const params = await props.searchParams;
  const filter = oneOf(params.filter, FILTERS) ?? "open";
  const data = await listInvoices(ctx, { filter, page: pageNumber(params.page) });
  const outstanding = AGING_BUCKETS.reduce((n, b) => n + data.aging[b], 0);

  return (
    <>
      <PageHeader title="Invoices" description="Accounts receivable. Each invoice posts to receivables, revenue and PPN output when it is issued." />

      <Card className="mb-4">
        <div className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:gap-8">
          <div className="shrink-0">
            <p className="text-[13px] font-medium text-muted">Receivables outstanding</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">{money(outstanding)}</p>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-full" role="img" aria-label="Receivables by age">
              {AGING_BUCKETS.filter((b) => data.aging[b] > 0).map((b) => (
                <span key={b} className={cn("h-full first:rounded-l-full last:rounded-r-full", BUCKET_FILL[b])} style={{ width: `${(data.aging[b] / Math.max(outstanding, 1)) * 100}%` }} />
              ))}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {AGING_BUCKETS.map((b) => (
                <div key={b}>
                  <dt className="flex items-center gap-1.5 text-[12px] text-muted">
                    <span className={cn("size-2 rounded-[2px]", BUCKET_FILL[b])} aria-hidden />
                    {BUCKET_LABEL[b]}
                  </dt>
                  <dd className="num mt-0.5 text-sm font-medium">{moneyCompact(data.aging[b])}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </Card>

      <Card>
        <LinkTabs items={FILTERS.map((f) => ({ label: f.charAt(0).toUpperCase() + f.slice(1), href: withQuery("/sales/invoices", { filter: f }), active: filter === f }))} />
        {data.rows.length === 0 ? (
          <EmptyState icon={<FileText />} title={filter === "overdue" ? "Nothing is overdue" : "No invoices"} />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Invoice</TH>
                <TH>Customer</TH>
                <TH>Issued</TH>
                <TH>Due</TH>
                <TH>Status</TH>
                <TH numeric>Total</TH>
                <TH numeric>Outstanding</TH>
              </tr>
            </THead>
            <tbody>
              {data.rows.map((inv) => (
                <TR key={inv.id}>
                  <TD>
                    <Link href={`/sales/invoices/${inv.id}`} className="font-medium hover:text-accent-text">
                      {inv.number}
                    </Link>
                  </TD>
                  <TD className="max-w-64 truncate">{inv.customer}</TD>
                  <TD className="whitespace-nowrap text-muted">{date(inv.issueDate)}</TD>
                  <TD className="whitespace-nowrap text-muted">{date(inv.dueDate)}</TD>
                  <TD>{inv.bucket && inv.bucket !== "current" ? <Badge tone="bad" dot>Overdue {inv.bucket}d</Badge> : <StatusBadge status={inv.status} />}</TD>
                  <TD numeric>{money(inv.total)}</TD>
                  <TD numeric className="font-medium">
                    {inv.total - inv.amountPaid > 0 ? money(inv.total - inv.amountPaid) : "—"}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} href={(page) => withQuery("/sales/invoices", { filter, page })} />
      </Card>
    </>
  );
}
