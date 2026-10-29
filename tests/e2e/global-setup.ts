import { EmberKV } from "@emberkv/client";
import { config } from "dotenv";

/**
 * E2E runs sign in repeatedly from one IP, which is exactly what the login
 * throttle exists to stop. Like resetting a test database, clear the
 * `limits` namespace before the run (needs the admin token from .env.local).
 */
export default async function globalSetup() {
  config({ path: ".env.local", quiet: true });
  const token = process.env.EMBERKV_ADMIN_TOKEN;
  if (!token) return;
  const limits = new EmberKV({ baseUrl: process.env.EMBERKV_URL ?? "http://127.0.0.1:8080", token }).namespace("limits");
  const keys: string[] = [];
  for await (const item of limits.scan()) keys.push(item.key);
  for (let i = 0; i < keys.length; i += 1000) await limits.batch(keys.slice(i, i + 1000).map((key) => ({ op: "delete" as const, key })));
}
