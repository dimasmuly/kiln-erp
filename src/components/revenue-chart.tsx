"use client";

import { useState } from "react";

import { cn } from "@/lib/cn";
import { dateShortLabel, money, moneyCompact, percent } from "@/lib/format";

export interface WeekPoint {
  week: string;
  revenue: number;
  grossProfit: number;
}

/** Rounds up to 1, 2 or 5 × 10^k so axis ticks are clean numbers. */
function niceStep(max: number, ticks: number): number {
  const raw = max / ticks;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].find((m) => m * magnitude >= raw)!;
  return step * magnitude;
}

/**
 * Weekly invoiced revenue (one series, so the card title names it and no
 * legend is drawn). Columns ≤ 24px with a 4px rounded cap, hairline grid,
 * one direct label on the latest week, per-column hover/focus tooltip, and
 * a table view so no value is gated behind hovering.
 */
export function RevenueChart({ data }: { data: WeekPoint[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.revenue));
  const step = niceStep(max, 4);
  const top = step * Math.ceil(max / step);
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const last = data.length - 1;

  return (
    <div>
      <div className="relative flex h-60 pt-6">
        <div className="relative w-16 shrink-0" aria-hidden>
          {ticks.map((t) => (
            <span key={t} className="num absolute right-3 -translate-y-1/2 text-[11px] text-subtle" style={{ bottom: `${(t / top) * 100}%` }}>
              {t === 0 ? "0" : moneyCompact(t).replace("Rp ", "")}
            </span>
          ))}
        </div>
        <div className="relative flex-1">
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 h-px bg-chart-grid" style={{ bottom: `${(t / top) * 100}%` }} aria-hidden />
          ))}
          <div className="absolute inset-0 flex" role="list" aria-label="Revenue by week">
            {data.map((d, i) => {
              const height = (d.revenue / top) * 100;
              return (
                <div key={d.week} role="listitem" className="relative flex flex-1 justify-center">
                  <button
                    type="button"
                    className="group absolute inset-0 flex cursor-default items-end justify-center focus:outline-none"
                    aria-label={`Week of ${dateShortLabel(d.week)}: ${money(d.revenue)}`}
                    onPointerEnter={() => setActive(i)}
                    onPointerLeave={() => setActive(null)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                  >
                    <span
                      className={cn(
                        "w-[60%] max-w-6 rounded-t-[4px] bg-chart-1 transition-opacity",
                        active !== null && active !== i && "opacity-45",
                        "group-focus-visible:ring-2 group-focus-visible:ring-focus group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-surface",
                      )}
                      style={{ height: `${height}%` }}
                    />
                  </button>
                  {i === last && active === null && d.revenue > 0 && (
                    <span className="num pointer-events-none absolute -translate-y-full pb-1 text-[11px] font-medium whitespace-nowrap text-muted" style={{ bottom: `${height}%` }}>
                      {moneyCompact(d.revenue)}
                    </span>
                  )}
                  {active === i && (
                    <div
                      className="pointer-events-none absolute z-10 w-48 -translate-y-full rounded-lg border border-line bg-surface px-3 py-2 text-[12px] shadow-lg"
                      style={{ bottom: `calc(${height}% + 8px)`, ...(i > data.length / 2 ? { right: "30%" } : { left: "30%" }) }}
                    >
                      <p className="font-medium text-text">Week of {dateShortLabel(d.week)}</p>
                      <dl className="num mt-1 space-y-0.5 text-muted">
                        <div className="flex justify-between gap-3">
                          <dt className="flex items-center gap-1.5">
                            <span className="size-2 rounded-[2px] bg-chart-1" aria-hidden /> Revenue
                          </dt>
                          <dd className="text-text">{money(d.revenue)}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt>Gross profit</dt>
                          <dd className="text-text">{money(d.grossProfit)}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt>Margin</dt>
                          <dd className="text-text">{d.revenue ? percent(d.grossProfit / d.revenue) : "—"}</dd>
                        </div>
                      </dl>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="ml-16 flex pt-2" aria-hidden>
        {data.map((d, i) => (
          <span key={d.week} className={cn("num flex-1 text-center text-[11px] text-subtle", i % 2 === 1 && "hidden sm:block")}>
            {dateShortLabel(d.week)}
          </span>
        ))}
      </div>
      <details className="mt-3 text-[13px]">
        <summary className="cursor-pointer text-muted hover:text-text">View as table</summary>
        <table className="num mt-2 w-full text-[13px]">
          <thead className="text-left text-subtle">
            <tr>
              <th className="py-1 font-medium">Week of</th>
              <th className="py-1 text-right font-medium">Revenue</th>
              <th className="py-1 text-right font-medium">Gross profit</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.week} className="border-t border-line">
                <td className="py-1">{dateShortLabel(d.week)}</td>
                <td className="py-1 text-right">{money(d.revenue)}</td>
                <td className="py-1 text-right">{money(d.grossProfit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
