import { OrderEditor } from "@/components/order-editor";
import { PageHeader } from "@/components/ui/page-header";
import { DEFAULT_TAX_RATE_BP } from "@/domain/orders";
import { savePurchaseOrderAction } from "@/server/actions/purchasing";
import { requireUser } from "@/server/auth/session";
import { purchaseFormOptions } from "@/server/modules/purchasing/queries";
import { addDays } from "@/server/modules/shared";

export const metadata = { title: "New purchase order" };
export const instant = false;

export default async function NewPurchaseOrderPage() {
  const { ctx } = await requireUser("purchasing.write");
  const options = await purchaseFormOptions(ctx);
  return (
    <>
      <PageHeader crumbs={[{ label: "Purchase orders", href: "/purchasing/orders" }, { label: "New" }]} title="New purchase order" description="Saved as a draft until you send it to the supplier." />
      <OrderEditor
        kind="purchase"
        action={savePurchaseOrderAction}
        idem={crypto.randomUUID()}
        options={options}
        cancelHref="/purchasing/orders"
        initial={{ partyId: "", warehouseId: options.warehouses[0]?.id ?? 0, orderDate: ctx.today, expectedDate: addDays(ctx.today, 7), taxRateBp: DEFAULT_TAX_RATE_BP, notes: "", lines: [] }}
      />
    </>
  );
}
