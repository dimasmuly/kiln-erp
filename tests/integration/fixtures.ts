import { sql } from "drizzle-orm";

import { ACCOUNT_SEED } from "../../scripts/seed-data";
import type { Role } from "@/server/auth/rbac";
import { createCtx, type Ctx } from "@/server/context";
import { db } from "@/server/db/client";
import { accounts, customers, products, suppliers, users, warehouses } from "@/server/db/schema";
import { receivePurchaseOrder, createPurchaseOrder, placePurchaseOrder } from "@/server/modules/purchasing/commands";

/** Empties every table (TRUNCATE bypasses the append-only row triggers) and loads a minimal company. */
export async function freshCompany() {
  await db.execute(sql`
    TRUNCATE audit_log, payments, invoices, sales_order_lines, sales_orders, purchase_order_lines, purchase_orders,
      stock_movements, stock_levels, journal_lines, journal_entries, document_sequences,
      products, customers, suppliers, warehouses, accounts, users RESTART IDENTITY CASCADE`);
  const roles: Role[] = ["admin", "sales", "purchasing", "warehouse", "finance"];
  const userRows = await db
    .insert(users)
    .values(roles.map((role) => ({ name: `${role} user`, email: `${role}@test.local`, role, passwordHash: "unused" })))
    .returning();
  await db.insert(accounts).values([...ACCOUNT_SEED]);
  const [warehouse] = await db.insert(warehouses).values({ code: "JKT", name: "Jakarta", city: "Bekasi" }).returning();
  const [customer] = await db.insert(customers).values({ code: "CUS-1", name: "PT Test Pelanggan", paymentTermsDays: 30 }).returning();
  const [supplier] = await db.insert(suppliers).values({ code: "SUP-1", name: "PT Test Pemasok", paymentTermsDays: 30 }).returning();
  const [widget, gadget] = await db
    .insert(products)
    .values([
      { sku: "WIDGET", name: "Widget", category: "Test", salePrice: 150_000 },
      { sku: "GADGET", name: "Gadget", category: "Test", salePrice: 90_000 },
    ])
    .returning();

  const ctx = (role: Role, now = new Date("2026-10-01T03:00:00Z")): Ctx => createCtx(userRows.find((u) => u.role === role)!, now);
  return { ctx, warehouse, customer, supplier, widget, gadget };
}

export type Company = Awaited<ReturnType<typeof freshCompany>>;

/** Puts stock on the shelf through the real purchasing flow. */
export async function stockUp(c: Company, lines: { productId: number; qty: number; unitCost: number }[]) {
  const { id } = await createPurchaseOrder(c.ctx("purchasing"), { supplierId: c.supplier.id, warehouseId: c.warehouse.id, orderDate: "2026-10-01", taxRateBp: 1100, lines });
  await placePurchaseOrder(c.ctx("purchasing"), id);
  await receivePurchaseOrder(c.ctx("warehouse"), id);
  return id;
}

/** The invariants every test ends by checking. */
export async function ledgerInvariants() {
  const [row] = await db.execute<Record<string, string>>(sql`
    SELECT
      (SELECT coalesce(sum(debit), 0) FROM journal_lines) AS debits,
      (SELECT coalesce(sum(credit), 0) FROM journal_lines) AS credits,
      (SELECT coalesce(sum(inventory_value), 0) FROM products) AS stock_value,
      (SELECT coalesce(sum(l.debit - l.credit), 0) FROM journal_lines l JOIN accounts a ON a.id = l.account_id WHERE a.code = '1300') AS gl_inventory,
      (SELECT coalesce(sum(total - amount_paid), 0) FROM invoices) AS ar_subledger,
      (SELECT coalesce(sum(l.debit - l.credit), 0) FROM journal_lines l JOIN accounts a ON a.id = l.account_id WHERE a.code = '1200') AS gl_receivables,
      (SELECT count(*) FROM stock_levels s WHERE s.on_hand <> (SELECT coalesce(sum(qty), 0) FROM stock_movements m WHERE m.product_id = s.product_id AND m.warehouse_id = s.warehouse_id)) AS drifted_levels
  `);
  return {
    balanced: row.debits === row.credits,
    inventoryReconciled: row.stock_value === row.gl_inventory,
    receivablesReconciled: row.ar_subledger === row.gl_receivables,
    stockMatchesMovements: Number(row.drifted_levels) === 0,
  };
}
