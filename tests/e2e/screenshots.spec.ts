import { test } from "@playwright/test";

import { signIn } from "./helpers";

/**
 * Regenerates the README screenshots from the seeded demo company:
 *   npm run db:seed && npx playwright test screenshots
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to regenerate docs/screenshots");

const SHOTS: { name: string; path: string; full?: boolean }[] = [
  { name: "dashboard", path: "/dashboard" },
  { name: "sales-order", path: "/sales/orders/340" },
  { name: "invoices", path: "/sales/invoices" },
  { name: "trial-balance", path: "/accounting/trial-balance" },
  { name: "products", path: "/inventory/products" },
  { name: "system-status", path: "/admin/system" },
];

test("light mode", async ({ page }) => {
  await page.goto("/login");
  await page.screenshot({ path: "docs/screenshots/login.png" });
  await signIn(page, "admin@kiln.test");
  for (const shot of SHOTS) {
    await page.goto(shot.path);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `docs/screenshots/${shot.name}.png`, fullPage: shot.full });
  }
});

test("dark mode", async ({ browser }) => {
  const page = await (await browser.newContext({ colorScheme: "dark", viewport: { width: 1440, height: 900 } })).newPage();
  await signIn(page, "admin@kiln.test");
  await page.goto("/dashboard");
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: "docs/screenshots/dashboard-dark.png" });
});
