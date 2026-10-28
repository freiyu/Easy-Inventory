// PRD 4.10 (BR-33) CSV item import: preview saves nothing, duplicates are skipped, a bad unit is rejected, a missing
// category is added with a generated code (v13), confirm takes a "Before import" backup and creates only the ready rows.
import { expect, test } from "@playwright/test";
import { ADMIN, ADMIN_STATE, apiAs, ok } from "./helpers";

test.use({ storageState: ADMIN_STATE });

const CSV = [
  "name,category,subcategory,unit,opening_stock,minimum_stock,price,supplier,location,notes",
  "Monitor Uji,Gedung Utama,ELK,pcs,3,1,900000,Toko Contoh,Rak B,",
  "Proyektor Uji,Gedung Utama,ELK,pcs,1,1,,,,",
  "Barang Aneh,Kategori Tidak Ada,ELK,pcs,,,,,,",
  "Barang Rusak,Gedung Utama,ELK,kardus,,,,,,",
].join("\n");

test("preview, then confirm creates only the ready rows after a backup", async ({ page, baseURL }) => {
  const api = await apiAs(baseURL!, ADMIN);
  await page.goto("/items/import");
  await page.locator('input[type="file"]').setInputFiles({ name: "items.csv", mimeType: "text/csv", buffer: Buffer.from(CSV) });
  const main = page.getByRole("main");
  await expect(main.getByText(/2 ready/i).first()).toBeVisible();
  await expect(main.getByText(/1 skipped/i).first()).toBeVisible();
  await expect(main.getByText(/1 with errors/i).first()).toBeVisible();
  await expect(main.getByRole("row", { name: /Monitor Uji Gedung Utama ELK pcs/ })).toBeVisible();
  await expect(main.getByText(/1 new category, 0 new subcategories/i)).toBeVisible();
  await expect(main.getByText(/Will be added: Kategori Tidak Ada \(KTG\)/)).toBeVisible();
  expect(await ok(api, "get", "/categories?search=Kategori Tidak Ada")).toHaveLength(0);
  expect(await ok(api, "get", "/items?search=Monitor")).toHaveLength(0);

  await main.getByRole("button", { name: /import 2 items/i }).click();
  const confirm = page.getByRole("alertdialog");
  if (await confirm.waitFor({ timeout: 1500 }).then(() => true, () => false)) await confirm.getByRole("button", { name: /import/i }).click();
  await expect(main.getByText(/imported|created/i).first()).toBeVisible();

  const created = await ok(api, "get", "/items?search=Monitor");
  expect(created).toHaveLength(1);
  expect(created[0].code).toMatch(/^GDU-ELK-\d{4}$/);
  expect(created[0].currentStock).toBe(3);
  const added = await ok(api, "get", "/items?search=Barang Aneh");
  expect(added[0].code).toMatch(/^KTG-ELK-\d{4}$/);
  const backups = await ok(api, "get", "/backup/database");
  expect(JSON.stringify(backups)).toMatch(/before-import|Before import/i);
});

test("an unclosed quote refuses the whole file", async ({ page }) => {
  await page.goto("/items/import");
  const bad = 'name,category,subcategory,unit\n"Tanpa tutup,Gedung Utama,ELK,pcs\n';
  await page.locator('input[type="file"]').setInputFiles({ name: "bad.csv", mimeType: "text/csv", buffer: Buffer.from(bad) });
  await expect(page.getByRole("alert").filter({ hasText: /quote/i }).first()).toBeVisible();
});

test("a long preview is paged like the Items list", async ({ page }) => {
  const rows = Array.from({ length: 30 }, (_, i) => `Barang Halaman ${i + 1},Gedung Utama,ELK,pcs`);
  const csv = ["name,category,subcategory,unit", ...rows].join("\n");
  await page.goto("/items/import");
  await page.locator('input[type="file"]').setInputFiles({ name: "long.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  const main = page.getByRole("main");
  await expect(main.getByText(/30 ready/i).first()).toBeVisible();
  await expect(main.getByRole("row", { name: /Barang Halaman 25 / })).toBeVisible();
  await expect(main.getByRole("row", { name: /Barang Halaman 26 / })).toHaveCount(0);
  await main.getByRole("button", { name: "Page 2" }).click();
  await expect(main.getByRole("row", { name: /Barang Halaman 30 / })).toBeVisible();
});
