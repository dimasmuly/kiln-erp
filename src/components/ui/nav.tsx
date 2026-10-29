import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/cn";

export interface TabItem {
  label: string;
  href: string;
  active: boolean;
  count?: number;
}

/** Filter tabs that are plain links, so every filter state has a shareable URL. */
export function LinkTabs({ items }: { items: TabItem[] }) {
  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto border-b border-line px-3" aria-label="Filters">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={cn(
            "flex items-center gap-2 border-b-2 px-2.5 py-2.5 text-[13px] font-medium whitespace-nowrap transition-colors",
            item.active ? "border-accent text-text" : "border-transparent text-muted hover:text-text",
          )}
        >
          {item.label}
          {item.count !== undefined && (
            <span className={cn("num rounded-md px-1.5 py-px text-[11px]", item.active ? "bg-accent-soft text-accent-text" : "bg-surface-2 text-subtle")}>
              {item.count}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}

export function Pagination({ page, pageSize, total, href }: { page: number; pageSize: number; total: number; href: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const link = "inline-flex h-8 items-center gap-1 rounded-lg border border-line bg-surface px-2.5 text-[13px] font-medium hover:bg-surface-2";
  return (
    <div className="flex items-center justify-between border-t border-line px-5 py-3 text-[13px] text-muted">
      <span className="num">
        {from}–{to} of {total}
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link className={link} href={href(page - 1)}>
            <ChevronLeft className="size-4" /> Previous
          </Link>
        ) : null}
        {page < pages ? (
          <Link className={link} href={href(page + 1)}>
            Next <ChevronRight className="size-4" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
