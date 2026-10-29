import { BookCheck, Boxes, LockKeyhole, Zap } from "lucide-react";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Brand } from "@/components/shell/sidebar";
import { Skeleton } from "@/components/ui/feedback";
import { getSession } from "@/server/auth/session";
import { env } from "@/server/env";

import { DemoAccounts, LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

const HIGHLIGHTS = [
  { icon: BookCheck, title: "Double-entry by construction", body: "Every delivery, invoice and payment posts a balanced journal entry, which PostgreSQL verifies at commit." },
  { icon: Boxes, title: "No overselling", body: "Stock is reserved atomically on confirmation, and the database rejects any write that would go negative." },
  { icon: Zap, title: "Powered by EmberKV", body: "Sessions, login throttling, exactly-once submits and edit locks are served by EmberKV, a storage engine written in Rust." },
];

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-sidebar p-12 text-sidebar-text lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -top-40 -left-40 size-[34rem] rounded-full bg-[radial-gradient(circle,rgba(247,103,7,0.28),transparent_65%)]" />
        <div className="pointer-events-none absolute -right-24 bottom-0 size-[26rem] rounded-full bg-[radial-gradient(circle,rgba(201,42,42,0.18),transparent_65%)]" />
        <div className="relative -ml-3">
          <Brand />
        </div>
        <div className="relative mt-auto max-w-md">
          <h1 className="text-3xl leading-tight font-semibold tracking-tight text-white">Operations, inventory and finance in one consistent ledger.</h1>
          <ul className="mt-8 space-y-5">
            {HIGHLIGHTS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-3.5">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-white/5 ring-1 ring-white/10">
                  <Icon className="size-4 text-[#ff8a4c]" aria-hidden />
                </span>
                <span>
                  <span className="block text-sm font-medium text-white">{title}</span>
                  <span className="mt-0.5 block text-[13px] leading-relaxed text-sidebar-muted">{body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative mt-12 text-[12px] text-sidebar-muted">Next.js · PostgreSQL · EmberKV (Rust)</p>
      </aside>

      <main className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <span className="inline-flex rounded-xl bg-sidebar py-2 pr-3">
              <Brand />
            </span>
          </div>
          <h2 className="text-xl font-semibold tracking-tight">Sign in</h2>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
            <LockKeyhole className="size-3.5" aria-hidden /> Use your company account.
          </p>
          <Suspense fallback={<Skeleton className="mt-8 h-56" />}>
            <LoginContent searchParams={props.searchParams} />
          </Suspense>
        </div>
      </main>
    </div>
  );
}

async function LoginContent({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const session = await getSession();
  if (session.status === "signed-in") redirect("/dashboard");
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "";
  return (
    <>
      <LoginForm next={next} notice={params.signedOut === "all" ? "You were signed out on every device." : session.status === "unavailable" ? "The session service is restarting. Sign-in may fail for a few seconds." : null} />
      {env().DEMO_MODE && <DemoAccounts />}
    </>
  );
}
