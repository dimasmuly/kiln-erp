import { Plus } from "lucide-react";
import Link from "next/link";

import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { money } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { can } from "@/server/auth/rbac";
import { listSuppliers } from "@/server/modules/masterdata/queries";

export const metadata = { title: "Suppliers" };
export const instant = false;

export default async function SuppliersPage() {
  const { user, ctx } = await requireUser("purchasing.read");
  const rows = await listSuppliers(ctx);
  const editable = can(user.role, "masterdata.write");
  return (
    <>
      <PageHeader
        title="Suppliers"
        description="Payables are goods received but not yet paid."
        actions={
          editable && (
            <LinkButton href="/purchasing/suppliers/new" variant="primary">
              <Plus /> New supplier
            </LinkButton>
          )
        }
      />
      <Card>
        <Table>
          <THead>
            <tr>
              <TH>Supplier</TH>
              <TH>City</TH>
              <TH numeric>Terms</TH>
              <TH numeric>Purchased to date</TH>
              <TH numeric>Payable</TH>
            </tr>
          </THead>
          <tbody>
            {rows.map((s) => (
              <TR key={s.id}>
                <TD>
                  {editable ? (
                    <Link href={`/purchasing/suppliers/${s.id}`} className="font-medium hover:text-accent-text">
                      {s.name}
                    </Link>
                  ) : (
                    <span className="font-medium">{s.name}</span>
                  )}
                  <span className="block text-[12px] text-muted">
                    {s.code}
                    {s.email ? ` · ${s.email}` : ""}
                  </span>
                </TD>
                <TD className="text-muted">{s.city ?? "—"}</TD>
                <TD numeric className="text-muted">
                  {s.terms}d
                </TD>
                <TD numeric>{money(s.purchased)}</TD>
                <TD numeric className="font-medium">
                  {s.payable > 0 ? money(s.payable) : "—"}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
