import { inArray, sql } from "drizzle-orm";

import { finalize, type PostingLine } from "../../domain/posting";
import type { Ctx } from "../context";
import type { Executor, Tx } from "../db/client";
import { accounts, auditLog, documentSequences, journalEntries, journalLines } from "../db/schema";
import { AppError } from "../errors";

export type DocumentPrefix = "SO" | "INV" | "PO" | "JV" | "ADJ";

/**
 * Next gap-free number for a document type and year, e.g. `INV-2026-00042`.
 * The upsert row-locks the sequence until the surrounding transaction ends,
 * so a rolled-back transaction never burns a number. Auditors expect
 * invoice numbers without gaps; this is why the sequence lives in
 * PostgreSQL and not in an EmberKV counter.
 */
export async function nextDocumentNumber(tx: Tx, prefix: DocumentPrefix, date: string): Promise<string> {
  const key = `${prefix}-${date.slice(0, 4)}`;
  const [row] = await tx
    .insert(documentSequences)
    .values({ key, last: 1 })
    .onConflictDoUpdate({ target: documentSequences.key, set: { last: sql`${documentSequences.last} + 1` } })
    .returning({ last: documentSequences.last });
  return `${key}-${String(row.last).padStart(5, "0")}`;
}

export async function audit(
  tx: Executor,
  ctx: Ctx,
  entry: { action: string; entity: string; entityId: string | number; summary: string; data?: unknown },
): Promise<void> {
  await tx.insert(auditLog).values({
    at: ctx.now,
    actorId: ctx.actor.id,
    action: entry.action,
    entity: entry.entity,
    entityId: String(entry.entityId),
    summary: entry.summary,
    data: entry.data ?? null,
  });
}

/**
 * Writes a journal entry. `finalize` has already proven the lines balance;
 * the deferred trigger in PostgreSQL checks again at commit.
 */
export async function postJournal(
  tx: Tx,
  ctx: Ctx,
  entry: { date: string; memo: string; source: string | null; lines: PostingLine[] },
): Promise<string> {
  const lines = finalize(entry.lines);
  const codes = [...new Set(lines.map((l) => l.account))];
  const rows = await tx.select({ id: accounts.id, code: accounts.code }).from(accounts).where(inArray(accounts.code, codes));
  const idByCode = new Map(rows.map((r) => [r.code, r.id]));
  for (const code of codes) {
    if (!idByCode.has(code)) throw new AppError("validation", `Account ${code} is missing from the chart of accounts.`);
  }

  const number = await nextDocumentNumber(tx, "JV", entry.date);
  const [created] = await tx
    .insert(journalEntries)
    .values({ number, entryDate: entry.date, memo: entry.memo, source: entry.source, createdBy: ctx.actor.id, createdAt: ctx.now })
    .returning({ id: journalEntries.id });
  await tx.insert(journalLines).values(
    lines.map((l) => ({ entryId: created.id, accountId: idByCode.get(l.account)!, debit: l.debit, credit: l.credit })),
  );
  return number;
}

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
