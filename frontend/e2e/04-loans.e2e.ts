// PRD 10.1 Loans (4.6, 6.2): Staff request, Admin approve (reserves), issue (deducts), full return (restores),
// reject with reason, cancel releases the reservation, self-approval blocked, Staff see only their own loans.
import { expect, test, type Browser, type Page } from "./fixtures";
import { ADMIN, ADMIN_STATE, STAFF_STATE, apiAs, choose, inDays, ok, textbox } from "./helpers";

test.describe.configure({ mode: "serial" });

const as = async (browser: Browser, state: string) => (await browser.newContext({ storageState: state })).newPage();

async function requestLoan(page: Page, item: RegExp, qty: string, purpose: string) {
  await page.goto("/loans/new");
  await choose(page, "Item", item);
  await textbox(page, "Quantity").fill(qty);
  await textbox(page, "Purpose").fill(purpose);
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page).toHaveURL(/\/loans\/view\?id=\d+/);
  return new URL(page.url()).searchParams.get("id")!;
}

async function act(page: Page, id: string, button: string, reason?: string) {
  await page.goto(`/loans/view?id=${id}`);
  await page.getByRole("button", { name: button, exact: true }).click();
  // Approve runs at once; the other actions confirm in a dialog.
  const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog"));
  if (await dialog.waitFor({ timeout: 1500 }).then(() => true, () => false)) {
    if (reason) await dialog.getByRole("textbox").first().fill(reason);
    await dialog.getByRole("button").filter({ hasNotText: /^(Cancel|Close)$/ }).last().click();
    await expect(dialog).toBeHidden();
  }
  await page.waitForLoadState("networkidle");
}

async function stockLine(page: Page, item: string) {
  await page.goto("/items");
  await page.getByRole("link", { name: item }).click();
  const value = async (term: string) => (await page.getByRole("term").filter({ hasText: term }).locator("xpath=following-sibling::dd[1]").innerText()).trim();
  return { stock: await value("Current stock"), reserved: await value("Reserved by approved loans"), available: await value("Available for loan") };
}

let loanId = "";

test("return date before the loan date is refused", async ({ browser }) => {
  const staff = await as(browser, STAFF_STATE);
  await staff.goto("/loans/new");
  await choose(staff, "Item", /Proyektor Uji/);
  await textbox(staff, "Quantity").fill("1");
  await textbox(staff, "Purpose").fill("Uji tanggal");
  await textbox(staff, "Loan date").fill(inDays(40));
  await textbox(staff, "Expected return date").fill(inDays(30));
  await staff.getByRole("button", { name: "Submit request" }).click();
  await expect(staff).toHaveURL(/\/loans\/new/);
  await expect(staff.getByText(/return date/i).filter({ hasText: /after|before|on or after/i }).first()).toBeVisible();
});

test("Staff request, Admin approve reserves stock, outgoing cannot use it", async ({ browser, baseURL }) => {
  const staff = await as(browser, STAFF_STATE);
  loanId = await requestLoan(staff, /Proyektor Uji/, "2", "Presentasi klien");
  await expect(staff.getByText("Pending Approval").first()).toBeVisible();

  const admin = await as(browser, ADMIN_STATE);
  await act(admin, loanId, "Approve loan");
  await expect(admin.getByText("Approved", { exact: true }).first()).toBeVisible();
  expect(await stockLine(admin, "Proyektor Uji")).toEqual({ stock: "5 pcs", reserved: "2", available: "3" });

  const api = await apiAs(baseURL!, ADMIN);
  const items = await ok(api, "get", "/items?search=Proyektor");
  const res = await api.post("/api/stock/out", { data: { date: inDays(0), destination: "Uji", lines: [{ itemId: items[0].id, quantity: 4 }], clientRequestId: crypto.randomUUID() } });
  const body = await res.json();
  expect(body.error?.code, JSON.stringify(body)).toBe("INSUFFICIENT_STOCK");
});

test("issue deducts stock, full return restores it and completes the loan", async ({ browser }) => {
  const admin = await as(browser, ADMIN_STATE);
  await act(admin, loanId, "Issue items");
  expect(await stockLine(admin, "Proyektor Uji")).toEqual({ stock: "3 pcs", reserved: "0", available: "3" });

  await act(admin, loanId, "Record return");
  await admin.goto(`/loans/view?id=${loanId}`);
  await expect(admin.getByText("Completed").first()).toBeVisible();
  expect(await stockLine(admin, "Proyektor Uji")).toEqual({ stock: "5 pcs", reserved: "0", available: "5" });
});

test("reject needs a reason and the Staff user sees it", async ({ browser }) => {
  const staff = await as(browser, STAFF_STATE);
  const id = await requestLoan(staff, /Speaker Uji/, "1", "Acara kantor");
  const admin = await as(browser, ADMIN_STATE);
  await act(admin, id, "Reject", "Speaker dipakai acara lain");
  await staff.goto(`/loans/view?id=${id}`);
  await expect(staff.getByText("Rejected").first()).toBeVisible();
  await expect(staff.getByText("Speaker dipakai acara lain")).toBeVisible();
});

test("cancelling an approved loan releases the reservation", async ({ browser }) => {
  const staff = await as(browser, STAFF_STATE);
  const id = await requestLoan(staff, /Kursi Lipat Uji/, "2", "Rapat besar");
  const admin = await as(browser, ADMIN_STATE);
  await act(admin, id, "Approve loan");
  expect((await stockLine(admin, "Kursi Lipat Uji")).available).toBe("2");
  await act(admin, id, "Cancel loan");
  expect((await stockLine(admin, "Kursi Lipat Uji")).available).toBe("4");
});

test("an Admin cannot approve their own loan; Staff never see it", async ({ browser, baseURL }) => {
  const admin = await as(browser, ADMIN_STATE);
  const id = await requestLoan(admin, /Kursi Lipat Uji/, "1", "Pinjam sendiri");
  await admin.goto(`/loans/view?id=${id}`);
  await expect(admin.getByRole("button", { name: "Approve loan", exact: true })).toHaveCount(0);
  const api = await apiAs(baseURL!, ADMIN);
  const res = await api.post(`/api/loans/${id}/approve`, { data: {} });
  expect((await res.json()).success).toBe(false);

  const staff = await as(browser, STAFF_STATE);
  await staff.goto("/loans");
  await expect(staff.getByRole("table", { name: "Loans" }).getByRole("row", { name: /LN-/ }).first()).toBeVisible();
  await expect(staff.getByRole("row", { name: /Kursi Lipat Uji x1/ })).toHaveCount(0);
  const direct = await staff.request.get(`/api/loans/${id}`);
  expect([403, 404]).toContain(direct.status());
});
