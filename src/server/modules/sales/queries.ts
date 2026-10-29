import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";

import { agingBucket, AGING_BUCKETS, type AgingBucket, type SalesOrderStatus } from "../../../domain/workflow";
import { authorize, type Ctx } from "../../context";
import { db } from "../../db/client";
import {
  auditLog,
  customers,
  invoices,
  journalEntries,
  payments,
  products,
  salesOrderLines,
  salesOrders,
  stockLevels,
  users,
  warehouses,
} from "../../db/schema";
import { notFound } from "../../errors";

export const PAGE_SIZE = 25;

export async function listSalesOrders(ctx: Ctx, opts: { status?: SalesOrderStatus; q?: string; page?: number }) {
  authorize(ctx, "sales.read");
  const filters: SQL[] = [];
  if (opts.status) filters.push(eq(salesOrders.status, opts.status));
  if (opts.q) filters.push(or(ilike(salesOrders.number, `%${opts.q}%`), ilike(customers.name, `%${opts.q}%`))!);
  const where = filters.length ? and(...filters) : undefined;
  const page = Math.max(1, opts.page ?? 1);

  const [rows, [{ total }], statusCounts] = await Promise.all([
    db
      .select({
        id: salesOrders.id,
        number: salesOrders.number,
        status: salesOrders.status,
        orderDate: salesOrders.orderDate,
        total: salesOrders.total,
        customer: customers.name,
        warehouse: warehouses.code,
        lineCount: sql<number>`(SELECT count(*)::int FROM ${salesOrderLines} WHERE ${salesOrderLines.orderId} = ${salesOrders.id})`,
      })
      .from(salesOrders)
      .innerJoin(customers, eq(customers.id, salesOrders.customerId))
      .innerJoin(warehouses, eq(warehouses.id, salesOrders.warehouseId))
      .where(where)
      .orderBy(desc(salesOrders.orderDate), desc(salesOrders.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ total: count() })
      .from(salesOrders)
      .innerJoin(customers, eq(customers.id, salesOrders.customerId))
      .where(where),
    db.select({ status: salesOrders.status, n: count() }).from(salesOrders).groupBy(salesOrders.status),
  ]);
  return { rows, total, page, pageSize: PAGE_SIZE, statusCounts: Object.fromEntries(statusCounts.map((s) => [s.status, s.n])) };
}

export async function getSalesOrder(ctx: Ctx, id: number) {
  authorize(ctx, "sales.read");
  const [order] = await db
    .select({
      order: salesOrders,
      customer: { id: customers.id, code: customers.code, name: customers.name, city: customers.city, taxId: customers.taxId, terms: customers.paymentTermsDays },
      warehouse: { id: warehouses.id, code: warehouses.code, name: warehouses.name },
      createdBy: users.name,
    })
    .from(salesOrders)
    .innerJoin(customers, eq(customers.id, salesOrders.customerId))
    .innerJoin(warehouses, eq(warehouses.id, salesOrders.warehouseId))
    .leftJoin(users, eq(users.id, salesOrders.createdBy))
    .where(eq(salesOrders.id, id));
  if (!order) throw notFound("Sales order");

  const [lines, [invoice], history] = await Promise.all([
    db
      .select({
        id: salesOrderLines.id,
        productId: salesOrderLines.productId,
        sku: products.sku,
        name: products.name,
        unit: products.unit,
        qty: salesOrderLines.qty,
        unitPrice: salesOrderLines.unitPrice,
        lineTotal: salesOrderLines.lineTotal,
        cost: salesOrderLines.cost,
      })
      .from(salesOrderLines)
      .innerJoin(products, eq(products.id, salesOrderLines.productId))
      .where(eq(salesOrderLines.orderId, id))
      .orderBy(asc(salesOrderLines.position)),
    db.select().from(invoices).where(eq(invoices.salesOrderId, id)),
    db
      .select({ at: auditLog.at, summary: auditLog.summary, action: auditLog.action, actor: users.name })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.actorId))
      .where(and(eq(auditLog.entity, "sales_order"), eq(auditLog.entityId, String(id))))
      .orderBy(asc(auditLog.at), asc(auditLog.id)),
  ]);
  const sources = [order.order.number, ...(invoice ? [invoice.number] : [])];
  const entries = await db
    .select({ id: journalEntries.id, number: journalEntries.number, entryDate: journalEntries.entryDate, memo: journalEntries.memo })
    .from(journalEntries)
    .where(inArray(journalEntries.source, sources))
    .orderBy(asc(journalEntries.id));
  return { ...order, lines, invoice: invoice ?? null, history, entries };
}

/** Customers, warehouses and products (with free stock per warehouse) for the order editor. */
export async function salesFormOptions(ctx: Ctx) {
  authorize(ctx, "sales.read");
  const [customerRows, warehouseRows, productRows, levels] = await Promise.all([
    db.select({ id: customers.id, label: sql<string>`${customers.code} || ' · ' || ${customers.name}` }).from(customers).orderBy(customers.name),
    db.select({ id: warehouses.id, label: sql<string>`${warehouses.code} || ' · ' || ${warehouses.name}` }).from(warehouses).orderBy(warehouses.id),
    db
      .select({ id: products.id, sku: products.sku, name: products.name, unit: products.unit, price: products.salePrice })
      .from(products)
      .where(eq(products.active, true))
      .orderBy(products.sku),
    db
      .select({ productId: stockLevels.productId, warehouseId: stockLevels.warehouseId, free: sql<number>`${stockLevels.onHand} - ${stockLevels.reserved}` })
      .from(stockLevels),
  ]);
  return {
    parties: customerRows,
    warehouses: warehouseRows,
    products: productRows.map((p) => ({
      ...p,
      available: Object.fromEntries(levels.filter((l) => l.productId === p.id).map((l) => [l.warehouseId, l.free])),
    })),
  };
}

export type InvoiceFilter = "open" | "overdue" | "paid" | "all";

export async function listInvoices(ctx: Ctx, opts: { filter?: InvoiceFilter; page?: number }) {
  authorize(ctx, "sales.read");
  const filter = opts.filter ?? "open";
  const where =
    filter === "open"
      ? eq(invoices.status, "open")
      : filter === "paid"
        ? eq(invoices.status, "paid")
        : filter === "overdue"
          ? and(eq(invoices.status, "open"), sql`${invoices.dueDate} < ${ctx.today}`)
          : undefined;
  const page = Math.max(1, opts.page ?? 1);
  const [rows, [{ total }], open] = await Promise.all([
    db
      .select({
        id: invoices.id,
        number: invoices.number,
        status: invoices.status,
        issueDate: invoices.issueDate,
        dueDate: invoices.dueDate,
        total: invoices.total,
        amountPaid: invoices.amountPaid,
        customer: customers.name,
        orderId: invoices.salesOrderId,
      })
      .from(invoices)
      .innerJoin(customers, eq(customers.id, invoices.customerId))
      .where(where)
      .orderBy(filter === "paid" ? desc(invoices.issueDate) : asc(invoices.dueDate), desc(invoices.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(invoices).where(where),
    db
      .select({ dueDate: invoices.dueDate, outstanding: sql<number>`${invoices.total} - ${invoices.amountPaid}`.mapWith(Number) })
      .from(invoices)
      .where(eq(invoices.status, "open")),
  ]);
  const aging = Object.fromEntries(AGING_BUCKETS.map((b) => [b, 0])) as Record<AgingBucket, number>;
  for (const inv of open) aging[agingBucket(inv.dueDate, ctx.today)] += inv.outstanding;
  return {
    rows: rows.map((r) => ({ ...r, bucket: r.status === "open" ? agingBucket(r.dueDate, ctx.today) : null })),
    total,
    page,
    pageSize: PAGE_SIZE,
    aging,
  };
}

export async function getInvoice(ctx: Ctx, id: number) {
  authorize(ctx, "sales.read");
  const [row] = await db
    .select({ invoice: invoices, customer: { id: customers.id, name: customers.name, code: customers.code, city: customers.city, taxId: customers.taxId }, orderNumber: salesOrders.number })
    .from(invoices)
    .innerJoin(customers, eq(customers.id, invoices.customerId))
    .innerJoin(salesOrders, eq(salesOrders.id, invoices.salesOrderId))
    .where(eq(invoices.id, id));
  if (!row) throw notFound("Invoice");
  const [paymentRows, lines] = await Promise.all([
    db
      .select({ id: payments.id, amount: payments.amount, paidOn: payments.paidOn, method: payments.method, reference: payments.reference, by: users.name })
      .from(payments)
      .leftJoin(users, eq(users.id, payments.createdBy))
      .where(eq(payments.invoiceId, id))
      .orderBy(asc(payments.paidOn), asc(payments.id)),
    db
      .select({ sku: products.sku, name: products.name, unit: products.unit, qty: salesOrderLines.qty, unitPrice: salesOrderLines.unitPrice, lineTotal: salesOrderLines.lineTotal })
      .from(salesOrderLines)
      .innerJoin(products, eq(products.id, salesOrderLines.productId))
      .where(eq(salesOrderLines.orderId, row.invoice.salesOrderId))
      .orderBy(asc(salesOrderLines.position)),
  ]);
  return { ...row, payments: paymentRows, lines, bucket: row.invoice.status === "open" ? agingBucket(row.invoice.dueDate, ctx.today) : null };
}
