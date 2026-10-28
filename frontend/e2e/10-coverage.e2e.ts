// Stage 6: flows Stage 5 did not cover (PRD 10.1): editing drafts, cancelling a purchase request, the KPI numbers,
// a report filter, tablet width, visible keyboard focus, and the empty and error states.
import { expect, test, type Browser } from "./fixtures";
import { ADMIN, ADMIN_STATE, STAFF, STAFF_STATE, apiAs, choose, inDays, ok, textbox } from "./helpers";

const as = async (browser: Browser, state: string) => (await browser.newContext({ storageState: state })).newPage();

test("Staff save a loan as a draft, then edit it", async ({ browser }) => {
  const page = await as(browser, STAFF_STATE);
  await page.goto("/loans/new");
  await choose(page, "Item", /Proyektor Uji/);
  await textbox(page, "Quantity").fill("1");
  await textbox(page, "Purpose").fill("Rapat mingguan");
  await page.getByRole("button", { name: "Save as draft" }).click();
  await expect(page).toHaveURL(/\/loans\/view\?id=\d+/);
  await page.getByRole("link", { name: "Edit draft" }).or(page.getByRole("button", { name: "Edit draft" })).first().click();
  await expect(page.getByRole("combobox", { name: "Item" })).toHaveValue("Proyektor Uji");
  await textbox(page, "Quantity").fill("2");
  await page.getByRole("button", { name: "Save as draft" }).click();
  await expect(page).toHaveURL(/\/loans\/view\?id=\d+/);
  await expect(page.getByText("2 pcs").first()).toBeVisible();
});

test("Staff edit a draft purchase request, submit it, then cancel it", async ({ browser }) => {
  const page = await as(browser, STAFF_STATE);
  await page.goto("/purchases/new");
  await choose(page, "Item", /Speaker Uji/);
  await textbox(page, "Quantity").fill("1");
  await textbox(page, "Reason").fill("Ruang rapat");
  await page.getByRole("button", { name: "Save as draft" }).click();
  await expect(page).toHaveURL(/\/purchases\/view\?id=\d+/);
  await page.getByRole("link", { name: "Edit draft" }).or(page.getByRole("button", { name: "Edit draft" })).first().click();
  await expect(page.getByRole("combobox", { name: "Item" })).toHaveValue("Speaker Uji");
  await textbox(page, "Quantity").fill("3");
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page.getByText("Pending Approval").first()).toBeVisible();
  await expect(page.getByText("3 pcs").first()).toBeVisible();
  await page.getByRole("button", { name: "Cancel request", exact: true }).click();
  const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog"));
  await dialog.getByRole("button", { name: "Cancel request" }).click();
  await expect(page.getByText("Cancelled", { exact: true }).first()).toBeVisible();
});

test("the stock KPIs match the item list counts", async ({ browser, baseURL }) => {
  const api = await apiAs(baseURL!, ADMIN);
  const total = async (status: string) => (await (await api.get(`/api/items?status=Active&stockStatus=${status}&pageSize=1`)).json()).meta.total as number;
  const out = await total("Out"), low = await total("Low");
  const page = await as(browser, ADMIN_STATE);
  await page.goto("/dashboard");
  const card = (label: string) => page.getByText(label, { exact: true }).locator("xpath=ancestor::*[@data-slot='card'][1]");
  await expect(card("Out of stock")).toContainText(String(out));
  await expect(card("Low-stock items")).toContainText(String(low + out));
  await expect(card("Low-stock items")).toContainText(`${low} Low and ${out} Out of stock`);
});

test("the stock report filter shows only matching rows", async ({ browser }) => {
  const page = await as(browser, ADMIN_STATE);
  await page.goto("/reports?stockStatus=Out");
  const rows = page.getByRole("table", { name: "Stock report" }).getByRole("row");
  await expect(rows.nth(1)).toBeVisible();
  for (const row of await rows.all()) if (await row.getByRole("cell").count()) await expect(row).toContainText("Out");
});

test("tablet width: main pages fit without sideways scroll", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: ADMIN_STATE, viewport: { width: 768, height: 1024 } });
  const page = await ctx.newPage();
  for (const path of ["/dashboard", "/items", "/stock/in", "/loans/new", "/purchases", "/reports"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), path).toBeLessThanOrEqual(0);
  }
});

test("keyboard focus is visible", async ({ browser }) => {
  const page = await as(browser, ADMIN_STATE);
  await page.goto("/items");
  await page.getByRole("searchbox").focus();
  await page.keyboard.press("Tab");
  const ring = await page.evaluate(() => {
    const s = getComputedStyle(document.activeElement!);
    return s.outlineStyle !== "none" || s.boxShadow !== "none";
  });
  expect(ring).toBe(true);
});

test("empty and error states", async ({ browser, baseURL }) => {
  const page = await as(browser, ADMIN_STATE);
  await page.goto("/items?search=zz-tidak-ada-zz");
  await expect(page.getByText("No items match your filters")).toBeVisible();
  await page.route("**/api/items?**", (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ success: false, error: { code: "INTERNAL_ERROR", message: "Server error" } }) }));
  await page.goto("/items");
  await expect(page.getByText("Could not load this page")).toBeVisible();
  await page.unroute("**/api/items?**");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("table", { name: "Items" }).getByRole("row").nth(1)).toBeVisible();
  expect(await ok(await apiAs(baseURL!, ADMIN), "get", "/items?pageSize=1")).toHaveLength(1);
});

test("a Staff draft whose item was deactivated shows the item and a warning (S6-09)", async ({ browser, baseURL }) => {
  const admin = await apiAs(baseURL!, ADMIN), staff = await apiAs(baseURL!, STAFF);
  const [item] = await ok(admin, "get", "/items?search=Kursi Lipat Uji");
  const me = await ok(staff, "get", "/auth/me");
  const draft = await ok(staff, "post", "/loans", {
    borrowerId: me.id, lines: [{ itemId: item.id, quantity: 1 }], loanDate: inDays(0), expectedReturnDate: inDays(2),
    purpose: "Cek barang nonaktif", notes: "", submit: false, clientRequestId: crypto.randomUUID(),
  });
  await ok(admin, "post", `/items/${item.id}/deactivate`);
  try {
    const page = await as(browser, STAFF_STATE);
    await page.goto(`/loans/edit?id=${draft.id}`);
    await expect(page.getByRole("combobox", { name: "Item" })).toHaveValue("Kursi Lipat Uji");
    await expect(page.getByRole("alert").filter({ hasText: "Kursi Lipat Uji is no longer active. Choose another item." })).toBeVisible();
  } finally {
    await ok(admin, "post", `/items/${item.id}/activate`);
  }
});
