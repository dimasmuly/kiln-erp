import { and, asc, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";

import type { PurchaseOrderStatus } from "../../../domain/workflow";
import { authorize, type Ctx } from "../../context";
import { db } from "../../db/client";
import { auditLog, journalEntries, products, purchaseOrderLines, purchaseOrders, suppliers, users, warehouses } from "../../db/schema";
import { notFound } from "../../errors";
import { PAGE_SIZE } from "../sales/queries";

export async function listPurchaseOrders(ctx: Ctx, opts: { status?: PurchaseOrderStatus; q?: string; page?: number }) {
  authorize(ctx, "purchasing.read");
  const filters: SQL[] = [];
  if (opts.status) filters.push(eq(purchaseOrders.status, opts.status));
  if (opts.q) filters.push(or(ilike(purchaseOrders.number, `%${opts.q}%`), ilike(suppliers.name, `%${opts.q}%`))!);
  const where = filters.length ? and(...filters) : undefined;
  const page = Math.max(1, opts.page ?? 1);

  const [rows, [{ total }], statusCounts] = await Promise.all([
    db
      .select({
        id: purchaseOrders.id,
        number: purchaseOrders.number,
        status: purchaseOrders.status,
        orderDate: purchaseOrders.orderDate,
        expectedDate: purchaseOrders.expectedDate,
        total: purchaseOrders.total,
        supplier: suppliers.name,
        warehouse: warehouses.code,
        lineCount: sql<number>`(SELECT count(*)::int FROM ${purchaseOrderLines} WHERE ${purchaseOrderLines.orderId} = ${purchaseOrders.id})`,
      })
      .from(purchaseOrders)
      .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
      .innerJoin(warehouses, eq(warehouses.id, purchaseOrders.warehouseId))
      .where(where)
      .orderBy(desc(purchaseOrders.orderDate), desc(purchaseOrders.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ total: count() })
      .from(purchaseOrders)
      .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
      .where(where),
    db.select({ status: purchaseOrders.status, n: count() }).from(purchaseOrders).groupBy(purchaseOrders.status),
  ]);
  return { rows, total, page, pageSize: PAGE_SIZE, statusCounts: Object.fromEntries(statusCounts.map((s) => [s.status, s.n])) };
}

export async function getPurchaseOrder(ctx: Ctx, id: number) {
  authorize(ctx, "purchasing.read");
  const [order] = await db
    .select({
      order: purchaseOrders,
      supplier: { id: suppliers.id, code: suppliers.code, name: suppliers.name, city: suppliers.city, taxId: suppliers.taxId, terms: suppliers.paymentTermsDays },
      warehouse: { id: warehouses.id, code: warehouses.code, name: warehouses.name },
      createdBy: users.name,
    })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
    .innerJoin(warehouses, eq(warehouses.id, purchaseOrders.warehouseId))
    .leftJoin(users, eq(users.id, purchaseOrders.createdBy))
    .where(eq(purchaseOrders.id, id));
  if (!order) throw notFound("Purchase order");

  const [lines, history, entries] = await Promise.all([
    db
      .select({
        id: purchaseOrderLines.id,
        productId: purchaseOrderLines.productId,
        sku: products.sku,
        name: products.name,
        unit: products.unit,
        qty: purchaseOrderLines.qty,
        unitCost: purchaseOrderLines.unitCost,
        lineTotal: purchaseOrderLines.lineTotal,
      })
      .from(purchaseOrderLines)
      .innerJoin(products, eq(products.id, purchaseOrderLines.productId))
      .where(eq(purchaseOrderLines.orderId, id))
      .orderBy(asc(purchaseOrderLines.position)),
    db
      .select({ at: auditLog.at, summary: auditLog.summary, action: auditLog.action, actor: users.name })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.actorId))
      .where(and(eq(auditLog.entity, "purchase_order"), eq(auditLog.entityId, String(id))))
      .orderBy(asc(auditLog.at), asc(auditLog.id)),
    db
      .select({ id: journalEntries.id, number: journalEntries.number, entryDate: journalEntries.entryDate, memo: journalEntries.memo })
      .from(journalEntries)
      .where(eq(journalEntries.source, order.order.number))
      .orderBy(asc(journalEntries.id)),
  ]);
  return { ...order, lines, history, entries };
}

export async function purchaseFormOptions(ctx: Ctx) {
  authorize(ctx, "purchasing.read");
  const [supplierRows, warehouseRows, productRows] = await Promise.all([
    db.select({ id: suppliers.id, label: sql<string>`${suppliers.code} || ' · ' || ${suppliers.name}` }).from(suppliers).orderBy(suppliers.name),
    db.select({ id: warehouses.id, label: sql<string>`${warehouses.code} || ' · ' || ${warehouses.name}` }).from(warehouses).orderBy(warehouses.id),
    db
      .select({ id: products.id, sku: products.sku, name: products.name, unit: products.unit, price: products.lastCost })
      .from(products)
      .where(eq(products.active, true))
      .orderBy(products.sku),
  ]);
  return { parties: supplierRows, warehouses: warehouseRows, products: productRows.map((p) => ({ ...p, available: {} as Record<number, number> })) };
}
