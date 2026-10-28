// PRD 10.1 Dashboard, expense summary, reports, Excel export, backup, users and activity log (Admin).
// Formula escaping, retention and restore are covered by the backend integration tests (export-backup.test.ts).
import { expect, test } from "@playwright/test";
import { ADMIN, ADMIN_STATE, apiAs, ok } from "./helpers";

test.use({ storageState: ADMIN_STATE });

test("dashboard shows stock status, loans and the Admin quick actions", async ({ page }) => {
  await page.goto("/dashboard");
  for (const link of ["+ New loan", "+ Add item", "+ Incoming stock"]) await expect(page.getByRole("link", { name: link })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export Excel" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Stock status" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Loans" })).toBeVisible();
  await expect(page.getByText("Active loans")).toBeVisible();
});

test("expense summary totals posted incoming stock and drops a voided purchase", async ({ page, baseURL }) => {
  await page.goto("/expenses");
  await expect(page.getByText("Rp 1.500.000").first()).toBeVisible();

  const api = await apiAs(baseURL!, ADMIN);
  const txs = await ok(api, "get", "/stock/transactions?search=IN-&pageSize=50");
  const received = txs.find((x: { total: number }) => x.total === 650000);
  expect(received, JSON.stringify(txs[0])).toBeTruthy();
  await ok(api, "post", `/stock/transactions/${received.id}/void`, { reason: "Uji void pembelian" });

  await page.reload();
  await expect(page.getByText("Rp 850.000").first()).toBeVisible();
});

test("each report loads and the Excel export downloads an .xlsx", async ({ page }) => {
  await page.goto("/reports");
  await expect(page.getByRole("table", { name: "Stock report" }).getByRole("row", { name: /Proyektor Uji/ })).toBeVisible();
  await page.getByRole("tab", { name: "Stock movements" }).click();
  await expect(page.getByRole("tabpanel").getByRole("row").nth(1)).toBeVisible();
  await page.getByRole("tab", { name: "Loans" }).click();
  await expect(page.getByRole("tabpanel").getByRole("row", { name: /LN-/ }).first()).toBeVisible();

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("tabpanel").getByRole("button", { name: "Export Excel" }).click()]);
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
  const bytes = await (await import("node:fs/promises")).readFile((await download.path())!);
  expect(bytes.subarray(0, 2).toString()).toBe("PK");
});

test("items export downloads an .xlsx", async ({ page }) => {
  await page.goto("/items");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export Excel" }).click()]);
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
});

test("backup now creates a manual backup that can be downloaded", async ({ page }) => {
  await page.goto("/backup");
  const rows = page.getByRole("table", { name: "Available backups" }).getByRole("row");
  await expect(rows.nth(1)).toBeVisible();
  const before = await rows.count();
  await page.getByRole("button", { name: "Backup now" }).click();
  await expect(rows).toHaveCount(before + 1);
  await expect(rows.filter({ hasText: "Manual" }).first()).toBeVisible();
  const first = page.getByRole("button", { name: /^Download ezi-backup-/ }).first();
  const [download] = await Promise.all([page.waitForEvent("download"), first.click()]);
  expect(download.suggestedFilename()).toMatch(/^ezi-backup-.*\.sql\.gz$/);
});

test("users: add shows a one-time temporary password; deactivate blocks sign-in", async ({ page, request }) => {
  await page.goto("/users");
  await page.getByRole("button", { name: "+ Add user" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Full name" }).fill("Staf Dua");
  await dialog.getByRole("textbox", { name: "Email" }).fill("staf.dua@example.test");
  await dialog.getByRole("button", { name: "Save user" }).click();
  const temp = page.getByRole("dialog", { name: "Temporary password" });
  await expect(temp).toBeVisible();
  const password = (await temp.locator("p").nth(1).innerText()).trim();
  await temp.getByRole("button", { name: "I have copied it" }).click();
  const before = await request.post("/api/auth/login", { data: { email: "staf.dua@example.test", password } });
  expect((await before.json()).success, "temporary password works before deactivation").toBe(true);

  await page.getByRole("button", { name: "Actions: Staf Dua" }).click();
  await page.getByRole("menuitem", { name: "Deactivate" }).click();
  const confirm = page.getByRole("alertdialog");
  if (await confirm.waitFor({ timeout: 1500 }).then(() => true, () => false)) await confirm.getByRole("button", { name: /deactivate/i }).click();
  await expect(page.getByRole("row", { name: /Staf Dua/ })).toContainText("Inactive");

  const login = await request.post("/api/auth/login", { data: { email: "staf.dua@example.test", password } });
  const refused = await login.json();
  expect(refused.success).toBe(false);
  expect(refused.error.code).not.toBe("RATE_LIMITED");
});

test("activity log records the import summary and filters by module", async ({ page }) => {
  await page.goto("/activity-log");
  await expect(page.getByRole("row", { name: /Items imported .*2 created, 1 skipped, 1 rejected, 1 category and 0 subcategories added/ })).toBeVisible();
  await page.getByRole("combobox", { name: "Module" }).click();
  await page.getByRole("option", { name: "Loans" }).click();
  const rows = page.getByRole("table", { name: "Activity log" }).getByRole("row");
  await expect(rows.nth(1)).toContainText("Loans");
  await expect(rows.filter({ hasText: "Items imported" })).toHaveCount(0);
});
