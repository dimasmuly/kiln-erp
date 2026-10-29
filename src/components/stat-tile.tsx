import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export function StatTile({
  label,
  value,
  footer,
  delta,
  href,
}: {
  label: string;
  value: string;
  footer?: ReactNode;
  /** Signed change vs a named period; `goodWhenUp` decides the color. */
  delta?: { ratio: number; period: string; goodWhenUp?: boolean };
  href?: string;
}) {
  const up = (delta?.ratio ?? 0) >= 0;
  const good = up === (delta?.goodWhenUp ?? true);
  const Wrapper = href ? "a" : "div";
  return (
    <Wrapper href={href} className={cn("block rounded-xl border border-line bg-surface px-5 py-4 shadow-xs", href && "transition-colors hover:border-line-strong")}>
      <p className="text-[13px] font-medium text-muted">{label}</p>
      <p className="mt-1.5 text-[26px] leading-none font-semibold tracking-tight">{value}</p>
      <div className="mt-2.5 flex min-h-5 flex-wrap items-center gap-2 text-[12px] text-muted">
        {delta && Number.isFinite(delta.ratio) && (
          <span className={cn("inline-flex items-center gap-0.5 font-medium", good ? "text-ok" : "text-bad")}>
            {up ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />}
            {up ? "+" : "−"}
            {Math.abs(delta.ratio * 100).toFixed(1)}%
            <span className="font-normal text-muted">vs {delta.period}</span>
          </span>
        )}
        {footer}
      </div>
    </Wrapper>
  );
}
