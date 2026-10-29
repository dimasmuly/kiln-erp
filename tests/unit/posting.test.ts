import { describe, expect, it } from "vitest";

import {
  ACCOUNTS,
  customerPayment,
  delivery,
  finalize,
  goodsReceipt,
  salesInvoice,
  stockAdjustment,
  supplierPayment,
  UnbalancedEntryError,
  type PostingLine,
} from "@/domain/posting";

const totals = (lines: PostingLine[]) => ({
  debit: lines.reduce((n, l) => n + l.debit, 0),
  credit: lines.reduce((n, l) => n + l.credit, 0),
});

describe("posting rules", () => {
  const doc = { subtotal: 1_000_000, tax: 110_000, total: 1_110_000 };

  it.each([
    ["goods receipt", goodsReceipt(doc)],
    ["supplier payment", supplierPayment(doc.total)],
    ["delivery", delivery(750_000)],
    ["sales invoice", salesInvoice(doc)],
    ["customer payment", customerPayment(500_000)],
    ["stock gain", stockAdjustment(12_345)],
    ["stock loss", stockAdjustment(-12_345)],
  ])("%s balances", (_name, lines) => {
    const t = totals(lines);
    expect(t.debit).toBe(t.credit);
    expect(t.debit).toBeGreaterThan(0);
  });

  it("an invoice splits revenue from VAT owed", () => {
    expect(salesInvoice(doc)).toEqual([
      { account: ACCOUNTS.receivables, debit: 1_110_000, credit: 0 },
      { account: ACCOUNTS.revenue, debit: 0, credit: 1_000_000 },
      { account: ACCOUNTS.vatOutput, debit: 0, credit: 110_000 },
    ]);
  });

  it("drops zero lines (a zero-rated purchase has no VAT leg)", () => {
    expect(goodsReceipt({ subtotal: 500, tax: 0, total: 500 })).toHaveLength(2);
  });

  it("a stock loss credits inventory", () => {
    expect(stockAdjustment(-100)).toEqual([
      { account: ACCOUNTS.inventoryAdjustments, debit: 100, credit: 0 },
      { account: ACCOUNTS.inventory, debit: 0, credit: 100 },
    ]);
  });

  it("refuses unbalanced, two-sided or single-line entries", () => {
    expect(() => finalize([{ account: ACCOUNTS.cash, debit: 10, credit: 0 }, { account: ACCOUNTS.equity, debit: 0, credit: 9 }])).toThrow(UnbalancedEntryError);
    expect(() => finalize([{ account: ACCOUNTS.cash, debit: 10, credit: 10 }])).toThrow(RangeError);
    expect(() => finalize([{ account: ACCOUNTS.cash, debit: 0, credit: 0 }])).toThrow(RangeError);
  });
});
