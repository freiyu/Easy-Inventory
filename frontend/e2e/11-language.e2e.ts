// PRD 4.13 (v14): Bahasa Indonesia is the default; the user menu switches the language for this browser,
// and the server answers in the chosen language.
import { expect, test, type Browser } from "./fixtures";
import { ADMIN_PAGES, ADMIN_STATE, STAFF_PAGES, STAFF_STATE } from "./helpers";

const fresh = async (browser: Browser, state?: string) => (await browser.newContext(state ? { storageState: state } : {})).newPage();

test("a browser with no choice shows the app in Bahasa Indonesia", async ({ browser }) => {
  const page = await fresh(browser);
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Masuk" })).toBeVisible();
  await expect(page.getByText("Tetap masuk selama 14 hari")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.lang)).toBe("id");
});

test("the user menu switches to Bahasa Indonesia and back", async ({ browser }) => {
  const page = await fresh(browser, ADMIN_STATE);
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitemradio", { name: "Bahasa Indonesia" }).click();
  await expect(page.getByRole("heading", { name: "Beranda" })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Navigasi utama" });
  for (const label of ["Barang", "Transaksi stok", "Peminjaman", "Pengajuan beli", "Cadangan data"]) await expect(nav.getByRole("link", { name: label })).toBeVisible();

  await page.getByRole("button", { name: "Menu akun" }).click();
  await page.getByRole("menuitemradio", { name: "English" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});

test("Staff see Indonesian labels and server messages in Indonesian", async ({ browser }) => {
  const page = await fresh(browser, STAFF_STATE);
  await page.addInitScript(() => localStorage.setItem("ezi-lang", "id"));
  await page.goto("/items");
  await expect(page.getByRole("heading", { name: "Barang" })).toBeVisible();
  await expect(page.getByText("Tersedia").first()).toBeVisible();

  // The server refuses an Admin page for Staff in the chosen language.
  const res = await page.evaluate(async () => (await fetch("/api/users", { headers: { "X-EZI-Lang": "id" } })).json());
  expect(res.error.message).toBe("Anda tidak punya izin untuk melakukan ini.");
});

// Indonesian words are longer: every page still fits a 390 px phone and logs no error.
for (const { role, state, pages } of [{ role: "Admin", state: ADMIN_STATE, pages: ADMIN_PAGES }, { role: "Staff", state: STAFF_STATE, pages: STAFF_PAGES }]) {
  test(`${role} pages in Bahasa Indonesia fit a phone`, async ({ browser }) => {
    test.setTimeout(120_000);
    const context = await browser.newContext({ storageState: state, viewport: { width: 390, height: 844 } });
    await context.addInitScript(() => localStorage.setItem("ezi-lang", "id"));
    const page = await context.newPage();
    const problems: string[] = [];
    page.on("console", (m) => m.type() === "error" && problems.push(`${page.url()}: console ${m.text()}`));
    page.on("pageerror", (e) => problems.push(`${page.url()}: ${e.message}`));
    for (const path of pages) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (overflow > 1) problems.push(`${path}: scrolls sideways by ${overflow}px`);
      if (await page.getByText("Anda tidak punya akses ke halaman ini").count()) problems.push(`${path}: no access`);
    }
    await context.close();
    expect(problems).toEqual([]);
  });
}
