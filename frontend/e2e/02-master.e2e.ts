// PRD 10.1 CRUD for categories, subcategories (4.3A), suppliers and items, as Admin through the UI.
import { expect, test } from "./fixtures";
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
  // Shown once, under the field (S5-01).
  await expect(dialog.getByText("This category code is already used.")).toHaveCount(1);
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

test("items: Code, Supplier and Location start hidden; the column picker shows them and the choice survives a reload", async ({ page }) => {
  await page.goto("/items");
  const table = page.getByRole("table", { name: "Items" });
  const header = (name: RegExp) => table.getByRole("columnheader", { name });
  for (const name of [/Code/, /supplier/i, /Location/]) await expect(header(name)).toHaveCount(0);
  await page.getByRole("button", { name: "Columns" }).click();
  await expect(page.getByRole("menuitemcheckbox", { name: "Name" })).toBeDisabled();
  await page.getByRole("menuitemcheckbox", { name: "Location" }).click();
  await page.keyboard.press("Escape");
  await expect(header(/Location/)).toHaveCount(1);
  await page.reload();
  await expect(header(/Location/)).toHaveCount(1);
  await expect(header(/Code/)).toHaveCount(0);
  await page.getByRole("button", { name: "Columns" }).click();
  await page.getByRole("menuitem", { name: "Show all columns" }).click();
  await expect(header(/Code/)).toHaveCount(1);
  await expect(header(/supplier/i)).toHaveCount(1);
});

test("items: Admin sees the QR code with its code and a Print label button on the detail page", async ({ page }) => {
  await page.goto("/items");
  await page.getByRole("link", { name: "Proyektor Uji" }).click();
  const main = page.getByRole("main");
  await expect(main.getByRole("img", { name: /QR code: Proyektor Uji/ })).toBeVisible();
  await expect(main.getByRole("figure")).toContainText(/[A-Z]{3}-[A-Z]{3}-\d{4}/);
  await expect(main.getByRole("button", { name: "Print label" })).toBeVisible();
  // The PNG download is a real PNG file named after the item, not after the code.
  const [download] = await Promise.all([page.waitForEvent("download"), main.getByRole("button", { name: "Download PNG" }).click()]);
  expect(download.suggestedFilename()).toBe("qr-Proyektor Uji.png");
  const file = await download.path();
  expect((await import("node:fs")).readFileSync(file).subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
});

// A 1x1 PNG: enough for the server to accept it and the browser to decode it.
const PNG_1X1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const photoImg = (page: import("@playwright/test").Page, name: string) => page.getByRole("main").getByRole("img", { name, exact: true });

test("items: Admin adds a photo in the edit form, a bad file is refused inline, and the photo shows on the detail page", async ({ page }) => {
  await page.goto("/items");
  await page.getByRole("link", { name: "Proyektor Uji" }).click();
  await expect(page.getByRole("main").getByText("No photo")).toBeVisible();
  await page.getByRole("link", { name: "Edit" }).click();
  const file = page.getByLabel("Photo", { exact: true });
  await file.setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await expect(page.getByText("The photo must be a JPEG, PNG or WebP image.")).toBeVisible();
  await file.setInputFiles({ name: "p.png", mimeType: "image/png", buffer: PNG_1X1 });
  await expect(page.getByText("New photo selected. It is saved with the item.")).toBeVisible();
  await page.getByRole("button", { name: "Save item" }).click();
  const img = photoImg(page, "Proyektor Uji");
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
});

test("items: Admin removes a photo from the edit form", async ({ page }) => {
  await page.goto("/items");
  await page.getByRole("link", { name: "Kursi Lipat Uji" }).click();
  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByLabel("Photo", { exact: true }).setInputFiles({ name: "p.png", mimeType: "image/png", buffer: PNG_1X1 });
  await page.getByRole("button", { name: "Save item" }).click();
  await expect(photoImg(page, "Kursi Lipat Uji")).toBeVisible();
  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByRole("button", { name: "Remove photo" }).click();
  await page.getByRole("button", { name: "Save item" }).click();
  await expect(page.getByRole("main").getByText("No photo")).toBeVisible();
});

test("items: the secondary filters sit behind More filters", async ({ page }) => {
  await page.goto("/items");
  await expect(page.getByRole("combobox", { name: "Preferred supplier" })).toHaveCount(0);
  await page.getByRole("button", { name: "More filters" }).click();
  for (const name of ["Preferred supplier", "Location", "Record status"]) await expect(page.getByRole("combobox", { name })).toBeVisible();
  // A select inside the popover still works: picking a value applies the filter and the button counts it.
  await page.getByRole("combobox", { name: "Record status" }).click();
  await page.getByRole("option", { name: "Inactive items" }).click();
  await expect(page.getByRole("button", { name: "More filters (1)" })).toBeVisible();
  await expect(page).toHaveURL(/status=Inactive/);
});

test("items: filter by subcategory", async ({ page }) => {
  await page.goto("/items");
  await choose(page, "Subcategory", /Furnitur/);
  const rows = page.getByRole("table", { name: "Items" }).getByRole("row");
  await expect(rows.filter({ hasText: "Kursi Lipat Uji" })).toHaveCount(1);
  await expect(rows.filter({ hasText: "Proyektor Uji" })).toHaveCount(0);
});
