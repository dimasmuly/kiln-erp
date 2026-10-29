import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { averageUnitCost, issue, receive } from "../../../domain/inventory";
import type { Money } from "../../../domain/money";
import { stockAdjustment } from "../../../domain/posting";
import { authorize, type Ctx } from "../../context";
import { db, type Tx } from "../../db/client";
import { products, stockLevels, stockMovements, warehouses } from "../../db/schema";
import { AppError, notFound } from "../../errors";
import { CACHE_KEYS, invalidate } from "../../kv/cache";
import { parseInput, zId, zMoney, zOptionalText, zText } from "../../validation";
import { audit, nextDocumentNumber, postJournal } from "../shared";

/**
 * Inventory primitives used inside other modules' transactions.
 *
 * Locking protocol (prevents deadlocks): a command locks its document row
 * first, then product rows in ascending id order via `lockProducts`, and only
 * then touches `stock_levels`.
 */

export interface LockedProduct {
  id: number;
  sku: string;
  name: string;
  inventoryValue: Money;
  lastCost: Money;
  /** Units on hand across all warehouses. */
  onHand: number;
}

export async function lockProducts(tx: Tx, ids: readonly number[]): Promise<Map<number, LockedProduct>> {
  const sorted = [...new Set(ids)].sort((a, b) => a - b);
  if (sorted.length === 0) return new Map();
  const rows = await tx
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      inventoryValue: products.inventoryValue,
      lastCost: products.lastCost,
    })
    .from(products)
    .where(inArray(products.id, sorted))
    .orderBy(products.id)
    .for("update");
  const totals = await tx
    .select({ productId: stockLevels.productId, onHand: sql<number>`sum(${stockLevels.onHand})::int` })
    .from(stockLevels)
    .where(inArray(stockLevels.productId, sorted))
    .groupBy(stockLevels.productId);
  const onHandById = new Map(totals.map((t) => [t.productId, t.onHand]));
  const locked = new Map(rows.map((r) => [r.id, { ...r, onHand: onHandById.get(r.id) ?? 0 }]));
  for (const id of sorted) if (!locked.has(id)) throw notFound(`Product #${id}`);
  return locked;
}

interface MovementMeta {
  ctx: Ctx;
  warehouseId: number;
  reference: string;
  date: string;
  note?: string | null;
}

/** Adds units at `unitCost`. Mutates `product` so later lines in the same transaction see the new position. */
export async function receiveStock(
  tx: Tx,
  product: LockedProduct,
  qty: number,
  unitCost: Money,
  meta: MovementMeta & { kind: "receipt" | "adjustment" },
): Promise<Money> {
  const next = receive({ onHand: product.onHand, value: product.inventoryValue }, qty, unitCost);
  const value = next.value - product.inventoryValue;
  await tx
    .update(products)
    .set({ inventoryValue: next.value, ...(meta.kind === "receipt" ? { lastCost: unitCost } : {}) })
    .where(eq(products.id, product.id));
  await tx
    .insert(stockLevels)
    .values({ productId: product.id, warehouseId: meta.warehouseId, onHand: qty })
    .onConflictDoUpdate({
      target: [stockLevels.productId, stockLevels.warehouseId],
      set: { onHand: sql`${stockLevels.onHand} + ${qty}` },
    });
  await tx.insert(stockMovements).values({
    productId: product.id,
    warehouseId: meta.warehouseId,
    kind: meta.kind,
    qty,
    value,
    reference: meta.reference,
    note: meta.note ?? null,
    occurredOn: meta.date,
    createdBy: meta.ctx.actor.id,
    createdAt: meta.ctx.now,
  });
  product.onHand = next.onHand;
  product.inventoryValue = next.value;
  if (meta.kind === "receipt") product.lastCost = unitCost;
  return value;
}

/**
 * Removes units and returns their cost. With `fromReserved`, the units must
 * already be reserved (a confirmed sales order shipping); otherwise they
 * must be unreserved (a stock count finding fewer units).
 */
export async function issueStock(
  tx: Tx,
  product: LockedProduct,
  qty: number,
  meta: MovementMeta & { kind: "shipment" | "adjustment"; fromReserved: boolean },
): Promise<Money> {
  const { position, cost } = issue({ onHand: product.onHand, value: product.inventoryValue }, qty);
  const where = meta.fromReserved
    ? and(gte(stockLevels.reserved, qty), gte(stockLevels.onHand, qty))
    : sql`${stockLevels.onHand} - ${stockLevels.reserved} >= ${qty}`;
  const updated = await tx
    .update(stockLevels)
    .set({
      onHand: sql`${stockLevels.onHand} - ${qty}`,
      reserved: meta.fromReserved ? sql`${stockLevels.reserved} - ${qty}` : stockLevels.reserved,
    })
    .where(and(eq(stockLevels.productId, product.id), eq(stockLevels.warehouseId, meta.warehouseId), where))
    .returning({ onHand: stockLevels.onHand });
  if (updated.length === 0) {
    throw new AppError("insufficient_stock", `Not enough ${product.sku} in this warehouse.`);
  }
  await tx.update(products).set({ inventoryValue: position.value }).where(eq(products.id, product.id));
  await tx.insert(stockMovements).values({
    productId: product.id,
    warehouseId: meta.warehouseId,
    kind: meta.kind,
    qty: -qty,
    value: -cost,
    reference: meta.reference,
    note: meta.note ?? null,
    occurredOn: meta.date,
    createdBy: meta.ctx.actor.id,
    createdAt: meta.ctx.now,
  });
  product.onHand = position.onHand;
  product.inventoryValue = position.value;
  return cost;
}

/**
 * Promises units to a confirmed order. A single conditional UPDATE: the row
 * lock it takes plus the `on_hand - reserved >= qty` predicate make it
 * impossible for two concurrent confirmations to oversell.
 */
export async function reserveStock(tx: Tx, productId: number, warehouseId: number, qty: number): Promise<boolean> {
  const rows = await tx
    .update(stockLevels)
    .set({ reserved: sql`${stockLevels.reserved} + ${qty}` })
    .where(
      and(
        eq(stockLevels.productId, productId),
        eq(stockLevels.warehouseId, warehouseId),
        sql`${stockLevels.onHand} - ${stockLevels.reserved} >= ${qty}`,
      ),
    )
    .returning({ productId: stockLevels.productId });
  return rows.length === 1;
}

export async function releaseStock(tx: Tx, productId: number, warehouseId: number, qty: number): Promise<void> {
  await tx
    .update(stockLevels)
    .set({ reserved: sql`${stockLevels.reserved} - ${qty}` })
    .where(and(eq(stockLevels.productId, productId), eq(stockLevels.warehouseId, warehouseId)));
}

// --- Commands -------------------------------------------------------------------

const productInput = z.object({
  sku: zText(32)
    .min(2)
    .regex(/^[A-Z0-9-]+$/, "use capital letters, digits and dashes")
    .transform((s) => s.toUpperCase()),
  name: zText(120).min(2),
  category: zText(60).min(2),
  unit: zText(16).min(1),
  salePrice: zMoney,
  reorderPoint: z.coerce.number().int().min(0).max(1_000_000),
});

export async function createProduct(ctx: Ctx, input: unknown): Promise<{ id: number }> {
  authorize(ctx, "inventory.write");
  const data = parseInput(productInput, input);
  return db.transaction(async (tx) => {
    const [created] = await tx.insert(products).values(data).returning({ id: products.id });
    await audit(tx, ctx, { action: "create", entity: "product", entityId: created.id, summary: `Created product ${data.sku}` });
    return created;
  });
}

export async function updateProduct(ctx: Ctx, id: number, input: unknown): Promise<void> {
  authorize(ctx, "inventory.write");
  const data = parseInput(productInput.extend({ active: z.boolean() }), input);
  await db.transaction(async (tx) => {
    const updated = await tx.update(products).set(data).where(eq(products.id, id)).returning({ id: products.id });
    if (updated.length === 0) throw notFound("Product");
    await audit(tx, ctx, { action: "update", entity: "product", entityId: id, summary: `Updated product ${data.sku}` });
  });
}

const adjustmentInput = z.object({
  productId: zId,
  warehouseId: zId,
  countedQty: z.coerce.number().int().min(0).max(10_000_000),
  note: zOptionalText(300),
});

/**
 * Records a physical stock count. The difference from the book quantity
 * becomes an adjustment movement and a journal entry, so the inventory
 * sub-ledger and the GL stay reconciled.
 */
export async function adjustStock(ctx: Ctx, input: unknown): Promise<{ reference: string; delta: number }> {
  authorize(ctx, "inventory.write");
  const data = parseInput(adjustmentInput, input);
  const result = await db.transaction(async (tx) => {
    const [warehouse] = await tx.select({ id: warehouses.id }).from(warehouses).where(eq(warehouses.id, data.warehouseId));
    if (!warehouse) throw notFound("Warehouse");
    const product = (await lockProducts(tx, [data.productId])).get(data.productId)!;
    const [level] = await tx
      .select({ onHand: stockLevels.onHand, reserved: stockLevels.reserved })
      .from(stockLevels)
      .where(and(eq(stockLevels.productId, data.productId), eq(stockLevels.warehouseId, data.warehouseId)))
      .for("update");
    const book = level?.onHand ?? 0;
    const reserved = level?.reserved ?? 0;
    const delta = data.countedQty - book;
    if (delta === 0) throw new AppError("validation", "The counted quantity matches the books; nothing to adjust.");
    if (data.countedQty < reserved) {
      throw new AppError(
        "validation",
        `${reserved} units are reserved for confirmed orders. Cancel or ship those orders before counting below that.`,
      );
    }

    const reference = await nextDocumentNumber(tx, "ADJ", ctx.today);
    const meta = { ctx, warehouseId: data.warehouseId, reference, date: ctx.today, note: data.note, kind: "adjustment" as const };
    const valueDelta =
      delta > 0
        ? await receiveStock(tx, product, delta, product.onHand > 0 ? averageUnitCost({ onHand: product.onHand, value: product.inventoryValue }) : product.lastCost, meta)
        : -(await issueStock(tx, product, -delta, { ...meta, fromReserved: false }));

    if (valueDelta !== 0) {
      await postJournal(tx, ctx, {
        date: ctx.today,
        memo: `Stock count ${product.sku}: ${delta > 0 ? "+" : ""}${delta}`,
        source: reference,
        lines: stockAdjustment(valueDelta),
      });
    }
    await audit(tx, ctx, {
      action: "adjust",
      entity: "product",
      entityId: product.id,
      summary: `${reference}: counted ${data.countedQty} ${product.sku} (book ${book})`,
      data: { warehouseId: data.warehouseId, delta, valueDelta, note: data.note },
    });
    return { reference, delta };
  });
  await invalidate(CACHE_KEYS.dashboard);
  return result;
}
