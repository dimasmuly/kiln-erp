import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { DEFAULT_TAX_RATE_BP, MAX_LINES, priceOrder } from "../../../domain/orders";
import { customerPayment, delivery, salesInvoice } from "../../../domain/posting";
import { assertSalesTransition } from "../../../domain/workflow";
import { authorize, type Ctx } from "../../context";
import { db, type Tx } from "../../db/client";
import { customers, invoices, payments, products, salesOrderLines, salesOrders, stockLevels, warehouses } from "../../db/schema";
import { AppError, notFound } from "../../errors";
import { CACHE_KEYS, invalidate } from "../../kv/cache";
import { parseInput, zDate, zId, zMoney, zOptionalText } from "../../validation";
import { issueStock, lockProducts, releaseStock, reserveStock } from "../inventory/commands";
import { addDays, audit, nextDocumentNumber, postJournal } from "../shared";

const orderInput = z.object({
  customerId: zId,
  warehouseId: zId,
  orderDate: zDate,
  taxRateBp: z.coerce.number().int().min(0).max(10_000).default(DEFAULT_TAX_RATE_BP),
  notes: zOptionalText(1000),
  lines: z
    .array(z.object({ productId: zId, qty: z.coerce.number().int(), unitPrice: zMoney }))
    .min(1, "add at least one line")
    .max(MAX_LINES),
});

type OrderInput = z.output<typeof orderInput>;

async function validateReferences(tx: Tx, data: OrderInput): Promise<void> {
  const [customer] = await tx.select({ id: customers.id }).from(customers).where(eq(customers.id, data.customerId));
  if (!customer) throw notFound("Customer");
  const [warehouse] = await tx.select({ id: warehouses.id }).from(warehouses).where(eq(warehouses.id, data.warehouseId));
  if (!warehouse) throw notFound("Warehouse");
  const ids = data.lines.map((l) => l.productId);
  const found = await tx
    .select({ id: products.id })
    .from(products)
    .where(and(inArray(products.id, ids), eq(products.active, true)));
  if (found.length !== new Set(ids).size) throw new AppError("validation", "One of the products is unknown or inactive.");
}

function price(data: OrderInput) {
  return priceOrder(
    data.lines.map((l) => ({ productId: l.productId, qty: l.qty, unitAmount: l.unitPrice })),
    data.taxRateBp,
  );
}

async function writeLines(tx: Tx, orderId: number, totals: ReturnType<typeof price>): Promise<void> {
  await tx.insert(salesOrderLines).values(
    totals.lines.map((l, position) => ({
      orderId,
      position,
      productId: l.productId,
      qty: l.qty,
      unitPrice: l.unitAmount,
      lineTotal: l.lineTotal,
    })),
  );
}

/** Locks the order row for the rest of the transaction; every state change starts here. */
async function lockOrder(tx: Tx, id: number) {
  const [order] = await tx.select().from(salesOrders).where(eq(salesOrders.id, id)).for("update");
  if (!order) throw notFound("Sales order");
  const lines = await tx.select().from(salesOrderLines).where(eq(salesOrderLines.orderId, id)).orderBy(salesOrderLines.productId);
  return { order, lines };
}

export async function createSalesOrder(ctx: Ctx, input: unknown): Promise<{ id: number; number: string }> {
  authorize(ctx, "sales.write");
  const data = parseInput(orderInput, input);
  const totals = price(data);
  return db.transaction(async (tx) => {
    await validateReferences(tx, data);
    const number = await nextDocumentNumber(tx, "SO", data.orderDate);
    const [order] = await tx
      .insert(salesOrders)
      .values({
        number,
        customerId: data.customerId,
        warehouseId: data.warehouseId,
        orderDate: data.orderDate,
        taxRateBp: data.taxRateBp,
        subtotal: totals.subtotal,
        tax: totals.tax,
        total: totals.total,
        notes: data.notes,
        createdBy: ctx.actor.id,
        createdAt: ctx.now,
      })
      .returning({ id: salesOrders.id });
    await writeLines(tx, order.id, totals);
    await audit(tx, ctx, { action: "create", entity: "sales_order", entityId: order.id, summary: `Created ${number}` });
    return { id: order.id, number };
  });
}

/**
 * Replaces a draft's header and lines. `expectedVersion` is the version the
 * editor loaded; if anyone saved in between, the save is refused instead of
 * silently overwriting their changes.
 */
export async function updateSalesOrder(ctx: Ctx, id: number, expectedVersion: number, input: unknown): Promise<void> {
  authorize(ctx, "sales.write");
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
      .update(salesOrders)
      .set({
        customerId: data.customerId,
        warehouseId: data.warehouseId,
        orderDate: data.orderDate,
        taxRateBp: data.taxRateBp,
        subtotal: totals.subtotal,
        tax: totals.tax,
        total: totals.total,
        notes: data.notes,
        version: order.version + 1,
      })
      .where(eq(salesOrders.id, id));
    await tx.delete(salesOrderLines).where(eq(salesOrderLines.orderId, id));
    await writeLines(tx, id, totals);
    await audit(tx, ctx, { action: "update", entity: "sales_order", entityId: id, summary: `Edited ${order.number}` });
  });
}

/** Reserves stock for every line, or nothing at all. */
export async function confirmSalesOrder(ctx: Ctx, id: number): Promise<void> {
  authorize(ctx, "sales.write");
  await db.transaction(async (tx) => {
    const { order, lines } = await lockOrder(tx, id);
    assertSalesTransition(order.number, order.status, "confirmed");
    // `lines` is sorted by product id: concurrent confirmations lock stock rows in the same order.
    for (const line of lines) {
      if (!(await reserveStock(tx, line.productId, order.warehouseId, line.qty))) {
        const [p] = await tx.select({ sku: products.sku }).from(products).where(eq(products.id, line.productId));
        const [level] = await tx
          .select({ onHand: stockLevels.onHand, reserved: stockLevels.reserved })
          .from(stockLevels)
          .where(and(eq(stockLevels.productId, line.productId), eq(stockLevels.warehouseId, order.warehouseId)));
        const free = level ? level.onHand - level.reserved : 0;
        throw new AppError("insufficient_stock", `Not enough ${p?.sku ?? "stock"}: ${line.qty} ordered, ${free} available in this warehouse.`);
      }
    }
    await tx
      .update(salesOrders)
      .set({ status: "confirmed", confirmedAt: ctx.now, version: order.version + 1 })
      .where(eq(salesOrders.id, id));
    await audit(tx, ctx, { action: "confirm", entity: "sales_order", entityId: id, summary: `Confirmed ${order.number}; stock reserved` });
  });
}

export async function cancelSalesOrder(ctx: Ctx, id: number): Promise<void> {
  authorize(ctx, "sales.write");
  await db.transaction(async (tx) => {
    const { order, lines } = await lockOrder(tx, id);
    assertSalesTransition(order.number, order.status, "cancelled");
    if (order.status === "confirmed") {
      for (const line of lines) await releaseStock(tx, line.productId, order.warehouseId, line.qty);
    }
    await tx.update(salesOrders).set({ status: "cancelled", version: order.version + 1 }).where(eq(salesOrders.id, id));
    await audit(tx, ctx, { action: "cancel", entity: "sales_order", entityId: id, summary: `Cancelled ${order.number}` });
  });
}

/** Ships the reserved goods: stock out at weighted-average cost, COGS posted. */
export async function deliverSalesOrder(ctx: Ctx, id: number): Promise<void> {
  authorize(ctx, "sales.deliver");
  await db.transaction(async (tx) => {
    const { order, lines } = await lockOrder(tx, id);
    assertSalesTransition(order.number, order.status, "delivered");
    const locked = await lockProducts(tx, lines.map((l) => l.productId));
    let cogs = 0;
    for (const line of lines) {
      const cost = await issueStock(tx, locked.get(line.productId)!, line.qty, {
        ctx,
        warehouseId: order.warehouseId,
        reference: order.number,
        date: ctx.today,
        kind: "shipment",
        fromReserved: true,
      });
      await tx.update(salesOrderLines).set({ cost }).where(eq(salesOrderLines.id, line.id));
      cogs += cost;
    }
    if (cogs > 0) {
      await postJournal(tx, ctx, { date: ctx.today, memo: `Goods delivered for ${order.number}`, source: order.number, lines: delivery(cogs) });
    }
    await tx
      .update(salesOrders)
      .set({ status: "delivered", deliveredAt: ctx.now, costOfGoods: cogs, version: order.version + 1 })
      .where(eq(salesOrders.id, id));
    await audit(tx, ctx, { action: "deliver", entity: "sales_order", entityId: id, summary: `Delivered ${order.number}` });
  });
  await invalidate(CACHE_KEYS.dashboard);
}

export async function invoiceSalesOrder(ctx: Ctx, id: number): Promise<{ invoiceId: number; number: string }> {
  authorize(ctx, "sales.invoice");
  const result = await db.transaction(async (tx) => {
    const { order } = await lockOrder(tx, id);
    assertSalesTransition(order.number, order.status, "invoiced");
    const [customer] = await tx
      .select({ terms: customers.paymentTermsDays })
      .from(customers)
      .where(eq(customers.id, order.customerId));
    const number = await nextDocumentNumber(tx, "INV", ctx.today);
    const [invoice] = await tx
      .insert(invoices)
      .values({
        number,
        salesOrderId: order.id,
        customerId: order.customerId,
        issueDate: ctx.today,
        dueDate: addDays(ctx.today, customer.terms),
        subtotal: order.subtotal,
        tax: order.tax,
        total: order.total,
        createdAt: ctx.now,
      })
      .returning({ id: invoices.id });
    await postJournal(tx, ctx, { date: ctx.today, memo: `Invoice ${number} for ${order.number}`, source: number, lines: salesInvoice(order) });
    await tx.update(salesOrders).set({ status: "invoiced", version: order.version + 1 }).where(eq(salesOrders.id, id));
    await audit(tx, ctx, { action: "invoice", entity: "sales_order", entityId: id, summary: `Issued ${number} for ${order.number}` });
    return { invoiceId: invoice.id, number };
  });
  await invalidate(CACHE_KEYS.dashboard);
  return result;
}

const paymentInput = z.object({
  amount: zMoney.refine((v) => v > 0, "must be greater than zero"),
  paidOn: zDate,
  method: z.enum(["bank_transfer", "cash", "giro", "virtual_account"]),
  reference: zOptionalText(80),
});

export const PAYMENT_METHODS = paymentInput.shape.method.options;

/** Records a (possibly partial) customer payment against an invoice. */
export async function recordPayment(ctx: Ctx, invoiceId: number, input: unknown): Promise<{ fullyPaid: boolean }> {
  authorize(ctx, "sales.payment");
  const data = parseInput(paymentInput, input);
  if (data.paidOn > ctx.today) throw new AppError("validation", "Payments cannot be dated in the future.");
  const result = await db.transaction(async (tx) => {
    const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId)).for("update");
    if (!invoice) throw notFound("Invoice");
    if (invoice.status === "paid") throw new AppError("conflict", `${invoice.number} is already fully paid.`);
    const outstanding = invoice.total - invoice.amountPaid;
    if (data.amount > outstanding) {
      throw new AppError("validation", `Amount exceeds the outstanding balance of this invoice.`);
    }
    if (data.paidOn < invoice.issueDate) throw new AppError("validation", "A payment cannot predate its invoice.");

    await tx.insert(payments).values({ invoiceId, ...data, createdBy: ctx.actor.id, createdAt: ctx.now });
    const amountPaid = invoice.amountPaid + data.amount;
    const fullyPaid = amountPaid === invoice.total;
    await tx
      .update(invoices)
      .set({ amountPaid, status: fullyPaid ? "paid" : "open" })
      .where(eq(invoices.id, invoiceId));
    await postJournal(tx, ctx, {
      date: data.paidOn,
      memo: `Payment received for ${invoice.number}${data.reference ? ` (${data.reference})` : ""}`,
      source: invoice.number,
      lines: customerPayment(data.amount),
    });
    if (fullyPaid) {
      const { order } = await lockOrder(tx, invoice.salesOrderId);
      assertSalesTransition(order.number, order.status, "paid");
      await tx.update(salesOrders).set({ status: "paid", version: order.version + 1 }).where(eq(salesOrders.id, order.id));
    }
    await audit(tx, ctx, {
      action: "payment",
      entity: "invoice",
      entityId: invoiceId,
      summary: `Recorded payment on ${invoice.number}${fullyPaid ? " (paid in full)" : ""}`,
      data: { amount: data.amount, method: data.method },
    });
    return { fullyPaid };
  });
  await invalidate(CACHE_KEYS.dashboard);
  return result;
}
