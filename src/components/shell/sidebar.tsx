import { LogOut } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Skeleton } from "@/components/ui/feedback";
import { logoutAction } from "@/server/actions/auth";
import { getSession } from "@/server/auth/session";
import { can, ROLE_LABELS } from "@/server/auth/rbac";
import { kv } from "@/server/kv/client";

import { NAV } from "./nav-items";
import { SidebarNav } from "./sidebar-nav";

export function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5 px-3">
      <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-[#f76707] to-[#c92a2a] shadow-[0_0_0_1px_rgba(255,255,255,0.08)_inset]">
        <svg viewBox="0 0 24 24" className="size-4.5 text-white" fill="currentColor" aria-hidden>
          <path d="M12 2c.6 3.2-1.4 4.9-2.9 6.6C7.6 10.3 6.5 12 6.5 14.3A5.5 5.5 0 0 0 12 20a5.5 5.5 0 0 0 5.5-5.7c0-2.2-1-3.9-2.2-5.3-.2 1.6-1 2.7-2.3 3.2.6-3.4-.2-7.4-1-10.2Z" />
        </svg>
      </span>
      <span className="leading-tight">
        <span className="block text-[15px] font-semibold text-white">Kiln ERP</span>
        <span className="block text-[11px] text-sidebar-muted">PT Kiln Teknologi Distribusi</span>
      </span>
    </Link>
  );
}

/** Role-filtered navigation and the signed-in user. Streams in behind a Suspense boundary. */
export async function SidebarContent() {
  const session = await getSession();
  if (session.status === "unavailable") redirect("/unavailable");
  if (session.status === "signed-out") redirect("/login");
  const { user } = session;
  const sections = NAV.map((group) => ({ ...group, items: group.items.filter((item) => can(user.role, item.permission)) })).filter((g) => g.items.length > 0);
  const kvReady = await kv().client.ready();

  return (
    <>
      <div className="flex-1 overflow-y-auto px-3 py-5">
        <SidebarNav sections={sections} />
      </div>
      <div className="space-y-3 border-t border-sidebar-line p-3">
        <div className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12px] text-sidebar-muted" title="Sessions, rate limits, edit locks and caches are served by EmberKV">
          <span className={kvReady ? "size-1.5 rounded-full bg-emerald-400" : "size-1.5 rounded-full bg-red-400"} aria-hidden />
          EmberKV {kvReady ? "connected" : "unreachable"}
        </div>
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-1">
          <Link href="/account" className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg hover:opacity-90">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-sidebar-active text-[12px] font-semibold text-white ring-1 ring-sidebar-line">
              {user.name
                .split(" ")
                .map((w) => w[0])
                .slice(0, 2)
                .join("")}
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[13px] font-medium text-white">{user.name}</span>
              <span className="block truncate text-[11px] text-sidebar-muted">{ROLE_LABELS[user.role]}</span>
            </span>
          </Link>
          <form action={logoutAction}>
            <button type="submit" className="rounded-md p-1.5 text-sidebar-muted hover:bg-sidebar-active hover:text-white" aria-label="Sign out" title="Sign out">
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </div>
    </>
  );
}

export function SidebarSkeleton() {
  return (
    <div className="flex-1 space-y-2 px-6 py-5">
      {Array.from({ length: 9 }, (_, i) => (
        <Skeleton key={i} className="h-5 bg-sidebar-active" />
      ))}
    </div>
  );
}
