import { expect, test } from "@playwright/test";

import { act, resetNamespace, signIn, signOut } from "./helpers";

test("an order travels from sales to warehouse to finance, with segregated roles", async ({ page }) => {
  // Sales creates and confirms the order.
  await signIn(page, "sales@kiln.test");
  await page.goto("/sales/orders/new");
  await page.getByLabel("Customer").selectOption({ label: "CUS-CDN · PT Cahaya Digital Nusantara" });
  await page.getByLabel("Product").selectOption({ label: "ACC-MS-WL · Wireless Mouse Ergonomic" });
  await page.getByLabel("Quantity").fill("3");
  await expect(page.getByText("Rp 1.498.500")).toBeVisible(); // 3 × 450.000 + PPN 11%, computed client-side by the shared domain code
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/sales\/orders\/\d+$/);
  const orderUrl = page.url();
  await expect(page.getByRole("button", { name: "Mark delivered" })).toHaveCount(0); // not a sales permission
  await act(page, "Confirm & reserve stock", /stock reserved/);
  await signOut(page);

  // Warehouse ships it.
  await signIn(page, "warehouse@kiln.test");
  await page.goto(orderUrl);
  await act(page, "Mark delivered", /cost of goods recorded/);
  await signOut(page);

  // Finance invoices and collects.
  await signIn(page, "finance@kiln.test");
  await page.goto(orderUrl);
  await act(page, "Issue invoice", /Invoice issued/);
  await page.getByRole("link", { name: /^INV-\d{4}-\d{5}$/ }).click();
  await expect(page).toHaveURL(/\/sales\/invoices\/\d+$/);
  await page.getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByText("paid in full")).toBeVisible();

  // Every step left a balanced journal entry behind.
  await page.goto(orderUrl);
  await expect(page.getByText("Ledger postings")).toBeVisible();
  await expect(page.locator("a[href^='/accounting/journal/']")).toHaveCount(3); // COGS, invoice, payment
});

test("a second editor is locked out while the first holds the EmberKV lease", async ({ browser }) => {
  // A failed earlier attempt may have left a lease behind, which hides the Edit button.
  await resetNamespace("locks");
  const first = await (await browser.newContext()).newPage();
  const second = await (await browser.newContext()).newPage();
  await signIn(first, "sales@kiln.test");
  await first.goto("/sales/orders?status=draft");
  await first.locator("a[href^='/sales/orders/']").filter({ hasText: /^SO-/ }).first().click();
  await first.waitForURL(/\/sales\/orders\/\d+$/);
  const orderUrl = first.url();
  await first.getByRole("link", { name: "Edit" }).click();
  await expect(first.getByText("You hold the edit lock")).toBeVisible();

  await signIn(second, "admin@kiln.test");
  await second.goto(`${orderUrl}/edit`);
  await expect(second.getByText("Dimas Pratama is editing this order")).toBeVisible();

  // Leaving the editor releases the lease immediately.
  await first.getByRole("link", { name: "Cancel" }).click();
  await expect(first).toHaveURL(orderUrl);
  await expect(async () => {
    await second.reload();
    await expect(second.getByText("You hold the edit lock")).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });

  // Leave cleanly so the next run does not find this order locked for a minute.
  await second.getByRole("link", { name: "Cancel" }).click();
  await expect(second).toHaveURL(orderUrl);
});
