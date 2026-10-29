import { Plus } from "lucide-react";
import Link from "next/link";

import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { money } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { can } from "@/server/auth/rbac";
import { listCustomers } from "@/server/modules/masterdata/queries";

export const metadata = { title: "Customers" };
export const instant = false;

export default async function CustomersPage() {
  const { user, ctx } = await requireUser("sales.read");
  const rows = await listCustomers(ctx);
  const editable = can(user.role, "masterdata.write");
  return (
    <>
      <PageHeader
        title="Customers"
        description="Outstanding balances come straight from open invoices."
        actions={
          editable && (
            <LinkButton href="/sales/customers/new" variant="primary">
              <Plus /> New customer
            </LinkButton>
          )
        }
      />
      <Card>
        <Table>
          <THead>
            <tr>
              <TH>Customer</TH>
              <TH>City</TH>
              <TH numeric>Terms</TH>
              <TH numeric>Revenue to date</TH>
              <TH numeric>Outstanding</TH>
              <TH numeric>Overdue</TH>
            </tr>
          </THead>
          <tbody>
            {rows.map((c) => (
              <TR key={c.id}>
                <TD>
                  {editable ? (
                    <Link href={`/sales/customers/${c.id}`} className="font-medium hover:text-accent-text">
                      {c.name}
                    </Link>
                  ) : (
                    <span className="font-medium">{c.name}</span>
                  )}
                  <span className="block text-[12px] text-muted">
                    {c.code}
                    {c.email ? ` · ${c.email}` : ""}
                  </span>
                </TD>
                <TD className="text-muted">{c.city ?? "—"}</TD>
                <TD numeric className="text-muted">
                  {c.terms}d
                </TD>
                <TD numeric>{money(c.revenue)}</TD>
                <TD numeric>{c.outstanding > 0 ? money(c.outstanding) : "—"}</TD>
                <TD numeric className={c.overdue > 0 ? "font-medium text-bad" : "text-muted"}>
                  {c.overdue > 0 ? money(c.overdue) : "—"}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
