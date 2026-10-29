"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { actionContext } from "../auth/session";
import { AppError } from "../errors";
import { once } from "../kv/idempotency";
import { purchaseOrderLease, releaseLease } from "../kv/locks";
import { supplierCommands } from "../modules/masterdata/commands";
import {
  cancelPurchaseOrder,
  createPurchaseOrder,
  payPurchaseOrder,
  placePurchaseOrder,
  receivePurchaseOrder,
  updatePurchaseOrder,
} from "../modules/purchasing/commands";
import { formString, run, type ActionResult } from "./result";

function orderPayload(form: FormData) {
  let lines: unknown;
  try {
    lines = JSON.parse(formString(form, "lines") || "[]");
  } catch {
    throw new AppError("validation", "The order lines could not be read. Reload the page and try again.");
  }
  return {
    supplierId: formString(form, "partyId"),
    warehouseId: formString(form, "warehouseId"),
    orderDate: formString(form, "orderDate"),
    expectedDate: formString(form, "expectedDate"),
    taxRateBp: formString(form, "taxRateBp") || undefined,
    notes: formString(form, "notes"),
    // The shared order editor calls the per-unit amount `unitPrice`.
    lines: Array.isArray(lines) ? lines.map((l: { productId: unknown; qty: unknown; unitPrice: unknown }) => ({ productId: l.productId, qty: l.qty, unitCost: l.unitPrice })) : lines,
  };
}

export async function savePurchaseOrderAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const id = Number(formString(form, "id")) || null;
  const result = await run(async () => {
    const ctx = await actionContext("purchasing.write");
    const payload = orderPayload(form);
    if (id) {
      await updatePurchaseOrder(ctx, id, Number(formString(form, "version")), payload);
      await releaseLease(purchaseOrderLease(id), ctx.actor.id);
      return { id };
    }
    return (await once(`po:create:${ctx.actor.id}`, formString(form, "_idem"), () => createPurchaseOrder(ctx, payload))).result;
  });
  if (!result.ok) return result;
  revalidatePath("/purchasing/orders");
  redirect(`/purchasing/orders/${result.data.id}`);
}

const TRANSITIONS = {
  place: { run: placePurchaseOrder, message: "Purchase order sent to the supplier." },
  cancel: { run: cancelPurchaseOrder, message: "Purchase order cancelled." },
  receive: { run: receivePurchaseOrder, message: "Goods received: stock and payable posted." },
  pay: { run: payPurchaseOrder, message: "Supplier payment posted." },
} as const;

export async function transitionPurchaseOrderAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const id = Number(formString(form, "id"));
  const op = formString(form, "op") as keyof typeof TRANSITIONS;
  const transition = TRANSITIONS[op];
  const result = await run(async () => {
    if (!transition) throw new AppError("validation", "Unknown action.");
    const ctx = await actionContext();
    await once(`po:${id}:${op}`, formString(form, "_idem"), async () => {
      await transition.run(ctx, id);
      return null;
    });
  });
  if (!result.ok) return result;
  return { ok: true, data: undefined, message: transition.message };
}

export async function saveSupplierAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const id = Number(formString(form, "id")) || null;
  const result = await run(async () => {
    const ctx = await actionContext("masterdata.write");
    const payload = Object.fromEntries(["code", "name", "email", "phone", "city", "taxId", "paymentTermsDays"].map((k) => [k, formString(form, k)]));
    if (id) {
      await supplierCommands.update(ctx, id, payload);
      return { id };
    }
    return (await once(`supplier:create:${ctx.actor.id}`, formString(form, "_idem"), () => supplierCommands.create(ctx, payload))).result;
  });
  if (!result.ok) return result;
  revalidatePath("/purchasing/suppliers");
  redirect("/purchasing/suppliers");
}
