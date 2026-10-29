import { Package, Plus, Search } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TD, TFoot, TH, THead, TR } from "@/components/ui/table";
import { averageUnitCost } from "@/domain/inventory";
import { money, qty } from "@/lib/format";
import { str } from "@/lib/params";
import { requireUser } from "@/server/auth/session";
import { can } from "@/server/auth/rbac";
import { listProducts } from "@/server/modules/inventory/queries";

export const metadata = { title: "Products" };
export const instant = false;

export default async function ProductsPage(props: PageProps<"/inventory/products">) {
  const { user, ctx } = await requireUser("inventory.read");
  const params = await props.searchParams;
  const q = str(params.q);
  const category = str(params.category);
  const lowStock = params.filter === "low";
  const { rows, categories } = await listProducts(ctx, { q, category, lowStock });
  const totalValue = rows.reduce((n, r) => n + r.inventoryValue, 0);

  return (
    <>
      <PageHeader
        title="Products"
        description="Stock across all warehouses, valued at weighted-average cost."
        actions={
          can(user.role, "inventory.write") && (
            <LinkButton href="/inventory/products/new" variant="primary">
              <Plus /> New product
            </LinkButton>
          )
        }
      />
      <Card>
        <form className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3" role="search">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" aria-hidden />
            <Input name="q" defaultValue={q} placeholder="Search SKU or name…" className="pl-9" aria-label="Search products" />
          </div>
          <Select name="category" defaultValue={category ?? ""} className="w-auto" aria-label="Category">
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
          <label className="flex items-center gap-2 px-2 text-[13px] text-muted">
            <input type="checkbox" name="filter" value="low" defaultChecked={lowStock} className="accent-[var(--accent)]" /> Low stock only
          </label>
          <Button type="submit" size="sm">
            Apply
          </Button>
        </form>
        {rows.length === 0 ? (
          <EmptyState icon={<Package />} title="No products match" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Product</TH>
                <TH>Category</TH>
                <TH numeric>On hand</TH>
                <TH numeric>Reserved</TH>
                <TH numeric>Available</TH>
                <TH numeric>Avg cost</TH>
                <TH numeric>Stock value</TH>
                <TH numeric>List price</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((p) => (
                <TR key={p.id}>
                  <TD>
                    <Link href={`/inventory/products/${p.id}`} className="font-medium hover:text-accent-text">
                      {p.name}
                    </Link>
                    <span className="block text-[12px] text-muted">
                      {p.sku}
                      {!p.active && " · inactive"}
                    </span>
                  </TD>
                  <TD className="whitespace-nowrap text-muted">{p.category}</TD>
                  <TD numeric>{qty(p.onHand)}</TD>
                  <TD numeric className="text-muted">
                    {p.reserved ? qty(p.reserved) : "—"}
                  </TD>
                  <TD numeric>
                    {p.low ? (
                      <Badge tone={p.available <= 0 ? "bad" : "warn"}>
                        {qty(p.available)} {p.unit}
                      </Badge>
                    ) : (
                      `${qty(p.available)} ${p.unit}`
                    )}
                  </TD>
                  <TD numeric className="text-muted">
                    {money(averageUnitCost({ onHand: p.onHand, value: p.inventoryValue }))}
                  </TD>
                  <TD numeric className="font-medium">
                    {money(p.inventoryValue)}
                  </TD>
                  <TD numeric>{money(p.salePrice)}</TD>
                </TR>
              ))}
            </tbody>
            <TFoot>
              <tr>
                <TD colSpan={6} className="text-right text-muted">
                  Total stock value ({rows.length} products)
                </TD>
                <TD numeric className="font-semibold">
                  {money(totalValue)}
                </TD>
                <TD />
              </tr>
            </TFoot>
          </Table>
        )}
      </Card>
    </>
  );
}
