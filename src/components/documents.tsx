import { Check } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { date, dateTime } from "@/lib/format";
import { AppError } from "@/server/errors";

/** Awaits a query, turning "not found" into the route's 404 page. */
export async function orNotFound<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (err) {
    if (err instanceof AppError && err.code === "not_found") notFound();
    throw err;
  }
}

export function Timeline({ steps, current, cancelled }: { steps: { key: string; label: string }[]; current: string; cancelled?: boolean }) {
  const index = steps.findIndex((s) => s.key === current);
  return (
    <ol className="flex items-center gap-2 overflow-x-auto px-5 py-4" aria-label="Progress">
      {steps.map((step, i) => {
        const done = !cancelled && i <= index;
        return (
          <li key={step.key} className="flex shrink-0 items-center gap-2">
            {i > 0 && <span className={cn("h-px w-6 sm:w-10", done ? "bg-accent" : "bg-line-strong")} aria-hidden />}
            <span
              className={cn(
                "grid size-6 place-items-center rounded-full text-[11px] font-semibold ring-1",
                done ? "bg-accent text-white ring-accent" : "bg-surface text-subtle ring-line-strong",
              )}
            >
              {done ? <Check className="size-3.5" aria-hidden /> : i + 1}
            </span>
            <span className={cn("text-[13px] font-medium", i === index && !cancelled ? "text-text" : "text-muted")} aria-current={i === index ? "step" : undefined}>
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function HistoryCard({ history }: { history: { at: Date; summary: string; actor: string | null }[] }) {
  return (
    <Card>
      <CardHeader title="History" description="From the audit log" />
      <ol className="space-y-3 px-5 py-4">
        {history.map((h, i) => (
          <li key={i} className="relative flex gap-3 text-[13px]">
            <span className="mt-1.5 size-2 shrink-0 rounded-full bg-line-strong" aria-hidden />
            <div>
              <p>{h.summary}</p>
              <p className="text-[12px] text-muted">
                {h.actor ?? "System"} · {dateTime(h.at)}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

export function LedgerCard({ entries }: { entries: { id: number; number: string; entryDate: string; memo: string }[] }) {
  return (
    <Card>
      <CardHeader title="Ledger postings" description="Journal entries created by this document" />
      {entries.length === 0 ? (
        <p className="px-5 py-4 text-[13px] text-muted">Nothing posted yet. Drafts and confirmations do not touch the ledger.</p>
      ) : (
        <ul className="divide-y divide-line">
          {entries.map((e) => (
            <li key={e.id}>
              <Link href={`/accounting/journal/${e.id}`} className="block px-5 py-2.5 hover:bg-surface-2">
                <span className="flex justify-between gap-2 text-[13px]">
                  <span className="font-medium">{e.number}</span>
                  <span className="text-muted">{date(e.entryDate)}</span>
                </span>
                <span className="block truncate text-[12px] text-muted">{e.memo}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
