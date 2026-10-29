import { EmberKV } from "@emberkv/client";
import { expect, type Page } from "@playwright/test";
import { config } from "dotenv";

export const PASSWORD = "kiln-demo-2026";

const confirming = new WeakSet<Page>();

export async function signIn(page: Page, email: string) {
  // Document actions ask for confirmation; accept every confirm() on this page.
  if (!confirming.has(page)) {
    confirming.add(page);
    page.on("dialog", (dialog) => dialog.accept());
  }
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
}

export async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await expect(page).toHaveURL(/\/login/);
}

/** Clicks a document action and waits for its confirmation toast. */
export async function act(page: Page, button: string, toast: RegExp) {
  await page.getByRole("button", { name: button }).click();
  await expect(page.getByRole("status").filter({ hasText: toast })).toBeVisible();
}

/** Deletes every key in an EmberKV namespace (needs the admin token from .env.local). */
export async function resetNamespace(name: string) {
  config({ path: ".env.local", quiet: true });
  const token = process.env.EMBERKV_ADMIN_TOKEN;
  if (!token) return;
  const ns = new EmberKV({ baseUrl: process.env.EMBERKV_URL ?? "http://127.0.0.1:8080", token }).namespace(name);
  const keys: string[] = [];
  for await (const item of ns.scan()) keys.push(item.key);
  for (let i = 0; i < keys.length; i += 1000) await ns.batch(keys.slice(i, i + 1000).map((key) => ({ op: "delete" as const, key })));
}
