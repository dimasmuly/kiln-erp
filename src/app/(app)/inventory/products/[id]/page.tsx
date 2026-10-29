import { ClipboardCheck, Pencil } from "lucide-react";
import { notFound } from "next/navigation";

import { orNotFound } from "@/components/documents";
import { MovementTable } from "@/components/movement-table";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { averageUnitCost } from "@/domain/inventory";
import { money, percent, qty } from "@/lib/format";
import { routeId } from "@/lib/params";
import { requireUser } from "@/server/auth/session";
import { can } from "@/server/auth/rbac";
import { getProduct } from "@/server/modules/inventory/queries";

export const instant = false;

export default async function ProductPage(props: PageProps<"/inventory/products/[id]">) {
  const { user, ctx } = await requireUser("inventory.read");
  const id = routeId((await props.params).id);
  if (!id) notFound();
  const { product, levels, movements, onHand } = await orNotFound(getProduct(ctx, id));
  const avg = averageUnitCost({ onHand, value: product.inventoryValue });
  const markup = avg > 0 ? (product.salePrice - avg) / product.salePrice : null;

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Products", href: "/inventory/products" }, { label: product.sku }]}
        title={product.name}
        meta={!product.active && <Badge>Inactive</Badge>}
        description={`${product.sku} · ${product.category}`}
        actions={
          can(user.role, "inventory.write") && (
            <>
              <LinkButton href={`/inventory/count?product=${id}`}>
                <ClipboardCheck /> Count stock
              </LinkButton>
              <LinkButton href={`/inventory/products/${id}/edit`}>
                <Pencil /> Edit
              </LinkButton>
            </>
          )
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "On hand", value: `${qty(onHand)} ${product.unit}`, hint: `Reorder point ${qty(product.reorderPoint)}` },
          { label: "Stock value", value: money(product.inventoryValue), hint: "Weighted-average cost" },
          { label: "Average unit cost", value: money(avg), hint: `Last purchase ${money(product.lastCost)}` },
          { label: "List price", value: money(product.salePrice), hint: markup !== null ? `${percent(markup)} gross margin at list` : "No cost yet" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-line bg-surface px-5 py-4 shadow-xs">
            <p className="text-[13px] font-medium text-muted">{s.label}</p>
            <p className="mt-1.5 text-xl font-semibold tracking-tight">{s.value}</p>
            <p className="mt-1 text-[12px] text-muted">{s.hint}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title="By warehouse" />
          <ul className="divide-y divide-line">
            {levels.map((l) => {
              const available = l.onHand - l.reserved;
              return (
                <li key={l.warehouseId} className="px-5 py-3.5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-medium">
                      {l.code} <span className="font-normal text-muted">· {l.name}</span>
                    </span>
                  </div>
                  <dl className="num mt-2 grid grid-cols-3 gap-2 text-[13px]">
                    <div>
                      <dt className="text-[12px] text-muted">On hand</dt>
                      <dd className="font-medium">{qty(l.onHand)}</dd>
                    </div>
                    <div>
                      <dt className="text-[12px] text-muted">Reserved</dt>
                      <dd className="font-medium">{qty(l.reserved)}</dd>
                    </div>
                    <div>
                      <dt className="text-[12px] text-muted">Available</dt>
                      <dd className={available <= 0 ? "font-medium text-bad" : "font-medium"}>{qty(available)}</dd>
                    </div>
                  </dl>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Stock ledger" description="Latest 50 movements. Append-only: corrections are new adjustment entries." />
          <MovementTable rows={movements} />
        </Card>
      </div>
    </>
  );
}
