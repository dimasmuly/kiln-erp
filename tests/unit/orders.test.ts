import { describe, expect, it } from "vitest";

import { OrderValidationError, priceOrder } from "@/domain/orders";

describe("priceOrder", () => {
  it("totals lines and applies document-level tax", () => {
    const totals = priceOrder(
      [
        { productId: 1, qty: 3, unitAmount: 125_000_00 },
        { productId: 2, qty: 1, unitAmount: 49_900_00 },
      ],
      1100,
    );
    expect(totals.subtotal).toBe(424_900_00);
    expect(totals.tax).toBe(46_739_00);
    expect(totals.total).toBe(totals.subtotal + totals.tax);
    expect(totals.lines.map((l) => l.lineTotal)).toEqual([375_000_00, 49_900_00]);
  });

  it("supports zero-rated documents", () => {
    expect(priceOrder([{ productId: 1, qty: 2, unitAmount: 500 }], 0)).toMatchObject({ subtotal: 1000, tax: 0, total: 1000 });
  });

  it.each([
    ["no lines", [], 1100],
    ["duplicate product", [{ productId: 1, qty: 1, unitAmount: 1 }, { productId: 1, qty: 2, unitAmount: 1 }], 1100],
    ["zero quantity", [{ productId: 1, qty: 0, unitAmount: 1 }], 1100],
    ["fractional quantity", [{ productId: 1, qty: 1.5, unitAmount: 1 }], 1100],
    ["negative price", [{ productId: 1, qty: 1, unitAmount: -1 }], 1100],
    ["tax over 100%", [{ productId: 1, qty: 1, unitAmount: 1 }], 10_001],
  ])("rejects %s", (_name, lines, rate) => {
    expect(() => priceOrder(lines, rate)).toThrow(OrderValidationError);
  });
});
