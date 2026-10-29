/**
 * Document lifecycles as explicit state machines. Services call
 * `assertTransition` inside the same transaction that holds the document's
 * row lock, so two concurrent "Deliver" clicks cannot both pass the check.
 */

export const SALES_ORDER_STATUSES = ["draft", "confirmed", "delivered", "invoiced", "paid", "cancelled"] as const;
export type SalesOrderStatus = (typeof SALES_ORDER_STATUSES)[number];

export const PURCHASE_ORDER_STATUSES = ["draft", "ordered", "received", "paid", "cancelled"] as const;
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

const SALES_TRANSITIONS: Record<SalesOrderStatus, readonly SalesOrderStatus[]> = {
  draft: ["confirmed", "cancelled"],
  confirmed: ["delivered", "cancelled"],
  delivered: ["invoiced"],
  invoiced: ["paid"],
  paid: [],
  cancelled: [],
};

const PURCHASE_TRANSITIONS: Record<PurchaseOrderStatus, readonly PurchaseOrderStatus[]> = {
  draft: ["ordered", "cancelled"],
  ordered: ["received", "cancelled"],
  received: ["paid"],
  paid: [],
  cancelled: [],
};

export class TransitionError extends Error {
  constructor(
    readonly document: string,
    readonly from: string,
    readonly to: string,
  ) {
    super(`${document} cannot move from "${from}" to "${to}".`);
    this.name = "TransitionError";
  }
}

export function canTransitionSales(from: SalesOrderStatus, to: SalesOrderStatus): boolean {
  return SALES_TRANSITIONS[from].includes(to);
}

export function canTransitionPurchase(from: PurchaseOrderStatus, to: PurchaseOrderStatus): boolean {
  return PURCHASE_TRANSITIONS[from].includes(to);
}

export function assertSalesTransition(number: string, from: SalesOrderStatus, to: SalesOrderStatus): void {
  if (!canTransitionSales(from, to)) throw new TransitionError(number, from, to);
}

export function assertPurchaseTransition(number: string, from: PurchaseOrderStatus, to: PurchaseOrderStatus): void {
  if (!canTransitionPurchase(from, to)) throw new TransitionError(number, from, to);
}

export type AgingBucket = "current" | "1-30" | "31-60" | "61-90" | "90+";
export const AGING_BUCKETS: readonly AgingBucket[] = ["current", "1-30", "31-60", "61-90", "90+"];

/** Receivables aging by days past due. Dates are ISO `YYYY-MM-DD` strings. */
export function agingBucket(dueDate: string, asOf: string): AgingBucket {
  const days = Math.floor((Date.parse(asOf) - Date.parse(dueDate)) / 86_400_000);
  if (days <= 0) return "current";
  if (days <= 30) return "1-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}
