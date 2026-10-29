import { ActionForm } from "@/components/action-form";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { toMoneyInput } from "@/domain/money";
import { saveProductAction } from "@/server/actions/inventory";

interface Product {
  id: number;
  sku: string;
  name: string;
  category: string;
  unit: string;
  salePrice: number;
  reorderPoint: number;
  active: boolean;
}

export function ProductForm({ product, categories }: { product?: Product; categories: string[] }) {
  return (
    <ActionForm action={saveProductAction} idem={product ? undefined : crypto.randomUUID()} hidden={{ id: product?.id ?? "" }} className="max-w-3xl">
      <Card>
        <div className="grid gap-4 px-5 py-5 sm:grid-cols-2">
          <Field label="SKU" htmlFor="sku" hint="Capital letters, digits and dashes.">
            <Input id="sku" name="sku" required maxLength={32} defaultValue={product?.sku} className="uppercase" />
          </Field>
          <Field label="Name" htmlFor="name">
            <Input id="name" name="name" required maxLength={120} defaultValue={product?.name} />
          </Field>
          <Field label="Category" htmlFor="category">
            <Input id="category" name="category" required list="categories" maxLength={60} defaultValue={product?.category} />
            <datalist id="categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Unit" htmlFor="unit" hint="pcs, unit, box…">
            <Input id="unit" name="unit" required maxLength={16} defaultValue={product?.unit ?? "pcs"} />
          </Field>
          <Field label="List price (Rp)" htmlFor="salePrice">
            <Input id="salePrice" name="salePrice" type="number" min={0} step="0.01" required defaultValue={product ? toMoneyInput(product.salePrice) : ""} className="num" />
          </Field>
          <Field label="Reorder point" htmlFor="reorderPoint" hint="Flag as low stock when available units fall to this level.">
            <Input id="reorderPoint" name="reorderPoint" type="number" min={0} step={1} required defaultValue={product?.reorderPoint ?? 0} className="num" />
          </Field>
          {product && (
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="active" defaultChecked={product.active} className="accent-[var(--accent)]" />
              Active. Inactive products cannot be added to new orders.
            </label>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
          <LinkButton href={product ? `/inventory/products/${product.id}` : "/inventory/products"} variant="ghost">
            Cancel
          </LinkButton>
          <SubmitButton pendingLabel="Saving…">{product ? "Save changes" : "Create product"}</SubmitButton>
        </div>
      </Card>
    </ActionForm>
  );
}
