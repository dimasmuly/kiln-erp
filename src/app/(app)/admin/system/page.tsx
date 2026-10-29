import { CheckCircle2, Database, Flame, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { percent, qty } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { systemStatus } from "@/server/modules/admin/queries";

export const metadata = { title: "System status" };
export const instant = false;

/** What each EmberKV namespace does for the ERP, and what happens if EmberKV is down. */
const NAMESPACE_ROLE: Record<string, { use: string; outage: string }> = {
  sessions: { use: "Login sessions, 7-day sliding TTL; token hashes only", outage: "Fail closed: sign-in paused, data untouched" },
  limits: { use: "Login throttling per account and per IP", outage: "Fail open: requests allowed, logged" },
  idempotency: { use: "Exactly-once form submits (If-None-Match: *)", outage: "Fail open: DB state machines still block most duplicates" },
  locks: { use: "Document edit leases with heartbeat", outage: "Fail open: version check in PostgreSQL still prevents lost updates" },
  cache: { use: "Dashboard aggregates, invalidated on posting", outage: "Bypass: computed from PostgreSQL" },
};

function bytes(n: number | undefined): string {
  if (n === undefined) return "—";
  const units = ["B", "KiB", "MiB", "GiB"];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function Health({ ok, label }: { ok: boolean; label: string }) {
  return ok ? (
    <Badge tone="ok">
      <CheckCircle2 className="size-3.5" aria-hidden /> {label}
    </Badge>
  ) : (
    <Badge tone="bad">
      <XCircle className="size-3.5" aria-hidden /> {label}
    </Badge>
  );
}

export default async function SystemPage() {
  const { ctx } = await requireUser("admin.system");
  const status = await systemStatus(ctx);
  const { postgres, emberkv } = status;
  const stats = emberkv.stats?.value as Record<string, number> | null | undefined;

  return (
    <>
      <PageHeader title="System status" description="Live view of the two backing services, measured from this ERP instance." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Database className="size-4 text-muted" aria-hidden /> PostgreSQL · system of record
              </span>
            }
            actions={<Health ok={!postgres.error} label={postgres.error ? "Down" : "Healthy"} />}
          />
          <dl className="num grid grid-cols-2 gap-4 px-5 py-4 text-sm sm:grid-cols-4">
            {[
              ["Version", postgres.value?.version ?? "—"],
              ["Round trip", `${postgres.ms.toFixed(1)} ms`],
              ["Database size", postgres.value?.size ?? "—"],
              ["Connections", postgres.value?.connections ?? "—"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-[12px] text-muted">{k}</dt>
                <dd className="mt-0.5 font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="border-t border-line px-5 py-3 text-[12px] text-muted">
            Holds every business record: orders, invoices, stock ledger, journal. Integrity rules (balanced entries, append-only ledgers, no negative stock) are enforced by constraints and triggers.
          </p>
        </Card>

        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Flame className="size-4 text-accent" aria-hidden /> EmberKV · hot state (Rust)
              </span>
            }
            actions={<Health ok={emberkv.ready} label={emberkv.ready ? "Ready" : "Unreachable"} />}
          />
          <dl className="num grid grid-cols-2 gap-4 px-5 py-4 text-sm sm:grid-cols-4">
            {[
              ["Endpoint", emberkv.url.replace(/^https?:\/\//, "")],
              ["Readiness probe", `${emberkv.latencyMs.toFixed(1)} ms`],
              ["Live keys", stats ? qty(stats.keys) : "—"],
              ["Segments", stats ? qty(stats.segments) : "—"],
              ["Disk", bytes(stats?.total_bytes)],
              ["Live data", bytes(stats?.live_bytes)],
              ["Fragmentation", stats ? percent(stats.fragmentation) : "—"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-[12px] text-muted">{k}</dt>
                <dd className="mt-0.5 truncate font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          {!stats && (
            <p className="border-t border-line px-5 py-3 text-[12px] text-muted">Set EMBERKV_ADMIN_TOKEN to show engine statistics (keys, segments, fragmentation).</p>
          )}
        </Card>
      </div>

      {!emberkv.ready && (
        <Alert tone="warn" title="Running in degraded mode" className="mt-4">
          EmberKV is unreachable. The ERP keeps working with the fallbacks below; nothing in PostgreSQL is affected.
        </Alert>
      )}

      <Card className="mt-4">
        <CardHeader title="EmberKV namespaces" description="Each namespace is scoped in the ERP's API key; the key cannot touch anything else." />
        <Table>
          <THead>
            <tr>
              <TH>Namespace</TH>
              <TH>Used for</TH>
              <TH numeric>Keys</TH>
              <TH>If EmberKV is down</TH>
            </tr>
          </THead>
          <tbody>
            {emberkv.namespaces.map((n) => (
              <TR key={n.name}>
                <TD className="font-mono text-[13px] font-medium">{n.name}</TD>
                <TD className="text-muted">{NAMESPACE_ROLE[n.name]?.use}</TD>
                <TD numeric>{n.keys === null ? <span className="text-warn">—</span> : qty(n.keys)}</TD>
                <TD className="text-[13px] text-muted">{NAMESPACE_ROLE[n.name]?.outage}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
