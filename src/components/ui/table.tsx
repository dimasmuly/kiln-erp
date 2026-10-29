import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/cn";

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="border-b border-line bg-surface-2/60 text-left">{children}</thead>;
}

export function TH({ numeric, className, ...props }: ComponentProps<"th"> & { numeric?: boolean }) {
  return (
    <th
      className={cn("px-4 py-2.5 text-[12px] font-medium tracking-wide whitespace-nowrap text-subtle uppercase first:pl-5 last:pr-5", numeric && "text-right", className)}
      {...props}
    />
  );
}

export function TR({ className, ...props }: ComponentProps<"tr">) {
  return <tr className={cn("border-b border-line last:border-0 hover:bg-surface-2/70", className)} {...props} />;
}

export function TD({ numeric, className, ...props }: ComponentProps<"td"> & { numeric?: boolean }) {
  return <td className={cn("px-4 py-2.5 align-middle first:pl-5 last:pr-5", numeric && "num text-right whitespace-nowrap", className)} {...props} />;
}

export function TFoot({ children }: { children: ReactNode }) {
  return <tfoot className="border-t border-line-strong bg-surface-2/60 font-medium">{children}</tfoot>;
}
