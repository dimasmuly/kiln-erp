/**
 * Resets the database and simulates 120 days of trading for a demo company.
 *
 * History is produced by calling the real service commands (create, confirm,
 * deliver, invoice, pay, receive, count) with backdated contexts, not by
 * inserting rows. So the demo data obeys every invariant production data
 * does: the ledger balances, stock never goes negative, and the inventory
 * sub-ledger reconciles with the GL to the sen.
 *
 *   npm run db:seed
 */
import { config } from "dotenv";
import { and, eq, sql } from "drizzle-orm";

import { ownerCapital } from "../src/domain/posting";
import { hashPassword } from "../src/server/auth/password";
import type { Role } from "../src/server/auth/rbac";
import { businessDate, createCtx, type Actor } from "../src/server/context";
import { db } from "../src/server/db/client";
import { accounts, customers, products, stockLevels, suppliers, users, warehouses } from "../src/server/db/schema";
import { env } from "../src/server/env";
import { AppError } from "../src/server/errors";
import { CACHE_KEYS, invalidate } from "../src/server/kv/cache";
import { adjustStock } from "../src/server/modules/inventory/commands";
import {
  cancelPurchaseOrder,
  createPurchaseOrder,
  payPurchaseOrder,
  placePurchaseOrder,
  receivePurchaseOrder,
} from "../src/server/modules/purchasing/commands";
import {
  confirmSalesOrder,
  createSalesOrder,
  deliverSalesOrder,
  invoiceSalesOrder,
  recordPayment,
} from "../src/server/modules/sales/commands";
import { addDays, postJournal } from "../src/server/modules/shared";
import { runMigrations } from "./migrate";
import { ACCOUNT_SEED, CUSTOMERS, DEMO_PASSWORD, DEMO_USERS, PRODUCTS, SUPPLIERS, WAREHOUSES } from "./seed-data";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const DAYS = 120;

/** Deterministic PRNG, so every seed run produces the same company. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
const rand = mulberry32(20_261_029);
const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const chance = (p: number) => rand() < p;
const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)];

async function main() {
  const started = performance.now();
  await runMigrations(env().DATABASE_URL, { reset: true });

  // --- Master data ------------------------------------------------------------
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const userRows = await db
    .insert(users)
    .values(DEMO_USERS.map((u) => ({ ...u, passwordHash })))
    .returning({ id: users.id, name: users.name, role: users.role });
  const actor = (role: Role): Actor => userRows.find((u) => u.role === role)!;

  await db.insert(accounts).values([...ACCOUNT_SEED]);
  const warehouseRows = await db.insert(warehouses).values(WAREHOUSES).returning();
  const [jkt, sby] = warehouseRows;

  const party = ([code, name, city, paymentTermsDays, taxId]: (typeof CUSTOMERS)[number]) => ({
    code,
    name,
    city,
    paymentTermsDays,
    taxId,
    email: `finance@${code.slice(4).toLowerCase()}.example`,
    phone: `+62 21 ${int(5000, 7999)} ${int(1000, 9999)}`,
  });
  const supplierRows = await db.insert(suppliers).values(SUPPLIERS.map(party)).returning();
  const customerRows = await db.insert(customers).values(CUSTOMERS.map(party)).returning();
  const productRows = await db
    .insert(products)
    .values(PRODUCTS.map(([sku, name, category, unit, salePrice, , reorderPoint]) => ({ sku, name, category, unit, salePrice, reorderPoint })))
    .returning();
  const catalog = productRows.map((p) => {
    const spec = PRODUCTS.find((s) => s[0] === p.sku)!;
    return { ...p, cost: spec[5], supplierId: supplierRows.find((s) => s.code === spec[7])!.id };
  });

  // --- Simulation -------------------------------------------------------------
  const startDate = addDays(businessDate(new Date()), -DAYS);
  const dayDate = (d: number) => addDays(startDate, d);
  const ctxAt = (role: Role, d: number, hour: number) =>
    createCtx(actor(role), new Date(`${dayDate(d)}T${String(hour).padStart(2, "0")}:${String(int(0, 59)).padStart(2, "0")}:00+07:00`));

  await db.transaction((tx) =>
    postJournal(tx, ctxAt("admin", 0, 8), {
      date: dayDate(0),
      memo: "Initial paid-in capital",
      source: null,
      lines: ownerCapital(6_000_000_000 * 100),
    }),
  );

  type Plan = { id: number; day: number };
  const toReceive: Plan[] = [];
  const toPaySupplier: Plan[] = [];
  const toDeliver: Plan[] = [];
  const toInvoice: Plan[] = [];
  const toCollect: { invoiceId: number; day: number; amount: number | "rest" }[] = [];
  const counts = { so: 0, po: 0, invoices: 0, payments: 0, adjustments: 0, stockouts: 0 };

  async function purchase(d: number, warehouseId: number, items: { productId: number; supplierId: number; qty: number; cost: number }[]) {
    const bySupplier = Map.groupBy(items, (i) => i.supplierId);
    for (const [supplierId, lines] of bySupplier) {
      const ctx = ctxAt("purchasing", d, 9);
      const { id } = await createPurchaseOrder(ctx, {
        supplierId,
        warehouseId,
        orderDate: ctx.today,
        expectedDate: addDays(ctx.today, 5),
        lines: lines.map((l) => ({ productId: l.productId, qty: l.qty, unitCost: l.cost })),
      });
      counts.po++;
      if (d > DAYS - 3 && chance(0.5)) continue; // a few drafts waiting for approval
      await placePurchaseOrder(ctx, id);
      if (chance(0.03)) {
        await cancelPurchaseOrder(ctx, id);
        continue;
      }
      toReceive.push({ id, day: d + int(2, 6) });
    }
  }

  async function replenish(d: number) {
    const levels = await db
      .select({ productId: stockLevels.productId, warehouseId: stockLevels.warehouseId, free: sql<number>`${stockLevels.onHand} - ${stockLevels.reserved}` })
      .from(stockLevels);
    const inbound = new Set(toReceive.map((r) => r.id));
    for (const warehouse of [jkt, sby]) {
      const items = catalog
        .filter((p) => {
          const free = levels.find((l) => l.productId === p.id && l.warehouseId === warehouse.id)?.free ?? 0;
          return free < p.reorderPoint * (warehouse === jkt ? 1.5 : 0.8);
        })
        .map((p) => ({
          productId: p.id,
          supplierId: p.supplierId,
          qty: Math.ceil(p.reorderPoint * (warehouse === jkt ? 2.5 : 1.5)),
          // Supplier prices drift a little, which exercises weighted-average costing.
          cost: Math.round((p.cost * (1 + (rand() - 0.4) * 0.06)) / 10_000) * 10_000,
        }));
      if (items.length > 0 && inbound.size < 40) await purchase(d, warehouse.id, items);
    }
  }

  for (let d = 0; d <= DAYS; d++) {
    const weekday = new Date(`${dayDate(d)}T00:00:00Z`).getUTCDay();
    const workday = weekday !== 0 && weekday !== 6;

    if (d === 0) {
      for (const warehouse of [jkt, sby]) {
        await purchase(
          0,
          warehouse.id,
          catalog.map((p) => ({ productId: p.id, supplierId: p.supplierId, qty: p.reorderPoint * (warehouse === jkt ? 4 : 2), cost: p.cost })),
        );
      }
    } else if ((d % 7 === 1 && d < DAYS - 30) || d === DAYS - 2) {
      // Replenishment pauses near the end, so the demo opens with some low stock and goods in transit.
      await replenish(d);
    }

    for (const plan of toReceive.filter((p) => p.day === d)) {
      await receivePurchaseOrder(ctxAt("warehouse", d, 10), plan.id);
      const [po] = await db.execute<{ terms: number }>(
        sql`SELECT s.payment_terms_days AS terms FROM purchase_orders o JOIN suppliers s ON s.id = o.supplier_id WHERE o.id = ${plan.id}`,
      );
      toPaySupplier.push({ id: plan.id, day: d + Number(po.terms) + int(-5, 5) });
    }
    for (const plan of toPaySupplier.filter((p) => p.day === d)) await payPurchaseOrder(ctxAt("finance", d, 15), plan.id);

    // Pipeline: deliver → invoice → collect.
    for (const plan of toDeliver.filter((p) => p.day === d)) {
      await deliverSalesOrder(ctxAt("warehouse", d, 11), plan.id);
      if (d < DAYS || chance(0.5)) toInvoice.push({ id: plan.id, day: d + int(0, 1) });
    }
    for (const plan of toInvoice.filter((p) => p.day === d)) {
      const ctx = ctxAt("finance", d, 14);
      const { invoiceId } = await invoiceSalesOrder(ctx, plan.id);
      counts.invoices++;
      const [inv] = await db.execute<{ terms: number; total: number }>(
        sql`SELECT c.payment_terms_days AS terms, i.total FROM invoices i JOIN customers c ON c.id = i.customer_id WHERE i.id = ${invoiceId}`,
      );
      const payDay = d + Number(inv.terms) + int(-12, 20);
      if (chance(0.15)) {
        const half = Math.round(Number(inv.total) / 2 / 100) * 100;
        toCollect.push({ invoiceId, day: d + int(3, 10), amount: half }, { invoiceId, day: payDay, amount: "rest" });
      } else {
        toCollect.push({ invoiceId, day: payDay, amount: "rest" });
      }
    }
    for (const plan of toCollect.filter((p) => p.day === d)) {
      const ctx = ctxAt("finance", d, 16);
      const [inv] = await db.execute<{ outstanding: number }>(sql`SELECT total - amount_paid AS outstanding FROM invoices WHERE id = ${plan.invoiceId}`);
      const outstanding = Number(inv.outstanding);
      const amount = plan.amount === "rest" ? outstanding : Math.min(plan.amount, outstanding);
      if (amount <= 0) continue;
      await recordPayment(ctx, plan.invoiceId, {
        amount,
        paidOn: ctx.today,
        method: pick(["bank_transfer", "bank_transfer", "bank_transfer", "virtual_account", "giro"] as const),
        reference: `TRF-${int(100_000, 999_999)}`,
      });
      counts.payments++;
    }

    // New sales orders.
    const orderCount = workday ? int(2, 6) : int(0, 1);
    for (let i = 0; i < orderCount && d > 2; i++) {
      const ctx = ctxAt("sales", d, int(9, 17));
      const warehouse = chance(0.7) ? jkt : sby;
      const chosen = new Set<(typeof catalog)[number]>();
      const lineCount = int(1, 4);
      while (chosen.size < lineCount) chosen.add(pick(catalog));
      const { id } = await createSalesOrder(ctx, {
        customerId: pick(customerRows).id,
        warehouseId: warehouse.id,
        orderDate: ctx.today,
        lines: [...chosen].map((p) => ({
          productId: p.id,
          qty: int(1, Math.max(2, Math.round(p.reorderPoint / 4))),
          // Negotiated prices: up to 8% off list, rounded to Rp 1.000.
          unitPrice: Math.round((p.salePrice * (1 - rand() * 0.08)) / 100_000) * 100_000,
        })),
      });
      counts.so++;
      if (d >= DAYS - 1 && chance(0.6)) continue; // today's drafts
      try {
        await confirmSalesOrder(ctx, id);
        if (d < DAYS || chance(0.3)) toDeliver.push({ id, day: Math.min(DAYS, d + int(1, 3)) });
      } catch (err) {
        if (!(err instanceof AppError && err.code === "insufficient_stock")) throw err;
        counts.stockouts++; // stays a draft until stock arrives, like real life
      }
    }

    // Fortnightly cycle counts with a little shrinkage.
    if (d % 14 === 10) {
      for (let i = 0; i < 2; i++) {
        const p = pick(catalog);
        const warehouse = pick([jkt, sby]);
        const [level] = await db
          .select()
          .from(stockLevels)
          .where(and(eq(stockLevels.productId, p.id), eq(stockLevels.warehouseId, warehouse.id)));
        if (!level || level.onHand - level.reserved < 3) continue;
        await adjustStock(ctxAt("warehouse", d, 17), {
          productId: p.id,
          warehouseId: warehouse.id,
          countedQty: level.onHand - int(1, 2),
          note: pick(["Damaged in handling", "Cycle count variance", "Missing after stock take"]),
        });
        counts.adjustments++;
      }
    }

    if (d % 20 === 0) process.stdout.write(`  simulated ${dayDate(d)} (day ${d}/${DAYS})\n`);
  }

  await invalidate(CACHE_KEYS.dashboard);
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  console.log(`✓ Seeded ${DAYS} days in ${seconds}s:`, counts);
  console.log(`  Sign in at http://localhost:3000 as admin@kiln.test / ${DEMO_PASSWORD}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
