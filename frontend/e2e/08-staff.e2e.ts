// PRD 3.2 and 10.2 Staff: only Dashboard, Items, Loans, Purchase requests and My profile; no prices, suppliers,
// stock numbers or item codes; every Admin page is closed even by direct URL.
import { expect, test } from "./fixtures";
import { STAFF_STATE } from "./helpers";

test.use({ storageState: STAFF_STATE });

const ADMIN_PAGES = ["/categories", "/suppliers", "/stock", "/stock/in", "/stock/out", "/stock/adjustment", "/expenses", "/reports", "/backup", "/users", "/activity-log", "/items/new", "/items/import"];

test("the sidebar shows only the Staff areas", async ({ page }) => {
  await page.goto("/dashboard");
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await expect(nav.getByRole("link")).toHaveText(["Dashboard", "Items", "Loans", "Purchase requests", "My profile"]);
  await expect(page.getByRole("link", { name: "+ New loan request" }).first()).toBeVisible();
});

for (const path of ADMIN_PAGES) {
  test(`direct URL ${path} shows no access`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "You do not have access to this page" })).toBeVisible();
  });
}

test("item pages show availability only: no code, price, supplier or stock numbers", async ({ page }) => {
  await page.goto("/items");
  const table = page.getByRole("table", { name: "Items" });
  await expect(table.getByRole("row").nth(1)).toBeVisible();
  await expect(table).not.toContainText(/GDU-|Rp|Toko Contoh/);
  await page.getByRole("link", { name: "Proyektor Uji" }).click();
  const main = page.getByRole("main");
  await expect(main.getByText("Availability only. Ask an Admin for stock numbers.")).toBeVisible();
  await expect(main).not.toContainText(/GDU-|Rp|Toko Contoh|Current stock|Last purchase price/);
});

test("the item field on a loan request searches names and shows no codes", async ({ page }) => {
  await page.goto("/loans/new");
  await page.getByRole("combobox", { name: "Item" }).fill("proyektor");
  const option = page.getByRole("option", { name: /Proyektor Uji/ });
  await expect(option).toBeVisible();
  await expect(option).not.toContainText(/[A-Z]{3}-[A-Z]{3}-\d{4}/);
  await page.getByRole("combobox", { name: "Item" }).fill("GDU-");
  await expect(page.getByText("No active item matches.")).toBeVisible();
});

test("the item API gives Staff no price, supplier, code or stock fields", async ({ page }) => {
  const body = await (await page.request.get("/api/items")).json();
  expect(body.success).toBe(true);
  for (const item of body.data) {
    for (const field of ["lastPurchasePrice", "supplierId", "supplierName", "currentStock", "code"]) expect(item[field], field).toBeUndefined();
  }
});
