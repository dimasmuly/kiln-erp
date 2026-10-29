import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TD, TFoot, TH, THead, TR } from "@/components/ui/table";
import { date, moneyPrecise } from "@/lib/format";
import { str } from "@/lib/params";
import { requireUser } from "@/server/auth/session";
import { trialBalance } from "@/server/modules/accounting/queries";

export const metadata = { title: "Trial balance" };
export const instant = false;

const TYPE_ORDER = ["asset", "liability", "equity", "revenue", "expense"] as const;
const TYPE_LABEL = { asset: "Assets", liability: "Liabilities", equity: "Equity", revenue: "Revenue", expense: "Expenses" };

export default async function TrialBalancePage(props: PageProps<"/accounting/trial-balance">) {
  const { ctx } = await requireUser("accounting.read");
  const params = await props.searchParams;
  const requested = str(params.asOf);
  const asOf = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) && requested <= ctx.today ? requested : ctx.today;
  const tb = await trialBalance(ctx, asOf);

  return (
    <>
      <PageHeader
        title="Trial balance"
        description={`All accounts as of ${date(asOf)}. Debits must equal credits; if they ever didn't, PostgreSQL would have rejected the transaction.`}
        meta={
          tb.balanced ? (
            <Badge tone="ok">
              <CheckCircle2 className="size-3.5" aria-hidden /> Balanced
            </Badge>
          ) : (
            <Badge tone="bad">
              <AlertTriangle className="size-3.5" aria-hidden /> Out of balance
            </Badge>
          )
        }
        actions={
          <form className="flex items-center gap-2">
            <Input type="date" name="asOf" defaultValue={asOf} max={ctx.today} aria-label="As of date" className="w-auto" />
            <Button type="submit">Update</Button>
          </form>
        }
      />
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <Table>
            <THead>
              <tr>
                <TH>Account</TH>
                <TH numeric>Debit</TH>
                <TH numeric>Credit</TH>
              </tr>
            </THead>
            {TYPE_ORDER.map((type) => (
              <tbody key={type}>
                <tr className="border-b border-line bg-surface-2/40">
                  <td colSpan={3} className="px-5 py-2 text-[12px] font-semibold tracking-wide text-subtle uppercase">
                    {TYPE_LABEL[type]}
                  </td>
                </tr>
                {tb.lines
                  .filter((l) => l.type === type)
                  .map((l) => (
                    <TR key={l.code}>
                      <TD>
                        <span className="num mr-2 text-muted">{l.code}</span>
                        {l.name}
                      </TD>
                      <TD numeric>{l.debitBalance ? moneyPrecise(l.debitBalance) : "—"}</TD>
                      <TD numeric>{l.creditBalance ? moneyPrecise(l.creditBalance) : "—"}</TD>
                    </TR>
                  ))}
              </tbody>
            ))}
            <TFoot>
              <tr>
                <TD className="text-right">Totals</TD>
                <TD numeric className="font-semibold">
                  {moneyPrecise(tb.totalDebit)}
                </TD>
                <TD numeric className="font-semibold">
                  {moneyPrecise(tb.totalCredit)}
                </TD>
              </tr>
            </TFoot>
          </Table>
        </Card>
        <Card className="self-start">
          <CardHeader title="Profit & loss to date" description="Revenue and expense accounts, all periods" />
          <dl className="num space-y-2 px-5 py-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Revenue</dt>
              <dd>{moneyPrecise(tb.revenue)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Expenses (COGS & adjustments)</dt>
              <dd>−{moneyPrecise(tb.expenses)}</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-2 text-base font-semibold">
              <dt>Net income</dt>
              <dd className={tb.netIncome >= 0 ? "text-ok" : "text-bad"}>{moneyPrecise(tb.netIncome)}</dd>
            </div>
          </dl>
        </Card>
      </div>
    </>
  );
}
