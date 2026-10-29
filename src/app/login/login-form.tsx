"use client";

import { useActionState, useRef } from "react";

import { Alert } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { loginAction } from "@/server/actions/auth";

const DEMO = [
  { email: "admin@kiln.test", role: "Administrator", scope: "Everything" },
  { email: "sales@kiln.test", role: "Sales", scope: "Orders & customers" },
  { email: "warehouse@kiln.test", role: "Warehouse", scope: "Deliveries, receipts, counts" },
  { email: "finance@kiln.test", role: "Finance", scope: "Invoices, payments, ledger" },
  { email: "purchasing@kiln.test", role: "Purchasing", scope: "Purchase orders" },
];
const DEMO_PASSWORD = "kiln-demo-2026";

export function LoginForm({ next, notice }: { next: string; notice: string | null }) {
  const [state, action] = useActionState(loginAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} id="login-form" action={action} className="mt-8 space-y-4">
      <input type="hidden" name="next" value={next} />
      {notice && <Alert tone="info">{notice}</Alert>}
      {state && !state.ok && <Alert tone="bad">{state.error}</Alert>}
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <SubmitButton className="w-full" pendingLabel="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}

/** Demo deployments only (DEMO_MODE=true): one-click sign-in as each role. */
export function DemoAccounts() {
  const fill = (email: string) => {
    const form = document.getElementById("login-form") as HTMLFormElement | null;
    if (!form) return;
    (form.elements.namedItem("email") as HTMLInputElement).value = email;
    (form.elements.namedItem("password") as HTMLInputElement).value = DEMO_PASSWORD;
    form.requestSubmit();
  };
  return (
    <div className="mt-8 rounded-xl border border-line bg-surface p-1.5">
      <p className="px-2.5 pt-1.5 pb-2 text-[12px] font-medium text-muted">
        Demo accounts · password <code className="rounded bg-surface-2 px-1 py-0.5 text-text">{DEMO_PASSWORD}</code>
      </p>
      <ul>
        {DEMO.map((d) => (
          <li key={d.email}>
            <button type="button" onClick={() => fill(d.email)} className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-surface-2">
              <span className="min-w-0">
                <span className="block text-[13px] font-medium">{d.role}</span>
                <span className="block truncate text-[12px] text-muted">{d.email}</span>
              </span>
              <span className="shrink-0 text-[12px] text-subtle">{d.scope}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
