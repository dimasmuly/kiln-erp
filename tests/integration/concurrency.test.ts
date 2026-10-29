import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/server/db/client";
import { stockLevels } from "@/server/db/schema";
import { confirmSalesOrder, createSalesOrder, deliverSalesOrder, invoiceSalesOrder, recordPayment } from "@/server/modules/sales/commands";

import { freshCompany, ledgerInvariants, stockUp, type Company } from "./fixtures";

let c: Company;
beforeEach(async () => {
  c = await freshCompany();
});

const create = (lines: { productId: number; qty: number }[]) =>
  createSalesOrder(c.ctx("sales"), {
    customerId: c.customer.id,
    warehouseId: c.warehouse.id,
    orderDate: "2026-10-01",
    lines: lines.map((l) => ({ ...l, unitPrice: 150_000 })),
  });

describe("under concurrent load", () => {
  it("never oversells: 20 simultaneous confirmations for 10 units", async () => {
    await stockUp(c, [{ productId: c.widget.id, qty: 10, unitCost: 100_000 }]);
    const orders = await Promise.all(Array.from({ length: 20 }, () => create([{ productId: c.widget.id, qty: 1 }])));
    const results = await Promise.allSettled(orders.map((o) => confirmSalesOrder(c.ctx("sales"), o.id)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(10);
    expect(results.filter((r) => r.status === "rejected").every((r) => (r as PromiseRejectedResult).reason.code === "insufficient_stock")).toBe(true);
    const [level] = await db.select().from(stockLevels).where(eq(stockLevels.productId, c.widget.id));
    expect(level).toMatchObject({ onHand: 10, reserved: 10 });
  });

  it("does not deadlock when orders lock the same products in different line orders", async () => {
    await stockUp(c, [
      { productId: c.widget.id, qty: 100, unitCost: 100_000 },
      { productId: c.gadget.id, qty: 100, unitCost: 60_000 },
    ]);
    const orders = await Promise.all(
      Array.from({ length: 16 }, (_, i) =>
        create(i % 2 ? [{ productId: c.widget.id, qty: 2 }, { productId: c.gadget.id, qty: 3 }] : [{ productId: c.gadget.id, qty: 3 }, { productId: c.widget.id, qty: 2 }]),
      ),
    );
    await Promise.all(orders.map((o) => confirmSalesOrder(c.ctx("sales"), o.id)));
    await Promise.all(orders.map((o) => deliverSalesOrder(c.ctx("warehouse"), o.id)));
    expect(await ledgerInvariants()).toMatchObject({ balanced: true, inventoryReconciled: true, stockMatchesMovements: true });
  });

  it("a double-clicked Deliver posts once", async () => {
    await stockUp(c, [{ productId: c.widget.id, qty: 5, unitCost: 100_000 }]);
    const { id } = await create([{ productId: c.widget.id, qty: 5 }]);
    await confirmSalesOrder(c.ctx("sales"), id);
    const results = await Promise.allSettled([deliverSalesOrder(c.ctx("warehouse"), id), deliverSalesOrder(c.ctx("warehouse"), id)]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    const [level] = await db.select().from(stockLevels).where(eq(stockLevels.productId, c.widget.id));
    expect(level).toMatchObject({ onHand: 0, reserved: 0 });
  });

  it("parallel partial payments can never exceed the invoice total", async () => {
    await stockUp(c, [{ productId: c.widget.id, qty: 1, unitCost: 100_000 }]);
    const { id } = await create([{ productId: c.widget.id, qty: 1 }]);
    await confirmSalesOrder(c.ctx("sales"), id);
    await deliverSalesOrder(c.ctx("warehouse"), id);
    const { invoiceId } = await invoiceSalesOrder(c.ctx("finance"), id); // total 166_500
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => recordPayment(c.ctx("finance"), invoiceId, { amount: 50_000, paidOn: "2026-10-01", method: "cash" })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect(await ledgerInvariants()).toMatchObject({ balanced: true, receivablesReconciled: true });
  });
});
