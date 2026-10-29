import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/server/db/client";
import { invoices, salesOrders, stockLevels } from "@/server/db/schema";
import { AppError } from "@/server/errors";
import { adjustStock } from "@/server/modules/inventory/commands";
import { payPurchaseOrder } from "@/server/modules/purchasing/commands";
import {
  cancelSalesOrder,
  confirmSalesOrder,
  createSalesOrder,
  deliverSalesOrder,
  invoiceSalesOrder,
  recordPayment,
  updateSalesOrder,
} from "@/server/modules/sales/commands";

import { freshCompany, ledgerInvariants, stockUp, type Company } from "./fixtures";

let c: Company;
beforeEach(async () => {
  c = await freshCompany();
});

const order = (lines: { productId: number; qty: number; unitPrice: number }[]) => ({
  customerId: c.customer.id,
  warehouseId: c.warehouse.id,
  orderDate: "2026-10-01",
  taxRateBp: 1100,
  lines,
});

describe("procure-to-pay and order-to-cash", () => {
  it("posts every step and keeps every sub-ledger reconciled with the GL", async () => {
    const po = await stockUp(c, [
      { productId: c.widget.id, qty: 10, unitCost: 100_000 },
      { productId: c.gadget.id, qty: 5, unitCost: 60_000 },
    ]);
    const { id, number } = await createSalesOrder(c.ctx("sales"), order([{ productId: c.widget.id, qty: 4, unitPrice: 150_000 }]));
    expect(number).toBe("SO-2026-00001");

    await confirmSalesOrder(c.ctx("sales"), id);
    const [level] = await db.select().from(stockLevels).where(eq(stockLevels.productId, c.widget.id));
    expect(level).toMatchObject({ onHand: 10, reserved: 4 });

    await deliverSalesOrder(c.ctx("warehouse"), id);
    const [delivered] = await db.select().from(salesOrders).where(eq(salesOrders.id, id));
    expect(delivered.costOfGoods).toBe(400_000);

    const { invoiceId } = await invoiceSalesOrder(c.ctx("finance"), id);
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
    expect(invoice).toMatchObject({ subtotal: 600_000, tax: 66_000, total: 666_000, dueDate: "2026-10-31" });

    expect(await recordPayment(c.ctx("finance"), invoiceId, { amount: 300_000, paidOn: "2026-10-01", method: "bank_transfer" })).toEqual({ fullyPaid: false });
    expect(await recordPayment(c.ctx("finance"), invoiceId, { amount: 366_000, paidOn: "2026-10-01", method: "giro" })).toEqual({ fullyPaid: true });
    await payPurchaseOrder(c.ctx("finance"), po);

    const [paid] = await db.select({ status: salesOrders.status }).from(salesOrders).where(eq(salesOrders.id, id));
    expect(paid.status).toBe("paid");
    expect(await ledgerInvariants()).toEqual({ balanced: true, inventoryReconciled: true, receivablesReconciled: true, stockMatchesMovements: true });
  });

  it("refuses overpayment, double payment and skipped steps", async () => {
    await stockUp(c, [{ productId: c.widget.id, qty: 5, unitCost: 100_000 }]);
    const { id } = await createSalesOrder(c.ctx("sales"), order([{ productId: c.widget.id, qty: 1, unitPrice: 150_000 }]));
    await expect(deliverSalesOrder(c.ctx("warehouse"), id)).rejects.toThrow(/cannot move from "draft" to "delivered"/);
    await confirmSalesOrder(c.ctx("sales"), id);
    await deliverSalesOrder(c.ctx("warehouse"), id);
    const { invoiceId } = await invoiceSalesOrder(c.ctx("finance"), id);
    await expect(recordPayment(c.ctx("finance"), invoiceId, { amount: 999_999_999, paidOn: "2026-10-01", method: "cash" })).rejects.toThrow(/exceeds the outstanding/);
    await recordPayment(c.ctx("finance"), invoiceId, { amount: 166_500, paidOn: "2026-10-01", method: "cash" });
    await expect(recordPayment(c.ctx("finance"), invoiceId, { amount: 1, paidOn: "2026-10-01", method: "cash" })).rejects.toThrow(/already fully paid/);
  });

  it("enforces roles in the service layer, not just the UI", async () => {
    await expect(createSalesOrder(c.ctx("warehouse"), order([{ productId: c.widget.id, qty: 1, unitPrice: 1 }]))).rejects.toMatchObject({ code: "forbidden" });
    await expect(adjustStock(c.ctx("sales"), { productId: c.widget.id, warehouseId: c.warehouse.id, countedQty: 1 })).rejects.toMatchObject({ code: "forbidden" });
  });

  it("cancelling a confirmed order releases its reservation", async () => {
    await stockUp(c, [{ productId: c.widget.id, qty: 5, unitCost: 100_000 }]);
    const { id } = await createSalesOrder(c.ctx("sales"), order([{ productId: c.widget.id, qty: 5, unitPrice: 150_000 }]));
    await confirmSalesOrder(c.ctx("sales"), id);
    await cancelSalesOrder(c.ctx("sales"), id);
    const [level] = await db.select().from(stockLevels).where(eq(stockLevels.productId, c.widget.id));
    expect(level.reserved).toBe(0);
  });

  it("rejects a save based on a stale version instead of overwriting", async () => {
    const { id } = await createSalesOrder(c.ctx("sales"), order([{ productId: c.widget.id, qty: 1, unitPrice: 150_000 }]));
    await updateSalesOrder(c.ctx("sales"), id, 1, order([{ productId: c.widget.id, qty: 2, unitPrice: 150_000 }]));
    await expect(updateSalesOrder(c.ctx("sales"), id, 1, order([{ productId: c.widget.id, qty: 3, unitPrice: 150_000 }]))).rejects.toThrow(/changed by someone else/);
  });

  it("stock counts post shrinkage at average cost and stay reconciled", async () => {
    await stockUp(c, [{ productId: c.widget.id, qty: 3, unitCost: 100_001 }]);
    const { delta } = await adjustStock(c.ctx("warehouse"), { productId: c.widget.id, warehouseId: c.warehouse.id, countedQty: 1, note: "broken" });
    expect(delta).toBe(-2);
    const { delta: gain } = await adjustStock(c.ctx("warehouse"), { productId: c.widget.id, warehouseId: c.warehouse.id, countedQty: 4 });
    expect(gain).toBe(3);
    expect(await ledgerInvariants()).toMatchObject({ balanced: true, inventoryReconciled: true, stockMatchesMovements: true });
  });

  it("the database itself rejects unbalanced entries and history rewrites", async () => {
    await stockUp(c, [{ productId: c.widget.id, qty: 1, unitCost: 100 }]);
    await expect(
      db.transaction(async (tx) => {
        const [entry] = await tx.execute<{ id: number }>(sql`INSERT INTO journal_entries (number, entry_date, memo) VALUES ('JV-X', '2026-10-01', 'bad') RETURNING id`);
        await tx.execute(sql`INSERT INTO journal_lines (entry_id, account_id, debit, credit) VALUES (${entry.id}, 1, 100, 0), (${entry.id}, 2, 0, 99)`);
      }),
    ).rejects.toThrow(/does not balance/); // raised by the deferred trigger at COMMIT
    await expect(db.execute(sql`UPDATE journal_lines SET debit = debit + 1 WHERE id = 1`)).rejects.toMatchObject({ cause: { message: expect.stringMatching(/append-only/) } });
    await expect(db.execute(sql`DELETE FROM stock_movements`)).rejects.toMatchObject({ cause: { message: expect.stringMatching(/append-only/) } });
    await expect(db.execute(sql`UPDATE stock_levels SET reserved = on_hand + 1`)).rejects.toMatchObject({ cause: { message: expect.stringMatching(/stock_levels_reserved_le_on_hand/) } });
  });

  it("returns errors users can act on", async () => {
    const err = await createSalesOrder(c.ctx("sales"), order([])).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).message).toMatch(/at least one line/);
  });
});
