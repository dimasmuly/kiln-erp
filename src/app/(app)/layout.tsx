import { Menu } from "lucide-react";
import { Suspense } from "react";

import { Brand, SidebarContent, SidebarSkeleton } from "@/components/shell/sidebar";
import { Toaster } from "@/components/toaster";

/**
 * Every screen behind this layout is per-user and must reflect the latest
 * ledger, so navigations are allowed to wait for the server instead of
 * serving cached session data. (Sessions can be revoked at any moment, and a
 * stale `use cache: private` copy would keep showing a signed-out user's UI.)
 * Each page under this layout repeats `instant = false` for the same reason:
 * the setting applies per segment, not to descendants.
 */
export const instant = false;

/**
 * Authenticated shell. The frame is static (prerendered); everything that
 * depends on the session streams in behind Suspense boundaries, per the
 * Cache Components model.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sidebar-line bg-sidebar lg:flex">
        <div className="border-b border-sidebar-line py-4">
          <Brand />
        </div>
        <Suspense fallback={<SidebarSkeleton />}>
          <SidebarContent />
        </Suspense>
      </aside>

      <details className="group sticky top-0 z-30 border-b border-sidebar-line bg-sidebar lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between py-3 pr-4 [&::-webkit-details-marker]:hidden">
          <Brand />
          <Menu className="size-5 text-sidebar-text" aria-label="Menu" />
        </summary>
        <div className="flex max-h-[80vh] flex-col overflow-y-auto">
          <Suspense fallback={<SidebarSkeleton />}>
            <SidebarContent />
          </Suspense>
        </div>
      </details>

      <Toaster>
        <main className="mx-auto max-w-[1360px] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">{children}</main>
      </Toaster>
    </div>
  );
}
