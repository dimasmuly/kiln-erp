import { desc, eq, sql } from "drizzle-orm";

import { ACCOUNTS } from "../../../domain/posting";
import { authorize, type Ctx } from "../../context";
import { db } from "../../db/client";
import { auditLog, users } from "../../db/schema";
import { CACHE_KEYS, readThrough, type CacheRead } from "../../kv/cache";
import { addDays } from "../shared";

export interface DashboardData {
  asOf: string;
  revenueMtd: number;
  revenuePrevMtd: number;
  grossProfitMtd: number;
  cash: number;
  receivables: number;
  overdueReceivables: number;
  payables: number;
  inventoryValue: number;
  glInventory: number;
  weekly: { week: string; revenue: number; grossProfit: number }[];
  topProducts: { id: number; sku: string; name: string; revenue: number; qty: number }[];
  lowStock: { id: number; sku: string; name: string; available: number; reorderPoint: number }[];
  pipeline: { drafts: number; toDeliver: number; toInvoice: number; inbound: number };
}

async function compute(today: string): Promise<DashboardData> {
  const monthStart = `${today.slice(0, 7)}-01`;
  const prevMonthStart = addDays(monthStart, -1).slice(0, 7) + "-01";
  const prevSameDay = (() => {
    const day = Number(today.slice(8, 10));
    const lastOfPrev = addDays(monthStart, -1);
    return Number(lastOfPrev.slice(8, 10)) < day ? lastOfPrev : `${prevMonthStart.slice(0, 8)}${today.slice(8, 10)}`;
  })();

  const balance = (code: string, from?: string) => sql<number>`
    coalesce((SELECT sum(l.debit - l.credit) FROM journal_lines l
      JOIN accounts a ON a.id = l.account_id JOIN journal_entries e ON e.id = l.entry_id
      WHERE a.code = ${code} ${from ? sql`AND e.entry_date >= ${from}` : sql``}), 0)`;

  const [[totals], weekly, topProducts, lowStock] = await Promise.all([
    db.execute<Record<string, string>>(sql`
      SELECT
        (SELECT coalesce(sum(subtotal), 0) FROM invoices WHERE issue_date >= ${monthStart} AND issue_date <= ${today}) AS revenue_mtd,
        (SELECT coalesce(sum(subtotal), 0) FROM invoices WHERE issue_date >= ${prevMonthStart} AND issue_date <= ${prevSameDay}) AS revenue_prev_mtd,
        ${balance(ACCOUNTS.cogs, monthStart)} AS cogs_mtd,
        ${balance(ACCOUNTS.cash)} AS cash,
        ${balance(ACCOUNTS.inventory)} AS gl_inventory,
        (SELECT coalesce(sum(total - amount_paid), 0) FROM invoices WHERE status = 'open') AS receivables,
        (SELECT coalesce(sum(total - amount_paid), 0) FROM invoices WHERE status = 'open' AND due_date < ${today}) AS overdue,
        (SELECT coalesce(sum(total), 0) FROM purchase_orders WHERE status = 'received') AS payables,
        (SELECT coalesce(sum(inventory_value), 0) FROM products) AS inventory_value,
        (SELECT count(*) FROM sales_orders WHERE status = 'draft') AS drafts,
        (SELECT count(*) FROM sales_orders WHERE status = 'confirmed') AS to_deliver,
        (SELECT count(*) FROM sales_orders WHERE status = 'delivered') AS to_invoice,
        (SELECT count(*) FROM purchase_orders WHERE status = 'ordered') AS inbound
    `),
    db.execute<{ week: string; revenue: string; cost: string }>(sql`
      SELECT to_char(date_trunc('week', i.issue_date), 'YYYY-MM-DD') AS week,
             sum(i.subtotal) AS revenue,
             sum(coalesce(o.cost_of_goods, 0)) AS cost
      FROM invoices i JOIN sales_orders o ON o.id = i.sales_order_id
      WHERE i.issue_date >= date_trunc('week', ${today}::date) - interval '11 weeks'
      GROUP BY 1 ORDER BY 1
    `),
    db.execute<{ id: number; sku: string; name: string; revenue: string; qty: string }>(sql`
      SELECT p.id, p.sku, p.name, sum(l.line_total) AS revenue, sum(l.qty) AS qty
      FROM invoices i
      JOIN sales_order_lines l ON l.order_id = i.sales_order_id
      JOIN products p ON p.id = l.product_id
      WHERE i.issue_date > ${addDays(today, -30)}
      GROUP BY p.id ORDER BY revenue DESC LIMIT 6
    `),
    db.execute<{ id: number; sku: string; name: string; available: string; reorder_point: number }>(sql`
      SELECT p.id, p.sku, p.name, coalesce(sum(s.on_hand - s.reserved), 0) AS available, p.reorder_point
      FROM products p LEFT JOIN stock_levels s ON s.product_id = p.id
      WHERE p.active
      GROUP BY p.id
      HAVING coalesce(sum(s.on_hand - s.reserved), 0) <= p.reorder_point
      ORDER BY coalesce(sum(s.on_hand - s.reserved), 0)::float / greatest(p.reorder_point, 1) LIMIT 8
    `),
  ]);
  const n = (key: string) => Number(totals[key]);
  const revenueMtd = n("revenue_mtd");
  return {
    asOf: today,
    revenueMtd,
    revenuePrevMtd: n("revenue_prev_mtd"),
    grossProfitMtd: revenueMtd - n("cogs_mtd"),
    cash: n("cash"),
    receivables: n("receivables"),
    overdueReceivables: n("overdue"),
    payables: n("payables"),
    inventoryValue: n("inventory_value"),
    glInventory: n("gl_inventory"),
    weekly: weekly.map((w) => ({ week: w.week, revenue: Number(w.revenue), grossProfit: Number(w.revenue) - Number(w.cost) })),
    topProducts: topProducts.map((p) => ({ id: p.id, sku: p.sku, name: p.name, revenue: Number(p.revenue), qty: Number(p.qty) })),
    lowStock: lowStock.map((p) => ({ id: p.id, sku: p.sku, name: p.name, available: Number(p.available), reorderPoint: p.reorder_point })),
    pipeline: { drafts: n("drafts"), toDeliver: n("to_deliver"), toInvoice: n("to_invoice"), inbound: n("inbound") },
  };
}

/** Company-wide figures, shared by every viewer through EmberKV for 60 s (or until the next posting). */
export async function getDashboard(ctx: Ctx): Promise<CacheRead<DashboardData>> {
  authorize(ctx, "inventory.read");
  return readThrough(CACHE_KEYS.dashboard, "60s", () => compute(ctx.today), (cached) => cached.asOf === ctx.today);
}

export async function recentActivity(ctx: Ctx, limit = 8) {
  authorize(ctx, "inventory.read");
  return db
    .select({ id: auditLog.id, at: auditLog.at, summary: auditLog.summary, entity: auditLog.entity, entityId: auditLog.entityId, actor: users.name })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorId))
    .orderBy(desc(auditLog.id))
    .limit(limit);
}
