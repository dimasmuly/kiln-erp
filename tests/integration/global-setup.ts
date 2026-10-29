import { config } from "dotenv";
import postgres from "postgres";

import { runMigrations } from "../../scripts/migrate";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

/** Integration tests run against a dedicated `<db>_test` database, rebuilt from migrations once per run. */
export function testDatabaseUrl(): string {
  const url = new URL(process.env.DATABASE_URL ?? "postgres://kiln:kiln@127.0.0.1:5433/kiln");
  if (!url.pathname.endsWith("_test")) url.pathname = `${url.pathname}_test`;
  return url.toString();
}

export default async function setup() {
  const url = new URL(testDatabaseUrl());
  const name = url.pathname.slice(1);
  const admin = postgres({ host: url.hostname, port: Number(url.port), user: url.username, password: url.password, database: "postgres", onnotice: () => {} });
  const [exists] = await admin`SELECT 1 FROM pg_database WHERE datname = ${name}`;
  if (!exists) await admin.unsafe(`CREATE DATABASE "${name}"`);
  await admin.end();
  await runMigrations(url.toString(), { reset: true });
}
