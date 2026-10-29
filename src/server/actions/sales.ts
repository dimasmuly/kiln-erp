"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { actionContext } from "../auth/session";
import { AppError } from "../errors";
import { once } from "../kv/idempotency";
import { releaseLease, salesOrderLease } from "../kv/locks";
import { customerCommands } from "../modules/masterdata/commands";
import {
  cancelSalesOrder,
  confirmSalesOrder,
  createSalesOrder,
  deliverSalesOrder,
  invoiceSalesOrder,
  recordPayment,
  updateSalesOrder,
} from "../modules/sales/commands";
import { formString, run, type ActionResult } from "./result";

function orderPayload(form: FormData) {
  let lines: unknown;
  try {
    lines = JSON.parse(formString(form, "lines") || "[]");
  } catch {
    throw new AppError("validation", "The order lines could not be read. Reload the page and try again.");
  }
  return {
    customerId: formString(form, "partyId"),
    warehouseId: formString(form, "warehouseId"),
    orderDate: formString(form, "orderDate"),
    taxRateBp: formString(form, "taxRateBp") || undefined,
    notes: formString(form, "notes"),
    lines,
  };
}

export async function saveSalesOrderAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const id = Number(formString(form, "id")) || null;
  const result = await run(async () => {
    const ctx = await actionContext("sales.write");
    const payload = orderPayload(form);
    if (id) {
      await updateSalesOrder(ctx, id, Number(formString(form, "version")), payload);
      await releaseLease(salesOrderLease(id), ctx.actor.id);
      return { id };
    }
    return (await once(`so:create:${ctx.actor.id}`, formString(form, "_idem"), () => createSalesOrder(ctx, payload))).result;
  });
  if (!result.ok) return result;
  revalidatePath("/sales/orders");
  redirect(`/sales/orders/${result.data.id}`);
}

const TRANSITIONS = {
  confirm: { run: confirmSalesOrder, message: "Order confirmed and stock reserved." },
  cancel: { run: cancelSalesOrder, message: "Order cancelled." },
  deliver: { run: deliverSalesOrder, message: "Delivery posted: stock issued and cost of goods recorded." },
  invoice: { run: invoiceSalesOrder, message: "Invoice issued and posted to receivables." },
} as const;

export async function transitionSalesOrderAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const id = Number(formString(form, "id"));
  const op = formString(form, "op") as keyof typeof TRANSITIONS;
  const transition = TRANSITIONS[op];
  const result = await run(async () => {
    if (!transition) throw new AppError("validation", "Unknown action.");
    const ctx = await actionContext();
    await once(`so:${id}:${op}`, formString(form, "_idem"), async () => {
      await transition.run(ctx, id);
      return null;
    });
  });
  if (!result.ok) return result;
  return { ok: true, data: undefined, message: transition.message };
}

export async function recordPaymentAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const invoiceId = Number(formString(form, "invoiceId"));
  const result = await run(async () => {
    const ctx = await actionContext("sales.payment");
    const { result } = await once(`payment:${invoiceId}`, formString(form, "_idem"), () =>
      recordPayment(ctx, invoiceId, {
        amount: formString(form, "amount"),
        paidOn: formString(form, "paidOn"),
        method: formString(form, "method"),
        reference: formString(form, "reference"),
      }),
    );
    return result;
  });
  if (!result.ok) return result;
  return { ok: true, data: undefined, message: result.data.fullyPaid ? "Payment recorded. The invoice is now paid in full." : "Partial payment recorded." };
}

export async function saveCustomerAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const id = Number(formString(form, "id")) || null;
  const result = await run(async () => {
    const ctx = await actionContext("masterdata.write");
    const payload = Object.fromEntries(["code", "name", "email", "phone", "city", "taxId", "paymentTermsDays"].map((k) => [k, formString(form, k)]));
    if (id) {
      await customerCommands.update(ctx, id, payload);
      return { id };
    }
    return (await once(`customer:create:${ctx.actor.id}`, formString(form, "_idem"), () => customerCommands.create(ctx, payload))).result;
  });
  if (!result.ok) return result;
  revalidatePath("/sales/customers");
  redirect("/sales/customers");
}
