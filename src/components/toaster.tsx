"use client";

import { CheckCircle2, X, XCircle } from "lucide-react";
import { createContext, use, useCallback, useEffect, useState, type ReactNode } from "react";

import { cn } from "@/lib/cn";

interface Toast {
  id: number;
  tone: "ok" | "bad";
  message: string;
}

const ToastContext = createContext<((tone: Toast["tone"], message: string) => void) | null>(null);

/**
 * Lives in the app layout, above every page, so a toast survives the
 * re-render that follows an action (the button that triggered it is often
 * gone by then: a confirmed order has no Confirm button).
 */
export function Toaster({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const show = useCallback((tone: Toast["tone"], message: string) => {
    setToasts((list) => [...list.slice(-2), { id: Date.now() + Math.random(), tone, message }]);
  }, []);
  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  return (
    <ToastContext value={show}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-full max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  useEffect(() => {
    if (toast.tone !== "ok") return;
    const timer = setTimeout(() => onDismiss(toast.id), 5000);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);
  const Icon = toast.tone === "ok" ? CheckCircle2 : XCircle;
  return (
    <div
      role={toast.tone === "ok" ? "status" : "alert"}
      className={cn("pointer-events-auto flex items-start gap-3 rounded-xl border bg-surface px-4 py-3 text-sm shadow-lg", toast.tone === "ok" ? "border-ok/30" : "border-bad/30")}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", toast.tone === "ok" ? "text-ok" : "text-bad")} aria-hidden />
      <p className="flex-1 text-text">{toast.message}</p>
      <button type="button" onClick={() => onDismiss(toast.id)} className="text-subtle hover:text-text" aria-label="Dismiss">
        <X className="size-4" />
      </button>
    </div>
  );
}

export function useToast() {
  const show = use(ToastContext);
  if (!show) throw new Error("useToast must be used inside <Toaster>");
  return show;
}
