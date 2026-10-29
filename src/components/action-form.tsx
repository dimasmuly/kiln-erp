"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, type ReactNode } from "react";

import { useToast } from "@/components/toaster";
import { Alert } from "@/components/ui/feedback";
import type { ActionResult } from "@/server/actions/result";

type Action = (prev: ActionResult, form: FormData) => Promise<ActionResult>;

/**
 * A form bound to a server action. `idem` is an idempotency key minted by the
 * server when the page rendered; the action uses it to make the submission
 * exactly-once (see server/kv/idempotency.ts).
 *
 * With `feedback="toast"` the result is shown by the layout-level Toaster and
 * the page is then refreshed, so the message survives even when the refresh
 * removes this form (a confirmed order no longer has a Confirm button).
 */
export function ActionForm({
  action,
  idem,
  hidden,
  confirmMessage,
  feedback = "inline",
  className,
  children,
}: {
  action: Action;
  idem?: string;
  hidden?: Record<string, string | number>;
  confirmMessage?: string;
  feedback?: "inline" | "toast";
  className?: string;
  children: ReactNode;
}) {
  const [state, formAction] = useActionState(action, null);
  const toast = useToast();
  const router = useRouter();

  useEffect(() => {
    if (feedback !== "toast" || !state) return;
    if (state.ok) {
      if (state.message) toast("ok", state.message);
      router.refresh();
    } else {
      toast("bad", state.error);
    }
  }, [state, feedback, toast, router]);

  return (
    <form
      action={formAction}
      className={className}
      onSubmit={confirmMessage ? (e) => !window.confirm(confirmMessage) && e.preventDefault() : undefined}
    >
      {idem && <input type="hidden" name="_idem" value={idem} />}
      {Object.entries(hidden ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={String(value)} />
      ))}
      {feedback === "inline" && state && !state.ok && (
        <Alert tone="bad" className="mb-4">
          {state.error}
        </Alert>
      )}
      {feedback === "inline" && state?.ok && state.message && (
        <Alert tone="ok" className="mb-4">
          {state.message}
        </Alert>
      )}
      {children}
    </form>
  );
}
