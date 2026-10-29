import { MovementTable } from "@/components/movement-table";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { LinkTabs, Pagination } from "@/components/ui/nav";
import { PageHeader } from "@/components/ui/page-header";
import { oneOf, pageNumber, str, withQuery } from "@/lib/params";
import { requireUser } from "@/server/auth/session";
import { listMovements } from "@/server/modules/inventory/queries";

export const metadata = { title: "Stock movements" };
export const instant = false;

const KINDS = ["receipt", "shipment", "adjustment"] as const;

export default async function MovementsPage(props: PageProps<"/inventory/movements">) {
  const { ctx } = await requireUser("inventory.read");
  const params = await props.searchParams;
  const kind = oneOf(params.kind, KINDS);
  const posted = str(params.posted);
  const data = await listMovements(ctx, { kind, page: pageNumber(params.page) });
  return (
    <>
      <PageHeader title="Stock movements" description="Every unit in or out, with the value it moved. The sum of movements is always the quantity on hand." />
      {posted && (
        <Alert tone="ok" className="mb-4">
          Stock count {posted} posted to inventory and the ledger.
        </Alert>
      )}
      <Card>
        <LinkTabs
          items={[
            { label: "All", href: "/inventory/movements", active: !kind },
            { label: "Receipts", href: withQuery("/inventory/movements", { kind: "receipt" }), active: kind === "receipt" },
            { label: "Shipments", href: withQuery("/inventory/movements", { kind: "shipment" }), active: kind === "shipment" },
            { label: "Adjustments", href: withQuery("/inventory/movements", { kind: "adjustment" }), active: kind === "adjustment" },
          ]}
        />
        <MovementTable rows={data.rows} showProduct />
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} href={(page) => withQuery("/inventory/movements", { kind, page })} />
      </Card>
    </>
  );
}
