import { assertMoney, mulDivRound, sum, type Money } from "./money";

/** PPN (Indonesian VAT) standard effective rate, in basis points. */
export const DEFAULT_TAX_RATE_BP = 1100;
export const MAX_LINE_QTY = 1_000_000;
export const MAX_LINES = 200;

export interface LineInput {
  productId: number;
  qty: number;
  /** Unit price (sales) or unit cost (purchasing), in minor units. */
  unitAmount: Money;
}

export interface PricedLine extends LineInput {
  lineTotal: Money;
}

export interface OrderTotals {
  lines: PricedLine[];
  subtotal: Money;
  tax: Money;
  total: Money;
}

export class OrderValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderValidationError";
  }
}

/**
 * Prices an order. Tax is computed once on the subtotal (document-level PPN),
 * not per line, so the printed tax always equals rate × subtotal.
 */
export function priceOrder(lines: readonly LineInput[], taxRateBp: number): OrderTotals {
  if (lines.length === 0) throw new OrderValidationError("An order needs at least one line.");
  if (lines.length > MAX_LINES) throw new OrderValidationError(`An order can have at most ${MAX_LINES} lines.`);
  if (!Number.isInteger(taxRateBp) || taxRateBp < 0 || taxRateBp > 10_000) {
    throw new OrderValidationError("Tax rate must be between 0% and 100%.");
  }

  const seen = new Set<number>();
  const priced = lines.map((line) => {
    if (seen.has(line.productId)) {
      throw new OrderValidationError("Each product may appear only once per order; adjust the quantity instead.");
    }
    seen.add(line.productId);
    if (!Number.isInteger(line.qty) || line.qty <= 0 || line.qty > MAX_LINE_QTY) {
      throw new OrderValidationError(`Quantity must be a whole number between 1 and ${MAX_LINE_QTY}.`);
    }
    assertMoney(line.unitAmount, "unit amount");
    if (line.unitAmount < 0) throw new OrderValidationError("Prices cannot be negative.");
    const lineTotal = line.qty * line.unitAmount;
    assertMoney(lineTotal, "line total");
    return { ...line, lineTotal };
  });

  const subtotal = sum(priced.map((l) => l.lineTotal));
  const tax = mulDivRound(subtotal, taxRateBp, 10_000);
  return { lines: priced, subtotal, tax, total: subtotal + tax };
}

export function formatTaxRate(bp: number): string {
  return `${(bp / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
}
