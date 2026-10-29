import { asc, count, desc, eq, sql } from "drizzle-orm";

import { authorize, type Ctx } from "../../context";
import { db } from "../../db/client";
import { auditLog, users } from "../../db/schema";
import { env } from "../../env";
import { kv, NAMESPACES, type NamespaceName } from "../../kv/client";
import { listSessions, type ActiveSession } from "../../kv/sessions";
import { PAGE_SIZE } from "../sales/queries";

export async function listUsers(ctx: Ctx) {
  authorize(ctx, "admin.users");
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, active: users.active, createdAt: users.createdAt })
    .from(users)
    .orderBy(asc(users.createdAt));
  const sessions = await Promise.all(rows.map((u) => listSessions(u.id).catch(() => null)));
  return rows.map((u, i) => ({ ...u, sessions: sessions[i] }));
}

export async function mySessions(ctx: Ctx): Promise<ActiveSession[] | null> {
  return listSessions(ctx.actor.id).catch(() => null);
}

export async function listAudit(ctx: Ctx, opts: { page?: number }) {
  authorize(ctx, "admin.system");
  const page = Math.max(1, opts.page ?? 1);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({ id: auditLog.id, at: auditLog.at, action: auditLog.action, entity: auditLog.entity, entityId: auditLog.entityId, summary: auditLog.summary, actor: users.name })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.actorId))
      .orderBy(desc(auditLog.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(auditLog),
  ]);
  return { rows, total, page, pageSize: PAGE_SIZE };
}

async function timed<T>(run: () => Promise<T>): Promise<{ ms: number; value: T | null; error: string | null }> {
  const started = performance.now();
  try {
    const value = await run();
    return { ms: performance.now() - started, value, error: null };
  } catch (err) {
    return { ms: performance.now() - started, value: null, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Live health of both backing services, as the ERP sees them. */
export async function systemStatus(ctx: Ctx) {
  authorize(ctx, "admin.system");
  const { client, admin } = kv();

  const [postgres, emberReady, emberStats, namespaces] = await Promise.all([
    timed(async () => {
      const [row] = await db.execute<{ version: string; size: string; connections: string }>(sql`
        SELECT split_part(version(), ' ', 2) AS version,
               pg_size_pretty(pg_database_size(current_database())) AS size,
               (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()) AS connections`);
      return row;
    }),
    timed(() => client.ready()),
    admin ? timed(() => admin.stats()) : Promise.resolve(null),
    Promise.all(
      NAMESPACES.map(async (name: NamespaceName) => {
        const result = await timed(async () => {
          let keys = 0;
          for await (const item of kv().ns[name].scan({ limit: 1000 })) if (item.key) keys++;
          return keys;
        });
        return { name, keys: result.value, error: result.error };
      }),
    ),
  ]);

  return {
    postgres,
    emberkv: { url: env().EMBERKV_URL, ready: emberReady.value === true, latencyMs: emberReady.ms, stats: emberStats, namespaces },
  };
}
