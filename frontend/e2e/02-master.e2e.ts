// PRD 10.1 CRUD for categories, subcategories (4.3A), suppliers and items, as Admin through the UI.
import { expect, test } from "@playwright/test";
import { ADMIN_STATE, choose, textbox } from "./helpers";

test.use({ storageState: ADMIN_STATE });

test("categories and subcategories: create, duplicate code rejected", async ({ page }) => {
  await page.goto("/categories");
  await page.getByRole("button", { name: "+ Add category" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Name", exact: true }).fill("Ruang Rapat");
  await dialog.getByRole("textbox", { name: "Code", exact: true }).fill("RRP");
  await dialog.getByRole("button", { name: "Save category" }).click();
  await expect(page.getByRole("row", { name: /Ruang Rapat/ })).toBeVisible();

  await page.getByRole("button", { name: "+ Add category" }).first().click();
  await dialog.getByRole("textbox", { name: "Name", exact: true }).fill("Gudang Lain");
  await dialog.getByRole("textbox", { name: "Code", exact: true }).fill("RRP");
  await dialog.getByRole("button", { name: "Save category" }).click();
  await expect(dialog.getByText(/already|used|exists/i).first()).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("tab", { name: "Subcategories" }).click();
  await page.getByRole("button", { name: "+ Add subcategory" }).first().click();
  await dialog.getByRole("textbox", { name: "Name", exact: true }).fill("Furnitur");
  await dialog.getByRole("textbox", { name: "Code", exact: true }).fill("FRN");
  await dialog.getByRole("button", { name: "Save subcategory" }).click();
  await expect(page.getByRole("row", { name: /Furnitur/ })).toBeVisible();
});

test("a category used by items cannot be deleted", async ({ page }) => {
  await page.goto("/categories");
  await page.getByRole("button", { name: "Actions: Gedung Utama" }).click();
  const del = page.getByRole("menuitem", { name: /delete/i });
  // Either the menu already blocks it, or the server refuses it.
  if (await del.isDisabled()) return;
  await del.click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("button", { name: /delete/i }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("row", { name: /Gedung Utama/ })).toBeVisible();
});

test("suppliers: create, deactivate and activate", async ({ page }) => {
  await page.goto("/suppliers");
  await page.getByRole("button", { name: "+ Add supplier" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Name", exact: true }).fill("CV Uji Jaya");
  await dialog.getByRole("textbox", { name: "Phone", exact: true }).fill("0210000000");
  await dialog.getByRole("button", { name: "Save supplier" }).click();
  const row = page.getByRole("row", { name: /CV Uji Jaya/ });
  await expect(row).toContainText("Active");

  await page.getByRole("button", { name: "Actions: CV Uji Jaya" }).click();
  await page.getByRole("menuitem", { name: /deactivate/i }).click();
  const confirm = page.getByRole("alertdialog");
  if (await confirm.waitFor({ timeout: 1500 }).then(() => true, () => false)) await confirm.getByRole("button", { name: /deactivate/i }).click();
  await expect(row).toContainText("Inactive");

  await page.getByRole("button", { name: "Actions: CV Uji Jaya" }).click();
  await page.getByRole("menuitem", { name: /^activate/i }).click();
  if (await confirm.waitFor({ timeout: 1500 }).then(() => true, () => false)) await confirm.getByRole("button", { name: /activate/i }).click();
  await expect(row).toContainText(/^(?!.*Inactive).*Active/);
});

test("items: add through the form gets a generated <CAT>-<SUB>-0001 code", async ({ page }) => {
  await page.goto("/items/new");
  await textbox(page, "Item name").fill("Kursi Lipat Uji");
  await choose(page, "Category", /Ruang Rapat/);
  await choose(page, "Subcategory", /Furnitur/);
  await choose(page, "Unit", /pcs/);
  await textbox(page, "Opening stock").fill("4");
  await textbox(page, "Minimum stock").fill("2");
  await page.getByRole("button", { name: "Save item" }).click();
  await expect(page).toHaveURL(/\/items\/view\?id=\d+/);
  await expect(page.getByText("RRP-FRN-0001").first()).toBeVisible();
  await expect(page.getByRole("definition").filter({ hasText: "4 pcs" })).toBeVisible();
});

test("items: required fields are checked before saving", async ({ page }) => {
  await page.goto("/items/new");
  await page.getByRole("button", { name: "Save item" }).click();
  await expect(page).toHaveURL(/\/items\/new/);
  await expect(page.getByText(/required|enter|choose|select/i).first()).toBeVisible();
});

test("items: column picker hides optional columns, keeps required ones, survives reload", async ({ page }) => {
  await page.goto("/items");
  const table = page.getByRole("table", { name: "Items" });
  await page.getByRole("button", { name: "Columns" }).click();
  await expect(page.getByRole("menuitemcheckbox", { name: "Code" })).toBeDisabled();
  await page.getByRole("menuitemcheckbox", { name: "Location" }).click();
  await page.keyboard.press("Escape");
  await expect(table.getByRole("columnheader", { name: /Location/ })).toHaveCount(0);
  await page.reload();
  await expect(table.getByRole("columnheader", { name: /Location/ })).toHaveCount(0);
  await expect(table.getByRole("columnheader", { name: /Code/ })).toHaveCount(1);
  await page.getByRole("button", { name: "Columns" }).click();
  await page.getByRole("menuitem", { name: "Show all columns" }).click();
  await expect(table.getByRole("columnheader", { name: /Location/ })).toHaveCount(1);
});

test("items: filter by subcategory", async ({ page }) => {
  await page.goto("/items");
  await choose(page, "Subcategory", /Furnitur/);
  const rows = page.getByRole("table", { name: "Items" }).getByRole("row");
  await expect(rows.filter({ hasText: "Kursi Lipat Uji" })).toHaveCount(1);
  await expect(rows.filter({ hasText: "Proyektor Uji" })).toHaveCount(0);
});
