import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Pagination } from "@/components/ui/nav";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { dateTime, titleCase } from "@/lib/format";
import { pageNumber, withQuery } from "@/lib/params";
import { requireUser } from "@/server/auth/session";
import { listAudit } from "@/server/modules/admin/queries";

export const metadata = { title: "Audit log" };
export const instant = false;

export default async function AuditPage(props: PageProps<"/admin/audit">) {
  const { ctx } = await requireUser("admin.system");
  const data = await listAudit(ctx, { page: pageNumber((await props.searchParams).page) });
  return (
    <>
      <PageHeader title="Audit log" description="Who did what, written in the same transaction as the change itself, so the log can never disagree with the data." />
      <Card>
        <Table>
          <THead>
            <tr>
              <TH>When</TH>
              <TH>Who</TH>
              <TH>Action</TH>
              <TH>What happened</TH>
            </tr>
          </THead>
          <tbody>
            {data.rows.map((a) => (
              <TR key={a.id}>
                <TD className="whitespace-nowrap text-muted">{dateTime(a.at)}</TD>
                <TD className="whitespace-nowrap">{a.actor ?? "System"}</TD>
                <TD>
                  <Badge>{titleCase(a.action)}</Badge>
                </TD>
                <TD>
                  {a.summary}
                  <span className="block text-[12px] text-muted">
                    {titleCase(a.entity)} #{a.entityId}
                  </span>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} href={(page) => withQuery("/admin/audit", { page })} />
      </Card>
    </>
  );
}
