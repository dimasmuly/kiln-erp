import { expect, type Page } from "@playwright/test";

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
