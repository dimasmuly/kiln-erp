import { ProductForm } from "@/components/product-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/server/auth/session";
import { listProducts } from "@/server/modules/inventory/queries";

export const metadata = { title: "New product" };
export const instant = false;

export default async function NewProductPage() {
  const { ctx } = await requireUser("inventory.write");
  const { categories } = await listProducts(ctx, {});
  return (
    <>
      <PageHeader crumbs={[{ label: "Products", href: "/inventory/products" }, { label: "New" }]} title="New product" description="Stock starts at zero; receive a purchase order or record a stock count to add units." />
      <ProductForm categories={categories} />
    </>
  );
}
