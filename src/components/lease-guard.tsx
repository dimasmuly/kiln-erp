"use client";

import { Lock } from "lucide-react";
import { useEffect, useState } from "react";

import { Alert } from "@/components/ui/feedback";
import { renewLeaseAction } from "@/server/actions/locks";

const HEARTBEAT_MS = 20_000;

/**
 * Keeps this editor's EmberKV lease alive while the page is open, and
 * releases it when the editor unmounts or the tab closes (sendBeacon survives
 * page unload). If it lapsed, the next heartbeat re-takes it when free. If the
 * lease is lost, saving still works: PostgreSQL's version check decides.
 */
export function LeaseGuard({ kind, id, degraded }: { kind: "sales_order" | "purchase_order"; id: number; degraded: boolean }) {
  const [lost, setLost] = useState(false);

  useEffect(() => {
    const beat = async () => {
      if (!(await renewLeaseAction(kind, id))) setLost(true);
    };
    // Beat once on mount too: a remount (React Strict Mode, fast refresh) re-takes the lease at once.
    void beat();
    const timer = setInterval(beat, HEARTBEAT_MS);
    const release = () => navigator.sendBeacon("/api/leases/release", JSON.stringify({ kind, id }));
    window.addEventListener("pagehide", release);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", release);
      // Client-side navigation away from the editor (no pagehide event).
      release();
    };
  }, [kind, id]);

  if (lost) {
    return (
      <Alert tone="warn" title="Your edit lock expired" className="mb-4">
        Someone else may be editing now. You can still save; if the document changed in the meantime, the save is refused and nothing is overwritten.
      </Alert>
    );
  }
  if (degraded) {
    return (
      <Alert tone="warn" title="Edit locks are unavailable" className="mb-4">
        EmberKV could not be reached, so others are not warned that you are editing. Conflicting saves are still detected.
      </Alert>
    );
  }
  return (
    <p className="mb-4 inline-flex items-center gap-1.5 rounded-md bg-accent-soft px-2 py-1 text-[12px] font-medium text-accent-text">
      <Lock className="size-3.5" aria-hidden /> You hold the edit lock. Others see this document as read-only.
    </p>
  );
}
