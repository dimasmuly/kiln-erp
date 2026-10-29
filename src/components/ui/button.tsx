import Link from "next/link";
import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

const variants = {
  primary: "bg-accent text-white hover:bg-accent-hover shadow-sm",
  secondary: "bg-surface text-text border border-line hover:bg-surface-2 hover:border-line-strong shadow-xs",
  ghost: "text-muted hover:text-text hover:bg-surface-2",
  danger: "bg-surface text-bad border border-line hover:bg-bad-soft hover:border-bad/30",
} as const;

const sizes = {
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-9 px-3.5 text-sm gap-2",
} as const;

export interface ButtonStyle {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
}

export function buttonClass({ variant = "secondary", size = "md" }: ButtonStyle, className?: string) {
  return cn(
    "inline-flex shrink-0 items-center justify-center rounded-lg font-medium whitespace-nowrap transition-colors",
    "disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4",
    variants[variant],
    sizes[size],
    className,
  );
}

export function Button({ variant, size, className, ...props }: ComponentProps<"button"> & ButtonStyle) {
  return <button className={buttonClass({ variant, size }, className)} {...props} />;
}

export function LinkButton({ variant, size, className, ...props }: ComponentProps<typeof Link> & ButtonStyle) {
  return <Link className={buttonClass({ variant, size }, className)} {...props} />;
}
