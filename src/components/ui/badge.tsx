import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

const tones = {
  neutral: "bg-surface-2 text-muted ring-line",
  accent: "bg-accent-soft text-accent-text ring-accent/20",
  ok: "bg-ok-soft text-ok ring-ok/20",
  warn: "bg-warn-soft text-warn ring-warn/25",
  bad: "bg-bad-soft text-bad ring-bad/20",
  info: "bg-info-soft text-info ring-info/20",
  violet: "bg-violet-soft text-violet ring-violet/20",
} as const;

export type Tone = keyof typeof tones;

export function Badge({ tone = "neutral", dot, children, className }: { tone?: Tone; dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[12px] font-medium ring-1 ring-inset whitespace-nowrap", tones[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

const STATUS_TONES: Record<string, Tone> = {
  draft: "neutral",
  confirmed: "info",
  ordered: "info",
  delivered: "violet",
  received: "violet",
  invoiced: "warn",
  open: "warn",
  paid: "ok",
  cancelled: "bad",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={STATUS_TONES[status] ?? "neutral"} dot>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}
