import { and, asc, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";

import { authorize, type Ctx } from "../../context";
import { db } from "../../db/client";
import { products, stockLevels, stockMovements, users, warehouses } from "../../db/schema";
import { notFound } from "../../errors";
import { PAGE_SIZE } from "../sales/queries";

/** Per-product stock across warehouses. Built per call so importing this module has no side effects. */
const stockTotals = () =>
  db
  .select({
    productId: stockLevels.productId,
    onHand: sql<number>`sum(${stockLevels.onHand})::int`.as("on_hand"),
    reserved: sql<number>`sum(${stockLevels.reserved})::int`.as("reserved"),
  })
  .from(stockLevels)
  .groupBy(stockLevels.productId)
  .as("totals");

export async function listProducts(ctx: Ctx, opts: { q?: string; category?: string; lowStock?: boolean }) {
  authorize(ctx, "inventory.read");
  const totals = stockTotals();
  const filters: SQL[] = [];
  if (opts.q) filters.push(or(ilike(products.sku, `%${opts.q}%`), ilike(products.name, `%${opts.q}%`))!);
  if (opts.category) filters.push(eq(products.category, opts.category));
  if (opts.lowStock) filters.push(sql`coalesce(${totals.onHand}, 0) - coalesce(${totals.reserved}, 0) <= ${products.reorderPoint}`);

  const [rows, categories] = await Promise.all([
    db
      .select({
        id: products.id,
        sku: products.sku,
        name: products.name,
        category: products.category,
        unit: products.unit,
        salePrice: products.salePrice,
        reorderPoint: products.reorderPoint,
        inventoryValue: products.inventoryValue,
        active: products.active,
        onHand: sql<number>`coalesce(${totals.onHand}, 0)`,
        reserved: sql<number>`coalesce(${totals.reserved}, 0)`,
      })
      .from(products)
      .leftJoin(totals, eq(totals.productId, products.id))
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(asc(products.sku)),
    db.selectDistinct({ category: products.category }).from(products).orderBy(products.category),
  ]);
  return {
    rows: rows.map((r) => ({ ...r, available: r.onHand - r.reserved, low: r.onHand - r.reserved <= r.reorderPoint })),
    categories: categories.map((c) => c.category),
  };
}

export async function getProduct(ctx: Ctx, id: number) {
  authorize(ctx, "inventory.read");
  const [product] = await db.select().from(products).where(eq(products.id, id));
  if (!product) throw notFound("Product");
  const [levels, movements] = await Promise.all([
    db
      .select({ warehouseId: warehouses.id, code: warehouses.code, name: warehouses.name, onHand: stockLevels.onHand, reserved: stockLevels.reserved })
      .from(warehouses)
      .leftJoin(stockLevels, and(eq(stockLevels.warehouseId, warehouses.id), eq(stockLevels.productId, id)))
      .orderBy(warehouses.id),
    db
      .select({
        id: stockMovements.id,
        kind: stockMovements.kind,
        qty: stockMovements.qty,
        value: stockMovements.value,
        reference: stockMovements.reference,
        note: stockMovements.note,
        occurredOn: stockMovements.occurredOn,
        warehouse: warehouses.code,
        by: users.name,
      })
      .from(stockMovements)
      .innerJoin(warehouses, eq(warehouses.id, stockMovements.warehouseId))
      .leftJoin(users, eq(users.id, stockMovements.createdBy))
      .where(eq(stockMovements.productId, id))
      .orderBy(desc(stockMovements.id))
      .limit(50),
  ]);
  const onHand = levels.reduce((n, l) => n + (l.onHand ?? 0), 0);
  return {
    product,
    levels: levels.map((l) => ({ ...l, onHand: l.onHand ?? 0, reserved: l.reserved ?? 0 })),
    movements,
    onHand,
  };
}

export async function listMovements(ctx: Ctx, opts: { kind?: "receipt" | "shipment" | "adjustment"; page?: number }) {
  authorize(ctx, "inventory.read");
  const where = opts.kind ? eq(stockMovements.kind, opts.kind) : undefined;
  const page = Math.max(1, opts.page ?? 1);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: stockMovements.id,
        kind: stockMovements.kind,
        qty: stockMovements.qty,
        value: stockMovements.value,
        reference: stockMovements.reference,
        note: stockMovements.note,
        occurredOn: stockMovements.occurredOn,
        productId: products.id,
        sku: products.sku,
        product: products.name,
        warehouse: warehouses.code,
        by: users.name,
      })
      .from(stockMovements)
      .innerJoin(products, eq(products.id, stockMovements.productId))
      .innerJoin(warehouses, eq(warehouses.id, stockMovements.warehouseId))
      .leftJoin(users, eq(users.id, stockMovements.createdBy))
      .where(where)
      .orderBy(desc(stockMovements.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(stockMovements).where(where),
  ]);
  return { rows, total, page, pageSize: PAGE_SIZE };
}

export async function adjustmentOptions(ctx: Ctx) {
  authorize(ctx, "inventory.read");
  const [productRows, warehouseRows, levels] = await Promise.all([
    db.select({ id: products.id, sku: products.sku, name: products.name, unit: products.unit }).from(products).orderBy(products.sku),
    db.select({ id: warehouses.id, code: warehouses.code, name: warehouses.name }).from(warehouses).orderBy(warehouses.id),
    db.select().from(stockLevels),
  ]);
  return { products: productRows, warehouses: warehouseRows, levels };
}
