import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { DEFAULT_TAX_RATE_BP, MAX_LINES, priceOrder } from "../../../domain/orders";
import { goodsReceipt, supplierPayment } from "../../../domain/posting";
import { assertPurchaseTransition } from "../../../domain/workflow";
import { authorize, type Ctx } from "../../context";
import { db, type Tx } from "../../db/client";
import { products, purchaseOrderLines, purchaseOrders, suppliers, warehouses } from "../../db/schema";
import { AppError, notFound } from "../../errors";
import { CACHE_KEYS, invalidate } from "../../kv/cache";
import { parseInput, zDate, zId, zMoney, zOptionalText } from "../../validation";
import { lockProducts, receiveStock } from "../inventory/commands";
import { audit, nextDocumentNumber, postJournal } from "../shared";

const orderInput = z
  .object({
    supplierId: zId,
    warehouseId: zId,
    orderDate: zDate,
    expectedDate: zDate.optional().or(z.literal("").transform(() => undefined)),
    taxRateBp: z.coerce.number().int().min(0).max(10_000).default(DEFAULT_TAX_RATE_BP),
    notes: zOptionalText(1000),
    lines: z
      .array(z.object({ productId: zId, qty: z.coerce.number().int(), unitCost: zMoney }))
      .min(1, "add at least one line")
      .max(MAX_LINES),
  })
  .refine((o) => !o.expectedDate || o.expectedDate >= o.orderDate, {
    message: "expected date cannot be before the order date",
    path: ["expectedDate"],
  });

type OrderInput = z.output<typeof orderInput>;

function price(data: OrderInput) {
  return priceOrder(
    data.lines.map((l) => ({ productId: l.productId, qty: l.qty, unitAmount: l.unitCost })),
    data.taxRateBp,
  );
}

async function validateReferences(tx: Tx, data: OrderInput): Promise<void> {
  const [supplier] = await tx.select({ id: suppliers.id }).from(suppliers).where(eq(suppliers.id, data.supplierId));
  if (!supplier) throw notFound("Supplier");
  const [warehouse] = await tx.select({ id: warehouses.id }).from(warehouses).where(eq(warehouses.id, data.warehouseId));
  if (!warehouse) throw notFound("Warehouse");
  const ids = data.lines.map((l) => l.productId);
  const found = await tx
    .select({ id: products.id })
    .from(products)
    .where(and(inArray(products.id, ids), eq(products.active, true)));
  if (found.length !== new Set(ids).size) throw new AppError("validation", "One of the products is unknown or inactive.");
}

async function writeLines(tx: Tx, orderId: number, totals: ReturnType<typeof price>): Promise<void> {
  await tx.insert(purchaseOrderLines).values(
    totals.lines.map((l, position) => ({
      orderId,
      position,
      productId: l.productId,
      qty: l.qty,
      unitCost: l.unitAmount,
      lineTotal: l.lineTotal,
    })),
  );
}

async function lockOrder(tx: Tx, id: number) {
  const [order] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).for("update");
  if (!order) throw notFound("Purchase order");
  const lines = await tx
    .select()
    .from(purchaseOrderLines)
    .where(eq(purchaseOrderLines.orderId, id))
    .orderBy(purchaseOrderLines.productId);
  return { order, lines };
}

function header(data: OrderInput, totals: ReturnType<typeof price>) {
  return {
    supplierId: data.supplierId,
    warehouseId: data.warehouseId,
    orderDate: data.orderDate,
    expectedDate: data.expectedDate ?? null,
    taxRateBp: data.taxRateBp,
    subtotal: totals.subtotal,
    tax: totals.tax,
    total: totals.total,
    notes: data.notes,
  };
}

export async function createPurchaseOrder(ctx: Ctx, input: unknown): Promise<{ id: number; number: string }> {
  authorize(ctx, "purchasing.write");
  const data = parseInput(orderInput, input);
  const totals = price(data);
  return db.transaction(async (tx) => {
    await validateReferences(tx, data);
    const number = await nextDocumentNumber(tx, "PO", data.orderDate);
    const [order] = await tx
      .insert(purchaseOrders)
      .values({ number, ...header(data, totals), createdBy: ctx.actor.id, createdAt: ctx.now })
      .returning({ id: purchaseOrders.id });
    await writeLines(tx, order.id, totals);
    await audit(tx, ctx, { action: "create", entity: "purchase_order", entityId: order.id, summary: `Created ${number}` });
    return { id: order.id, number };
  });
}

export async function updatePurchaseOrder(ctx: Ctx, id: number, expectedVersion: number, input: unknown): Promise<void> {
  authorize(ctx, "purchasing.write");
  const data = parseInput(orderInput, input);
  const totals = price(data);
  await db.transaction(async (tx) => {
    const { order } = await lockOrder(tx, id);
    if (order.status !== "draft") throw new AppError("conflict", `${order.number} is ${order.status}; only drafts can be edited.`);
    if (order.version !== expectedVersion) {
      throw new AppError("conflict", `${order.number} was changed by someone else while you were editing. Reload to see their changes.`);
    }
    await validateReferences(tx, data);
    await tx
      .update(purchaseOrders)
      .set({ ...header(data, totals), version: order.version + 1 })
      .where(eq(purchaseOrders.id, id));
    await tx.delete(purchaseOrderLines).where(eq(purchaseOrderLines.orderId, id));
    await writeLines(tx, id, totals);
    await audit(tx, ctx, { action: "update", entity: "purchase_order", entityId: id, summary: `Edited ${order.number}` });
  });
}

export async function placePurchaseOrder(ctx: Ctx, id: number): Promise<void> {
  authorize(ctx, "purchasing.write");
  await db.transaction(async (tx) => {
    const { order } = await lockOrder(tx, id);
    assertPurchaseTransition(order.number, order.status, "ordered");
    await tx.update(purchaseOrders).set({ status: "ordered", version: order.version + 1 }).where(eq(purchaseOrders.id, id));
    await audit(tx, ctx, { action: "place", entity: "purchase_order", entityId: id, summary: `Sent ${order.number} to supplier` });
  });
}

export async function cancelPurchaseOrder(ctx: Ctx, id: number): Promise<void> {
  authorize(ctx, "purchasing.write");
  await db.transaction(async (tx) => {
    const { order } = await lockOrder(tx, id);
    assertPurchaseTransition(order.number, order.status, "cancelled");
    await tx.update(purchaseOrders).set({ status: "cancelled", version: order.version + 1 }).where(eq(purchaseOrders.id, id));
    await audit(tx, ctx, { action: "cancel", entity: "purchase_order", entityId: id, summary: `Cancelled ${order.number}` });
  });
}

/** Goods arrive: stock in at the PO's unit cost, inventory and payable posted. */
export async function receivePurchaseOrder(ctx: Ctx, id: number): Promise<void> {
  authorize(ctx, "purchasing.receive");
  await db.transaction(async (tx) => {
    const { order, lines } = await lockOrder(tx, id);
    assertPurchaseTransition(order.number, order.status, "received");
    const locked = await lockProducts(tx, lines.map((l) => l.productId));
    for (const line of lines) {
      await receiveStock(tx, locked.get(line.productId)!, line.qty, line.unitCost, {
        ctx,
        warehouseId: order.warehouseId,
        reference: order.number,
        date: ctx.today,
        kind: "receipt",
      });
    }
    await postJournal(tx, ctx, { date: ctx.today, memo: `Goods received for ${order.number}`, source: order.number, lines: goodsReceipt(order) });
    await tx
      .update(purchaseOrders)
      .set({ status: "received", receivedOn: ctx.today, version: order.version + 1 })
      .where(eq(purchaseOrders.id, id));
    await audit(tx, ctx, { action: "receive", entity: "purchase_order", entityId: id, summary: `Received goods for ${order.number}` });
  });
  await invalidate(CACHE_KEYS.dashboard);
}

export async function payPurchaseOrder(ctx: Ctx, id: number): Promise<void> {
  authorize(ctx, "purchasing.payment");
  await db.transaction(async (tx) => {
    const { order } = await lockOrder(tx, id);
    assertPurchaseTransition(order.number, order.status, "paid");
    await postJournal(tx, ctx, { date: ctx.today, memo: `Payment to supplier for ${order.number}`, source: order.number, lines: supplierPayment(order.total) });
    await tx
      .update(purchaseOrders)
      .set({ status: "paid", paidOn: ctx.today, version: order.version + 1 })
      .where(eq(purchaseOrders.id, id));
    await audit(tx, ctx, { action: "pay", entity: "purchase_order", entityId: id, summary: `Paid supplier for ${order.number}` });
  });
  await invalidate(CACHE_KEYS.dashboard);
}
