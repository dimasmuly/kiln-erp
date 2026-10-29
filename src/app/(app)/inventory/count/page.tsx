import { PageHeader } from "@/components/ui/page-header";
import { routeId } from "@/lib/params";
import { requireUser } from "@/server/auth/session";
import { adjustmentOptions } from "@/server/modules/inventory/queries";

import { StockCountForm } from "./stock-count-form";

export const metadata = { title: "Stock count" };
export const instant = false;

export default async function StockCountPage(props: PageProps<"/inventory/count">) {
  const { ctx } = await requireUser("inventory.write");
  const params = await props.searchParams;
  const options = await adjustmentOptions(ctx);
  const preselected = typeof params.product === "string" ? routeId(params.product) : null;
  return (
    <>
      <PageHeader
        crumbs={[{ label: "Stock movements", href: "/inventory/movements" }, { label: "Stock count" }]}
        title="Record a stock count"
        description="Enter what is physically on the shelf. The difference from the books is posted as an adjustment, at average cost, to both the stock ledger and the general ledger."
      />
      <StockCountForm options={options} idem={crypto.randomUUID()} initialProductId={preselected} />
    </>
  );
}
