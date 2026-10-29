import { asc, eq, sql } from "drizzle-orm";

import { authorize, type Ctx } from "../../context";
import { db } from "../../db/client";
import { customers, invoices, purchaseOrders, suppliers } from "../../db/schema";
import { notFound } from "../../errors";

export async function listCustomers(ctx: Ctx) {
  authorize(ctx, "sales.read");
  return db
    .select({
      id: customers.id,
      code: customers.code,
      name: customers.name,
      city: customers.city,
      email: customers.email,
      terms: customers.paymentTermsDays,
      outstanding: sql<number>`coalesce((SELECT sum(${invoices.total} - ${invoices.amountPaid}) FROM ${invoices} WHERE ${invoices.customerId} = ${customers.id} AND ${invoices.status} = 'open'), 0)`.mapWith(Number),
      overdue: sql<number>`coalesce((SELECT sum(${invoices.total} - ${invoices.amountPaid}) FROM ${invoices} WHERE ${invoices.customerId} = ${customers.id} AND ${invoices.status} = 'open' AND ${invoices.dueDate} < ${ctx.today}), 0)`.mapWith(Number),
      revenue: sql<number>`coalesce((SELECT sum(${invoices.subtotal}) FROM ${invoices} WHERE ${invoices.customerId} = ${customers.id}), 0)`.mapWith(Number),
    })
    .from(customers)
    .orderBy(asc(customers.name));
}

export async function listSuppliers(ctx: Ctx) {
  authorize(ctx, "purchasing.read");
  return db
    .select({
      id: suppliers.id,
      code: suppliers.code,
      name: suppliers.name,
      city: suppliers.city,
      email: suppliers.email,
      terms: suppliers.paymentTermsDays,
      payable: sql<number>`coalesce((SELECT sum(${purchaseOrders.total}) FROM ${purchaseOrders} WHERE ${purchaseOrders.supplierId} = ${suppliers.id} AND ${purchaseOrders.status} = 'received'), 0)`.mapWith(Number),
      purchased: sql<number>`coalesce((SELECT sum(${purchaseOrders.subtotal}) FROM ${purchaseOrders} WHERE ${purchaseOrders.supplierId} = ${suppliers.id} AND ${purchaseOrders.status} IN ('received', 'paid')), 0)`.mapWith(Number),
    })
    .from(suppliers)
    .orderBy(asc(suppliers.name));
}

export async function getParty(ctx: Ctx, kind: "customer" | "supplier", id: number) {
  authorize(ctx, kind === "customer" ? "sales.read" : "purchasing.read");
  const table = kind === "customer" ? customers : suppliers;
  const [row] = await db.select().from(table).where(eq(table.id, id));
  if (!row) throw notFound(kind === "customer" ? "Customer" : "Supplier");
  return row;
}
