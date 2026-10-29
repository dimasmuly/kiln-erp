import { notFound } from "next/navigation";

import { orNotFound } from "@/components/documents";
import { ProductForm } from "@/components/product-form";
import { PageHeader } from "@/components/ui/page-header";
import { routeId } from "@/lib/params";
import { requireUser } from "@/server/auth/session";
import { getProduct, listProducts } from "@/server/modules/inventory/queries";

export const metadata = { title: "Edit product" };
export const instant = false;

export default async function EditProductPage(props: PageProps<"/inventory/products/[id]/edit">) {
  const { ctx } = await requireUser("inventory.write");
  const id = routeId((await props.params).id);
  if (!id) notFound();
  const [{ product }, { categories }] = await Promise.all([orNotFound(getProduct(ctx, id)), listProducts(ctx, {})]);
  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Products", href: "/inventory/products" },
          { label: product.sku, href: `/inventory/products/${id}` },
          { label: "Edit" },
        ]}
        title={`Edit ${product.name}`}
        description="Cost is not editable: it follows from receipts and counts, so the ledger stays consistent."
      />
      <ProductForm product={product} categories={categories} />
    </>
  );
}
