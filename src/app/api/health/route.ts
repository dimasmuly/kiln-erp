import { sql } from "drizzle-orm";
import { connection } from "next/server";

import { db } from "@/server/db/client";
import { kv } from "@/server/kv/client";

/**
 * Readiness probe for load balancers and Kubernetes. PostgreSQL is required
 * (503 without it); EmberKV is reported but only degrades the app, because
 * every EmberKV-backed feature has a defined fallback.
 */
export async function GET() {
  await connection();
  const [postgres, emberkv] = await Promise.all([
    db
      .execute(sql`SELECT 1`)
      .then(() => true)
      .catch(() => false),
    kv().client.ready(),
  ]);
  const status = postgres ? (emberkv ? "ok" : "degraded") : "down";
  return Response.json({ status, postgres, emberkv }, { status: postgres ? 200 : 503, headers: { "cache-control": "no-store" } });
}
