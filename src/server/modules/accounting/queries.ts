import { asc, count, desc, eq, ilike, or, sql } from "drizzle-orm";

import { authorize, type Ctx } from "../../context";
import { db } from "../../db/client";
import { accounts, invoices, journalEntries, journalLines, purchaseOrders, salesOrders, users } from "../../db/schema";
import { notFound } from "../../errors";
import { PAGE_SIZE } from "../sales/queries";

export async function listJournalEntries(ctx: Ctx, opts: { q?: string; page?: number }) {
  authorize(ctx, "accounting.read");
  const where = opts.q ? or(ilike(journalEntries.number, `%${opts.q}%`), ilike(journalEntries.source, `%${opts.q}%`), ilike(journalEntries.memo, `%${opts.q}%`)) : undefined;
  const page = Math.max(1, opts.page ?? 1);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: journalEntries.id,
        number: journalEntries.number,
        entryDate: journalEntries.entryDate,
        memo: journalEntries.memo,
        source: journalEntries.source,
        amount: sql<number>`(SELECT sum(${journalLines.debit}) FROM ${journalLines} WHERE ${journalLines.entryId} = ${journalEntries.id})`.mapWith(Number),
        accounts: sql<string>`(SELECT string_agg(DISTINCT a.code, ', ' ORDER BY a.code) FROM ${journalLines} l JOIN ${accounts} a ON a.id = l.account_id WHERE l.entry_id = ${journalEntries.id})`,
      })
      .from(journalEntries)
      .where(where)
      .orderBy(desc(journalEntries.entryDate), desc(journalEntries.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(journalEntries).where(where),
  ]);
  return { rows, total, page, pageSize: PAGE_SIZE };
}

export async function getJournalEntry(ctx: Ctx, id: number) {
  authorize(ctx, "accounting.read");
  const [entry] = await db
    .select({ entry: journalEntries, createdBy: users.name })
    .from(journalEntries)
    .leftJoin(users, eq(users.id, journalEntries.createdBy))
    .where(eq(journalEntries.id, id));
  if (!entry) throw notFound("Journal entry");
  const lines = await db
    .select({ id: journalLines.id, code: accounts.code, name: accounts.name, type: accounts.type, debit: journalLines.debit, credit: journalLines.credit })
    .from(journalLines)
    .innerJoin(accounts, eq(accounts.id, journalLines.accountId))
    .where(eq(journalLines.entryId, id))
    .orderBy(asc(journalLines.id));
  return { ...entry, lines, sourceHref: await sourceHref(entry.entry.source) };
}

/** Link from a journal entry back to the business document that posted it. */
async function sourceHref(source: string | null): Promise<string | null> {
  if (!source) return null;
  if (source.startsWith("SO-")) {
    const [row] = await db.select({ id: salesOrders.id }).from(salesOrders).where(eq(salesOrders.number, source));
    return row ? `/sales/orders/${row.id}` : null;
  }
  if (source.startsWith("INV-")) {
    const [row] = await db.select({ id: invoices.id }).from(invoices).where(eq(invoices.number, source));
    return row ? `/sales/invoices/${row.id}` : null;
  }
  if (source.startsWith("PO-")) {
    const [row] = await db.select({ id: purchaseOrders.id }).from(purchaseOrders).where(eq(purchaseOrders.number, source));
    return row ? `/purchasing/orders/${row.id}` : null;
  }
  if (source.startsWith("ADJ-")) return "/inventory/movements?kind=adjustment";
  return null;
}

/**
 * Trial balance as of a date. Debit-normal accounts (assets, expenses) show
 * positive balances on the debit side; credit-normal ones on the credit side.
 */
export async function trialBalance(ctx: Ctx, asOf: string) {
  authorize(ctx, "accounting.read");
  const rows = await db
    .select({
      code: accounts.code,
      name: accounts.name,
      type: accounts.type,
      debits: sql<number>`coalesce(sum(${journalLines.debit}) FILTER (WHERE ${journalEntries.entryDate} <= ${asOf}), 0)`.mapWith(Number),
      credits: sql<number>`coalesce(sum(${journalLines.credit}) FILTER (WHERE ${journalEntries.entryDate} <= ${asOf}), 0)`.mapWith(Number),
    })
    .from(accounts)
    .leftJoin(journalLines, eq(journalLines.accountId, accounts.id))
    .leftJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
    .groupBy(accounts.id)
    .orderBy(asc(accounts.code));

  const lines = rows.map((r) => {
    const net = r.debits - r.credits;
    return { ...r, debitBalance: net > 0 ? net : 0, creditBalance: net < 0 ? -net : 0 };
  });
  const totalDebit = lines.reduce((n, l) => n + l.debitBalance, 0);
  const totalCredit = lines.reduce((n, l) => n + l.creditBalance, 0);
  const revenue = lines.filter((l) => l.type === "revenue").reduce((n, l) => n + l.credits - l.debits, 0);
  const expenses = lines.filter((l) => l.type === "expense").reduce((n, l) => n + l.debits - l.credits, 0);
  return { lines, totalDebit, totalCredit, balanced: totalDebit === totalCredit, revenue, expenses, netIncome: revenue - expenses };
}
