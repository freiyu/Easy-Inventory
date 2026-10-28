// PRD 10.1 Purchase requests (4.6A, 6.2A, BR-27..BR-31): approval reserves nothing, receive posts one IN and
// creates new items with a generated code, receiving twice is impossible, Staff never see price or supplier.
import { expect, test, type Browser, type Page } from "./fixtures";
import { ADMIN, ADMIN_STATE, STAFF_STATE, apiAs, choose, inDays, ok, textbox } from "./helpers";

test.describe.configure({ mode: "serial" });

const as = async (browser: Browser, state: string) => (await browser.newContext({ storageState: state })).newPage();

async function stockOf(page: Page, item: string) {
  await page.goto(`/items?search=${encodeURIComponent(item)}`);
  await page.getByRole("link", { name: item }).click();
  return (await page.getByRole("term").filter({ hasText: "Current stock" }).locator("xpath=following-sibling::dd[1]").innerText()).trim();
}

async function press(page: Page, id: string, button: string, reason?: string) {
  await page.goto(`/purchases/view?id=${id}`);
  await page.getByRole("button", { name: button, exact: true }).click();
  const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog"));
  if (await dialog.waitFor({ timeout: 1500 }).then(() => true, () => false)) {
    if (reason) await dialog.getByRole("textbox").first().fill(reason);
    await dialog.getByRole("button").filter({ hasNotText: /^(Cancel|Close)$/ }).last().click();
  }
  return dialog;
}

let requestId = "";

test("Staff request an existing item and a new item, without price or supplier fields", async ({ browser }) => {
  const staff = await as(browser, STAFF_STATE);
  await staff.goto("/purchases/new");
  await expect(staff.getByText(/price|supplier/i)).toHaveCount(0);
  await choose(staff, "Item", /Kabel HDMI Uji/);
  await textbox(staff, "Quantity").fill("10");
  await staff.getByRole("button", { name: "Add another item" }).click();
  await staff.getByRole("button", { name: "New item" }).nth(1).click();
  await textbox(staff, "Item name").fill("Pointer Laser Uji");
  await staff.getByRole("textbox", { name: "Quantity" }).nth(1).fill("2");
  await choose(staff, "Category", /Gedung Utama/);
  await choose(staff, "Subcategory", /Elektronik/);
  await choose(staff, "Unit", /pcs/);
  await textbox(staff, "Reason").fill("Stok kabel menipis");
  await staff.getByRole("button", { name: "Submit request" }).click();
  await expect(staff).toHaveURL(/\/purchases\/view\?id=\d+/);
  requestId = new URL(staff.url()).searchParams.get("id")!;
  await expect(staff.getByText("Pending Approval").first()).toBeVisible();
  await expect(staff.getByText(/New item/).first()).toBeVisible();
});

test("a new-item line creates no item before it is received", async ({ baseURL }) => {
  const api = await apiAs(baseURL!, ADMIN);
  expect(await ok(api, "get", "/items?search=Pointer")).toHaveLength(0);
});

test("approval changes no stock; an Admin cannot approve their own request", async ({ browser, baseURL }) => {
  const admin = await as(browser, ADMIN_STATE);
  const before = await stockOf(admin, "Kabel HDMI Uji");
  await press(admin, requestId, "Approve request");
  await admin.goto(`/purchases/view?id=${requestId}`);
  await expect(admin.getByText("Approved", { exact: true }).first()).toBeVisible();
  expect(await stockOf(admin, "Kabel HDMI Uji")).toBe(before);

  const api = await apiAs(baseURL!, ADMIN);
  const items = await ok(api, "get", "/items?search=Speaker");
  const me = await ok(api, "get", "/auth/me");
  const own = await ok(api, "post", "/purchase-requests", { requesterId: me.id, lines: [{ itemId: items[0].id, quantity: 1 }], reason: "Untuk ruang rapat", neededBy: inDays(30), submit: true, clientRequestId: crypto.randomUUID() });
  await admin.goto(`/purchases/view?id=${own.id}`);
  await expect(admin.getByRole("button", { name: "Approve request", exact: true })).toHaveCount(0);
  expect((await (await api.post(`/api/purchase-requests/${own.id}/approve`, { data: {} })).json()).success).toBe(false);
});

test("receive posts the stock, creates the new item with a generated code, and only once", async ({ browser }) => {
  const admin = await as(browser, ADMIN_STATE);
  await admin.goto(`/purchases/view?id=${requestId}`);
  await admin.getByRole("button", { name: "Record received", exact: true }).click();
  const dialog = admin.getByRole("dialog");
  const newLine = dialog.getByRole("group", { name: /Pointer Laser Uji/ });
  await newLine.getByRole("textbox", { name: "Minimum stock" }).fill("1");
  await newLine.getByRole("textbox", { name: "Unit price (IDR)" }).fill("75000");
  await expect(dialog.getByText("Rp 650.000")).toBeVisible();
  await dialog.getByRole("button", { name: "Record received" }).click();
  await expect(dialog).toBeHidden();
  await admin.goto(`/purchases/view?id=${requestId}`);
  await expect(admin.getByText("Received", { exact: true }).first()).toBeVisible();
  await expect(admin.getByRole("button", { name: "Record received", exact: true })).toHaveCount(0);

  expect(await stockOf(admin, "Kabel HDMI Uji")).toBe("11 pcs");
  expect(await stockOf(admin, "Pointer Laser Uji")).toBe("2 pcs");
  await expect(admin.getByText(/GDU-ELK-\d{4}/).first()).toBeVisible();
});

test("the received new item got the next code in its category and subcategory", async ({ baseURL }) => {
  const api = await apiAs(baseURL!, ADMIN);
  const [pointer] = await ok(api, "get", "/items?search=Pointer Laser Uji");
  expect(pointer.code).toBe("GDU-ELK-0004");
  expect(pointer.minimumStock).toBe(1);
});

test("reject needs a reason; Staff see only their own requests and no prices", async ({ browser }) => {
  const staff = await as(browser, STAFF_STATE);
  await staff.goto("/purchases/new");
  await choose(staff, "Item", /Speaker Uji/);
  await textbox(staff, "Quantity").fill("1");
  await textbox(staff, "Reason").fill("Cadangan");
  await staff.getByRole("button", { name: "Submit request" }).click();
  await expect(staff).toHaveURL(/\/purchases\/view\?id=\d+/);
  const id = new URL(staff.url()).searchParams.get("id")!;

  const admin = await as(browser, ADMIN_STATE);
  await press(admin, id, "Reject", "Belum perlu");
  await staff.goto(`/purchases/view?id=${id}`);
  await expect(staff.getByText("Rejected").first()).toBeVisible();
  await expect(staff.getByText("Belum perlu")).toBeVisible();

  await staff.goto("/purchases");
  await expect(staff.getByRole("row", { name: /PR-/ }).first()).toBeVisible();
  await expect(staff.getByText("Untuk ruang rapat")).toHaveCount(0);
  await expect(staff.getByText(/Rp\s/)).toHaveCount(0);
});
