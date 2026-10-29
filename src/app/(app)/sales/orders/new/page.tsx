import { OrderEditor } from "@/components/order-editor";
import { PageHeader } from "@/components/ui/page-header";
import { DEFAULT_TAX_RATE_BP } from "@/domain/orders";
import { saveSalesOrderAction } from "@/server/actions/sales";
import { requireUser } from "@/server/auth/session";
import { salesFormOptions } from "@/server/modules/sales/queries";

export const metadata = { title: "New sales order" };
export const instant = false;

export default async function NewSalesOrderPage() {
  const { ctx } = await requireUser("sales.write");
  const options = await salesFormOptions(ctx);
  return (
    <>
      <PageHeader crumbs={[{ label: "Sales orders", href: "/sales/orders" }, { label: "New" }]} title="New sales order" description="Saved as a draft. Nothing is reserved or posted until you confirm it." />
      <OrderEditor
        kind="sales"
        action={saveSalesOrderAction}
        idem={crypto.randomUUID()}
        options={options}
        cancelHref="/sales/orders"
        initial={{ partyId: "", warehouseId: options.warehouses[0]?.id ?? 0, orderDate: ctx.today, taxRateBp: DEFAULT_TAX_RATE_BP, notes: "", lines: [] }}
      />
    </>
  );
}
