import { notFound } from "next/navigation";

import { ActionForm } from "@/components/action-form";
import { orNotFound } from "@/components/documents";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { toMoneyInput } from "@/domain/money";
import { date, money, qty, titleCase } from "@/lib/format";
import { routeId } from "@/lib/params";
import { recordPaymentAction } from "@/server/actions/sales";
import { requireUser } from "@/server/auth/session";
import { can } from "@/server/auth/rbac";
import { PAYMENT_METHODS } from "@/server/modules/sales/commands";
import { getInvoice } from "@/server/modules/sales/queries";

export const instant = false;

export default async function InvoicePage(props: PageProps<"/sales/invoices/[id]">) {
  const { user, ctx } = await requireUser("sales.read");
  const id = routeId((await props.params).id);
  if (!id) notFound();
  const { invoice, customer, orderNumber, payments, lines, bucket } = await orNotFound(getInvoice(ctx, id));
  const outstanding = invoice.total - invoice.amountPaid;

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Invoices", href: "/sales/invoices" }, { label: invoice.number }]}
        title={invoice.number}
        meta={bucket && bucket !== "current" ? <Badge tone="bad" dot>Overdue {bucket} days</Badge> : <StatusBadge status={invoice.status} />}
        actions={<LinkButton href={`/sales/orders/${invoice.salesOrderId}`}>Order {orderNumber}</LinkButton>}
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <div className="flex flex-col justify-between gap-6 border-b border-line px-6 py-6 sm:flex-row">
            <div>
              <p className="text-[12px] font-semibold tracking-wider text-accent-text uppercase">Tax invoice</p>
              <p className="mt-1 text-lg font-semibold">PT Kiln Teknologi Distribusi</p>
              <p className="text-[13px] text-muted">Jl. Industri Raya No. 8, Bekasi · NPWP 01.000.000.0-000.000</p>
            </div>
            <dl className="num grid grid-cols-2 gap-x-6 gap-y-1 text-[13px] sm:text-right">
              <dt className="text-muted">Issued</dt>
              <dd>{date(invoice.issueDate)}</dd>
              <dt className="text-muted">Due</dt>
              <dd>{date(invoice.dueDate)}</dd>
              <dt className="text-muted">Order</dt>
              <dd>{orderNumber}</dd>
            </dl>
          </div>
          <div className="border-b border-line px-6 py-4">
            <p className="text-[12px] font-medium tracking-wide text-subtle uppercase">Bill to</p>
            <p className="mt-1 font-medium">{customer.name}</p>
            <p className="text-[13px] text-muted">
              {customer.city} · NPWP {customer.taxId ?? "—"}
            </p>
          </div>
          <Table>
            <THead>
              <tr>
                <TH>Description</TH>
                <TH numeric>Qty</TH>
                <TH numeric>Unit price</TH>
                <TH numeric>Amount</TH>
              </tr>
            </THead>
            <tbody>
              {lines.map((l) => (
                <TR key={l.sku}>
                  <TD>
                    {l.name}
                    <span className="block text-[12px] text-muted">{l.sku}</span>
                  </TD>
                  <TD numeric>
                    {qty(l.qty)} {l.unit}
                  </TD>
                  <TD numeric>{money(l.unitPrice)}</TD>
                  <TD numeric>{money(l.lineTotal)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
          <dl className="num ml-auto max-w-xs space-y-1.5 px-6 py-4 text-sm">
            {[
              ["Subtotal (DPP)", money(invoice.subtotal)],
              ["PPN", money(invoice.tax)],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between text-muted">
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
            <div className="flex justify-between border-t border-line pt-1.5 text-base font-semibold">
              <dt>Total</dt>
              <dd>{money(invoice.total)}</dd>
            </div>
            <div className="flex justify-between text-muted">
              <dt>Paid</dt>
              <dd>{money(invoice.amountPaid)}</dd>
            </div>
            <div className="flex justify-between font-semibold">
              <dt>Balance due</dt>
              <dd>{money(outstanding)}</dd>
            </div>
          </dl>
        </Card>

        <div className="space-y-4">
          {invoice.status === "open" && can(user.role, "sales.payment") && (
            <Card>
              <CardHeader title="Record payment" description="Posts Dr Cash / Cr Receivables. Partial payments are allowed." />
              <ActionForm action={recordPaymentAction} idem={crypto.randomUUID()} hidden={{ invoiceId: id }} feedback="toast" className="space-y-4 px-5 py-4">
                <Field label="Amount (Rp)" htmlFor="amount">
                  <Input id="amount" name="amount" type="number" min="0.01" step="0.01" max={toMoneyInput(outstanding)} defaultValue={toMoneyInput(outstanding)} required className="num" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Paid on" htmlFor="paidOn">
                    <Input id="paidOn" name="paidOn" type="date" defaultValue={ctx.today} min={invoice.issueDate} max={ctx.today} required />
                  </Field>
                  <Field label="Method" htmlFor="method">
                    <Select id="method" name="method" defaultValue="bank_transfer">
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {titleCase(m)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Field label="Reference" htmlFor="reference" hint="Bank transfer or giro number. Optional.">
                  <Input id="reference" name="reference" maxLength={80} />
                </Field>
                <SubmitButton className="w-full" pendingLabel="Posting…">
                  Record payment
                </SubmitButton>
              </ActionForm>
            </Card>
          )}
          <Card>
            <CardHeader title="Payments" />
            {payments.length === 0 ? (
              <p className="px-5 py-4 text-[13px] text-muted">No payments yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {payments.map((p) => (
                  <li key={p.id} className="flex justify-between gap-3 px-5 py-2.5 text-[13px]">
                    <span>
                      <span className="block font-medium">{titleCase(p.method)}</span>
                      <span className="block text-[12px] text-muted">
                        {date(p.paidOn)}
                        {p.reference ? ` · ${p.reference}` : ""}
                        {p.by ? ` · ${p.by}` : ""}
                      </span>
                    </span>
                    <span className="num font-medium">{money(p.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
