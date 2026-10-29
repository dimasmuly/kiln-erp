import { Search } from "lucide-react";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { Pagination } from "@/components/ui/nav";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { date, moneyPrecise } from "@/lib/format";
import { pageNumber, str, withQuery } from "@/lib/params";
import { requireUser } from "@/server/auth/session";
import { listJournalEntries } from "@/server/modules/accounting/queries";

export const metadata = { title: "Journal" };
export const instant = false;

export default async function JournalPage(props: PageProps<"/accounting/journal">) {
  const { ctx } = await requireUser("accounting.read");
  const params = await props.searchParams;
  const q = str(params.q);
  const data = await listJournalEntries(ctx, { q, page: pageNumber(params.page) });
  return (
    <>
      <PageHeader
        title="General journal"
        description="Every entry is posted automatically by a business event, balanced by construction and verified by PostgreSQL at commit. Entries are append-only."
      />
      <Card>
        <form className="border-b border-line px-5 py-3" role="search">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" aria-hidden />
            <Input name="q" defaultValue={q} placeholder="Search entry, document or memo…" className="pl-9" aria-label="Search journal" />
          </div>
        </form>
        <Table>
          <THead>
            <tr>
              <TH>Entry</TH>
              <TH>Date</TH>
              <TH>Memo</TH>
              <TH>Accounts</TH>
              <TH numeric>Amount</TH>
            </tr>
          </THead>
          <tbody>
            {data.rows.map((e) => (
              <TR key={e.id}>
                <TD>
                  <Link href={`/accounting/journal/${e.id}`} className="font-medium hover:text-accent-text">
                    {e.number}
                  </Link>
                  {e.source && <span className="block text-[12px] text-muted">{e.source}</span>}
                </TD>
                <TD className="whitespace-nowrap text-muted">{date(e.entryDate)}</TD>
                <TD className="max-w-md truncate">{e.memo}</TD>
                <TD className="num text-[12px] whitespace-nowrap text-muted">{e.accounts}</TD>
                <TD numeric className="font-medium">
                  {moneyPrecise(e.amount)}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} href={(page) => withQuery("/accounting/journal", { q, page })} />
      </Card>
    </>
  );
}
