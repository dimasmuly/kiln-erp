import { assertMoney, type Money } from "./money";

/**
 * Posting rules: every business event maps to a balanced set of journal
 * lines. Keeping them as pure functions means the accounting is unit-tested
 * without a database, and services cannot "forget" a leg of an entry.
 */

export const ACCOUNTS = {
  cash: "1100",
  receivables: "1200",
  inventory: "1300",
  vatInput: "1400",
  payables: "2100",
  vatOutput: "2200",
  equity: "3100",
  retainedEarnings: "3200",
  revenue: "4100",
  cogs: "5100",
  inventoryAdjustments: "5200",
} as const;

export type AccountCode = (typeof ACCOUNTS)[keyof typeof ACCOUNTS];

export interface PostingLine {
  account: AccountCode;
  debit: Money;
  credit: Money;
}

export class UnbalancedEntryError extends Error {
  constructor(debits: Money, credits: Money) {
    super(`Journal entry does not balance: debits ${debits} ≠ credits ${credits}.`);
    this.name = "UnbalancedEntryError";
  }
}

const dr = (account: AccountCode, amount: Money): PostingLine => ({ account, debit: amount, credit: 0 });
const cr = (account: AccountCode, amount: Money): PostingLine => ({ account, debit: 0, credit: amount });

/** Drops zero lines and verifies the entry balances and every line is one-sided. */
export function finalize(lines: readonly PostingLine[]): PostingLine[] {
  let debits = 0;
  let credits = 0;
  const kept: PostingLine[] = [];
  for (const line of lines) {
    assertMoney(line.debit, "debit");
    assertMoney(line.credit, "credit");
    if (line.debit < 0 || line.credit < 0) throw new RangeError("Journal amounts cannot be negative.");
    if (line.debit > 0 && line.credit > 0) throw new RangeError("A journal line is either a debit or a credit.");
    if (line.debit === 0 && line.credit === 0) continue;
    debits += line.debit;
    credits += line.credit;
    kept.push(line);
  }
  if (debits !== credits) throw new UnbalancedEntryError(debits, credits);
  if (kept.length < 2) throw new RangeError("A journal entry needs at least two non-zero lines.");
  return kept;
}

/** Goods received from a supplier: inventory and input VAT up, payable owed. */
export function goodsReceipt(a: { subtotal: Money; tax: Money; total: Money }): PostingLine[] {
  return finalize([dr(ACCOUNTS.inventory, a.subtotal), dr(ACCOUNTS.vatInput, a.tax), cr(ACCOUNTS.payables, a.total)]);
}

export function supplierPayment(amount: Money): PostingLine[] {
  return finalize([dr(ACCOUNTS.payables, amount), cr(ACCOUNTS.cash, amount)]);
}

/** Goods shipped to a customer: cost leaves inventory and becomes COGS. */
export function delivery(cost: Money): PostingLine[] {
  return finalize([dr(ACCOUNTS.cogs, cost), cr(ACCOUNTS.inventory, cost)]);
}

/** Customer invoiced: receivable for the gross, revenue for the net, VAT owed to the state. */
export function salesInvoice(a: { subtotal: Money; tax: Money; total: Money }): PostingLine[] {
  return finalize([dr(ACCOUNTS.receivables, a.total), cr(ACCOUNTS.revenue, a.subtotal), cr(ACCOUNTS.vatOutput, a.tax)]);
}

export function customerPayment(amount: Money): PostingLine[] {
  return finalize([dr(ACCOUNTS.cash, amount), cr(ACCOUNTS.receivables, amount)]);
}

/** Stock count result. A positive delta is a gain (credit the adjustment expense). */
export function stockAdjustment(valueDelta: Money): PostingLine[] {
  return valueDelta >= 0
    ? finalize([dr(ACCOUNTS.inventory, valueDelta), cr(ACCOUNTS.inventoryAdjustments, valueDelta)])
    : finalize([dr(ACCOUNTS.inventoryAdjustments, -valueDelta), cr(ACCOUNTS.inventory, -valueDelta)]);
}

export function ownerCapital(amount: Money): PostingLine[] {
  return finalize([dr(ACCOUNTS.cash, amount), cr(ACCOUNTS.equity, amount)]);
}
