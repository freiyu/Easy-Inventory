// Runs first on an empty ezi_test: first-run setup through the UI (PRD 3.3), then fake master data through the API,
// and one saved session per role for the other files.
import { english, expect, test } from "./fixtures";
import { ADMIN, ADMIN_STATE, STAFF, STAFF_STATE, apiAs, ok, signIn, textbox } from "./helpers";

test("first-run setup creates the Admin once, then seeds fake data", async ({ page, baseURL, browser }) => {
  await page.goto("/login");
  await expect(page).toHaveURL(/\/setup/);
  await textbox(page, "Full name").fill(ADMIN.name);
  await textbox(page, "Email").fill(ADMIN.email);
  await textbox(page, "Password").fill(ADMIN.password);
  await textbox(page, "Confirm password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Create Admin account" }).click();
  await expect(page).toHaveURL(/\/login/);

  // Works once only: a second setup is refused.
  const anon = await (await import("@playwright/test")).request.newContext({ baseURL });
  const again = await anon.post("/api/setup/first-admin", { data: { name: "X", email: "x@example.test", password: "another-pass-1" } });
  expect(again.status()).toBe(403);

  const admin = await apiAs(baseURL!, ADMIN);
  const created = await ok(admin, "post", "/users", { name: STAFF.name, email: STAFF.email, role: "Staff" });
  const staff = await apiAs(baseURL!, { email: STAFF.email, password: created.tempPassword });
  await ok(staff, "post", "/auth/change-password", { password: STAFF.password });

  const cat = await ok(admin, "post", "/categories", { name: "Gedung Utama", code: "GDU" });
  const sub = await ok(admin, "post", "/subcategories", { name: "Elektronik", code: "ELK" });
  const sup = await ok(admin, "post", "/suppliers", { name: "Toko Contoh" });
  const item = (name: string, openingStock: number, minimumStock: number) =>
    ok(admin, "post", "/items", { name, categoryId: cat.id, subcategoryId: sub.id, unit: "pcs", openingStock, minimumStock, lastPurchasePrice: 150000, supplierId: sup.id, location: "Rak A" });
  await item("Proyektor Uji", 5, 1);
  await item("Kabel HDMI Uji", 2, 3);
  await item("Speaker Uji", 0, 1);

  await signIn(page, ADMIN);
  await expect(page).toHaveURL(/\/dashboard/);
  await page.context().storageState({ path: ADMIN_STATE });

  const staffContext = await browser.newContext();
  await english(staffContext);
  const staffPage = await staffContext.newPage();
  await signIn(staffPage, STAFF);
  await expect(staffPage).toHaveURL(/\/dashboard/);
  await staffPage.context().storageState({ path: STAFF_STATE });
});
