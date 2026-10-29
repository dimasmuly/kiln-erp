import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "../env";
import * as schema from "./schema";

export function createDatabase(url: string, options: { max?: number } = {}) {
  const client = postgres(url, {
    max: options.max ?? 10,
    idle_timeout: 30,
    connect_timeout: 5,
    // Surface NOTICE output only in development; it is noise in production logs.
    onnotice: () => {},
  });
  return { client, db: drizzle(client, { schema }) };
}

export type Database = ReturnType<typeof createDatabase>["db"];
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
/** Anything that can run a query: the pool or an open transaction. */
export type Executor = Database | Tx;

// One pool per process, surviving Next.js dev-server module reloads.
const globalForDb = globalThis as unknown as { __kilnDb?: ReturnType<typeof createDatabase> };

function instance() {
  globalForDb.__kilnDb ??= createDatabase(env().DATABASE_URL);
  return globalForDb.__kilnDb;
}

/** The shared pool. Lazy, so importing this module never opens a connection. */
export const db: Database = new Proxy({} as Database, {
  get: (_target, property) => {
    const target = instance().db;
    const value = Reflect.get(target, property);
    return typeof value === "function" ? value.bind(target) : value;
  },
});

/** Replaces the shared pool (integration tests point it at a throwaway database). */
export function overrideDatabase(instanceToUse: ReturnType<typeof createDatabase>): void {
  globalForDb.__kilnDb = instanceToUse;
}
