/**
 * Applies SQL migrations from ./drizzle. Runs at deploy time (and in the
 * container entrypoint) without needing drizzle-kit installed.
 *
 *   npm run db:migrate            # apply pending migrations
 *   npm run db:migrate -- --reset # drop everything first (development only)
 */
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";

import { createDatabase } from "../src/server/db/client";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

export async function runMigrations(url: string, { reset = false } = {}): Promise<void> {
  const { db, client } = createDatabase(url, { max: 1 });
  try {
    if (reset) {
      if (process.env.NODE_ENV === "production") throw new Error("Refusing to --reset in production.");
      await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
      await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
      await db.execute(sql`CREATE SCHEMA public`);
    }
    await migrate(db, { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });
  } finally {
    await client.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL ?? "postgres://kiln:kiln@127.0.0.1:5433/kiln";
  await runMigrations(url, { reset: process.argv.includes("--reset") });
  console.log("✓ Database migrated");
}
