import { EmberKV } from "@emberkv/client";
import { config } from "dotenv";
import { afterAll } from "vitest";

import { createDatabase, overrideDatabase } from "@/server/db/client";
import { overrideKv } from "@/server/kv/client";

import { testDatabaseUrl } from "./global-setup";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const database = createDatabase(testDatabaseUrl(), { max: 20 });
overrideDatabase(database);
overrideKv(new EmberKV({ baseUrl: process.env.EMBERKV_URL ?? "http://127.0.0.1:8080", token: process.env.EMBERKV_TOKEN, timeoutMs: 3000 }));

afterAll(async () => {
  await database.client.end();
});
