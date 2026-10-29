import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { orNotFound } from "@/components/documents";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, DescriptionList } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TD, TFoot, TH, THead, TR } from "@/components/ui/table";
import { date, dateTime, moneyPrecise } from "@/lib/format";
import { routeId } from "@/lib/params";
import { requireUser } from "@/server/auth/session";
import { getJournalEntry } from "@/server/modules/accounting/queries";

export const instant = false;

export default async function JournalEntryPage(props: PageProps<"/accounting/journal/[id]">) {
  const { ctx } = await requireUser("accounting.read");
  const id = routeId((await props.params).id);
  if (!id) notFound();
  const { entry, createdBy, lines, sourceHref } = await orNotFound(getJournalEntry(ctx, id));
  const debits = lines.reduce((n, l) => n + l.debit, 0);
  const credits = lines.reduce((n, l) => n + l.credit, 0);

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Journal", href: "/accounting/journal" }, { label: entry.number }]}
        title={entry.number}
        meta={
          <Badge tone="ok">
            <CheckCircle2 className="size-3.5" aria-hidden /> Balanced
          </Badge>
        }
        description={entry.memo}
      />
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Lines" />
          <Table>
            <THead>
              <tr>
                <TH>Account</TH>
                <TH numeric>Debit</TH>
                <TH numeric>Credit</TH>
              </tr>
            </THead>
            <tbody>
              {lines.map((l) => (
                <TR key={l.id}>
                  <TD className={l.credit > 0 ? "pl-12" : ""}>
                    <span className="num mr-2 text-muted">{l.code}</span>
                    {l.name}
                  </TD>
                  <TD numeric>{l.debit ? moneyPrecise(l.debit) : ""}</TD>
                  <TD numeric>{l.credit ? moneyPrecise(l.credit) : ""}</TD>
                </TR>
              ))}
            </tbody>
            <TFoot>
              <tr>
                <TD className="text-right text-muted">Totals</TD>
                <TD numeric>{moneyPrecise(debits)}</TD>
                <TD numeric>{moneyPrecise(credits)}</TD>
              </tr>
            </TFoot>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Details" />
          <CardBody>
            <DescriptionList
              items={[
                { label: "Entry date", value: date(entry.entryDate) },
                {
                  label: "Source document",
                  value: entry.source ? (
                    sourceHref ? (
                      <Link href={sourceHref} className="font-medium text-accent-text hover:underline">
                        {entry.source}
                      </Link>
                    ) : (
                      entry.source
                    )
                  ) : (
                    "Manual"
                  ),
                },
                { label: "Posted by", value: createdBy ?? "System" },
                { label: "Posted at", value: dateTime(entry.createdAt) },
              ]}
            />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
