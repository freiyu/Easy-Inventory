// PRD 4.10 (BR-33) CSV item import: preview saves nothing, duplicates are skipped, unknown references rejected,
// confirm takes a "Before import" backup and creates only the ready rows.
import { expect, test } from "@playwright/test";
import { ADMIN, ADMIN_STATE, apiAs, ok } from "./helpers";

test.use({ storageState: ADMIN_STATE });

const CSV = [
  "name,category,subcategory,unit,opening_stock,minimum_stock,price,supplier,location,notes",
  "Monitor Uji,Gedung Utama,ELK,pcs,3,1,900000,Toko Contoh,Rak B,",
  "Proyektor Uji,Gedung Utama,ELK,pcs,1,1,,,,",
  "Barang Aneh,Kategori Tidak Ada,ELK,pcs,,,,,,",
].join("\n");

test("preview, then confirm creates only the ready rows after a backup", async ({ page, baseURL }) => {
  const api = await apiAs(baseURL!, ADMIN);
  await page.goto("/items/import");
  await page.locator('input[type="file"]').setInputFiles({ name: "items.csv", mimeType: "text/csv", buffer: Buffer.from(CSV) });
  const main = page.getByRole("main");
  await expect(main.getByText(/1 ready/i).first()).toBeVisible();
  await expect(main.getByText(/1 skipped/i).first()).toBeVisible();
  await expect(main.getByText(/1 with errors/i).first()).toBeVisible();
  await expect(main.getByRole("row", { name: /Monitor Uji Gedung Utama ELK pcs/ })).toBeVisible();
  expect(await ok(api, "get", "/items?search=Monitor")).toHaveLength(0);

  await main.getByRole("button", { name: /import 1 item/i }).click();
  const confirm = page.getByRole("alertdialog");
  if (await confirm.waitFor({ timeout: 1500 }).then(() => true, () => false)) await confirm.getByRole("button", { name: /import/i }).click();
  await expect(main.getByText(/imported|created/i).first()).toBeVisible();

  const created = await ok(api, "get", "/items?search=Monitor");
  expect(created).toHaveLength(1);
  expect(created[0].code).toMatch(/^GDU-ELK-\d{4}$/);
  expect(created[0].currentStock).toBe(3);
  const backups = await ok(api, "get", "/backup/database");
  expect(JSON.stringify(backups)).toMatch(/before-import|Before import/i);
});

test("an unclosed quote refuses the whole file", async ({ page }) => {
  await page.goto("/items/import");
  const bad = 'name,category,subcategory,unit\n"Tanpa tutup,Gedung Utama,ELK,pcs\n';
  await page.locator('input[type="file"]').setInputFiles({ name: "bad.csv", mimeType: "text/csv", buffer: Buffer.from(bad) });
  await expect(page.getByRole("alert").filter({ hasText: /quote/i }).first()).toBeVisible();
});
