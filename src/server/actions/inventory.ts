"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { actionContext } from "../auth/session";
import { once } from "../kv/idempotency";
import { adjustStock, createProduct, updateProduct } from "../modules/inventory/commands";
import { formString, run, type ActionResult } from "./result";

export async function saveProductAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const id = Number(formString(form, "id")) || null;
  const result = await run(async () => {
    const ctx = await actionContext("inventory.write");
    const payload = {
      sku: formString(form, "sku"),
      name: formString(form, "name"),
      category: formString(form, "category"),
      unit: formString(form, "unit"),
      salePrice: formString(form, "salePrice"),
      reorderPoint: formString(form, "reorderPoint"),
    };
    if (id) {
      await updateProduct(ctx, id, { ...payload, active: form.get("active") === "on" });
      return { id };
    }
    return (await once(`product:create:${ctx.actor.id}`, formString(form, "_idem"), () => createProduct(ctx, payload))).result;
  });
  if (!result.ok) return result;
  revalidatePath("/inventory/products");
  redirect(`/inventory/products/${result.data.id}`);
}

export async function adjustStockAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const result = await run(async () => {
    const ctx = await actionContext("inventory.write");
    const { result } = await once(`adjust:${ctx.actor.id}`, formString(form, "_idem"), () =>
      adjustStock(ctx, {
        productId: formString(form, "productId"),
        warehouseId: formString(form, "warehouseId"),
        countedQty: formString(form, "countedQty"),
        note: formString(form, "note"),
      }),
    );
    return result;
  });
  if (!result.ok) return result;
  revalidatePath("/inventory/movements");
  redirect(`/inventory/movements?posted=${encodeURIComponent(result.data.reference)}`);
}
