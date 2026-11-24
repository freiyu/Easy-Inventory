// The program-update notice and controls (v1.2, docs/docs-1.2/UPDATE-DESIGN.md). The real updater is a Windows task, so these
// tests play its part: they write the same status files it writes into the backend's data folder and watch the page follow.
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Browser, type Page } from "./fixtures";
import { ADMIN_STATE, STAFF_STATE } from "./helpers";

const DIR = path.resolve("../backend/data/e2e/update");
const status = (patch: Record<string, unknown>) => {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(path.join(DIR, "status.json"), JSON.stringify({ checkedAt: "2026-12-01T00:00:00.000Z", releaseId: 1, ...patch }));
};
const NEWER = { latest: "9.9.9" };
const REQUEST = path.join(DIR, "flags", "install-now");
const OFF = path.join(DIR, "flags", "auto-update.off");

test.beforeEach(() => rmSync(DIR, { recursive: true, force: true }));
test.afterAll(() => rmSync(DIR, { recursive: true, force: true }));

const page = async (browser: Browser, state: string, init?: () => void) => {
  const context = await browser.newContext({ storageState: state, viewport: { width: 1280, height: 800 } });
  if (init) await context.addInitScript(init);
  return context.newPage();
};
const noSideScroll = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test("Staff never see the notice and cannot call the update endpoints", async ({ browser }) => {
  status(NEWER);
  const staff = await page(browser, STAFF_STATE);
  await staff.goto("/dashboard");
  await expect(staff.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(staff.getByText(/Version 9\.9\.9 is available/)).toHaveCount(0);
  for (const [method, url] of [["get", "/api/admin/update"], ["post", "/api/admin/update/install"], ["put", "/api/admin/update"]] as const) {
    const r = await staff.request[method](url, method === "put" ? { data: { autoEnabled: false } } : undefined);
    expect(r.status(), `${method} ${url}`).toBe(403);
  }
});

test("offline or unknown shows nothing; a newer version shows the notice with Update now", async ({ browser }) => {
  status({ lastError: "Cannot reach api.github.com: offline" });
  const admin = await page(browser, ADMIN_STATE);
  await admin.goto("/dashboard");
  await expect(admin.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(admin.getByText(/Cannot reach|offline|Version .* is available/)).toHaveCount(0);

  status(NEWER);
  await admin.reload();
  const notice = admin.getByRole("status").filter({ hasText: "Version 9.9.9 is available" });
  await expect(notice).toContainText("installs by itself when nobody is using EZI");
  await expect(notice.getByRole("button", { name: "Update now" })).toBeVisible();
});

test("Update now: confirm, queued, downloading, installing, failed, close, try again", async ({ browser }) => {
  status(NEWER);
  const admin = await page(browser, ADMIN_STATE);
  await admin.goto("/dashboard");
  await admin.getByRole("status").filter({ hasText: "Version 9.9.9" }).getByRole("button", { name: "Update now" }).click();
  const dialog = admin.getByRole("alertdialog");
  await expect(dialog).toContainText("EZI restarts for about a minute");
  await dialog.getByRole("button", { name: "Update now" }).click();
  await expect(admin.getByRole("status").filter({ hasText: "Update requested" })).toBeVisible();
  expect(existsSync(REQUEST)).toBe(true);

  // The updater picks it up: downloading, then installing (it removes the request when the installer starts).
  status({ ...NEWER, phase: "downloading" });
  await expect(admin.getByRole("status").filter({ hasText: "Downloading version 9.9.9" })).toBeVisible({ timeout: 10_000 });
  rmSync(REQUEST);
  status({ ...NEWER, phase: "installing" });
  await expect(admin.getByRole("status").filter({ hasText: "Installing version 9.9.9" })).toContainText("reconnects by itself", { timeout: 10_000 });

  // The installer failed: the Admin is told, can close the message, or try again.
  status({ ...NEWER, phase: null, installError: "The installer stopped with code 5. EZI was started again." });
  const failed = admin.getByRole("alert").filter({ hasText: "could not be installed" });
  await expect(failed).toContainText("code 5", { timeout: 10_000 });
  await failed.getByRole("button", { name: "Close" }).click();
  await expect(failed).toHaveCount(0);
  await admin.reload();
  await expect(admin.getByRole("alert").filter({ hasText: "could not be installed" })).toBeVisible(); // a new page load shows it again
  await admin.getByRole("alert").getByRole("button", { name: "Try again" }).click();
  await admin.getByRole("alertdialog").getByRole("button", { name: "Update now" }).click();
  await expect(admin.getByRole("status").filter({ hasText: "Update requested" })).toBeVisible();
  expect(existsSync(REQUEST)).toBe(true);
});

test("the Backup page shows both versions and the automatic-update switch", async ({ browser }) => {
  status(NEWER);
  const admin = await page(browser, ADMIN_STATE);
  await admin.goto("/backup");
  const card = admin.locator("[data-slot=card]").filter({ has: admin.getByRole("heading", { name: "Program updates" }) });
  await expect(card).toContainText("Installed version");
  await expect(card).toContainText("9.9.9");
  const auto = card.getByRole("checkbox", { name: "Install updates automatically" });
  await expect(auto).toBeChecked();

  await auto.click();
  await expect(admin.getByText("Automatic update is off.", { exact: true }).first()).toBeVisible();
  expect(existsSync(OFF)).toBe(true);
  await expect(admin.getByRole("status").filter({ hasText: "Version 9.9.9 is available. Automatic update is off." })).toBeVisible();
  await expect(card.getByRole("button", { name: "Update now" })).toBeVisible(); // still possible with the switch off

  await auto.click();
  await expect(auto).toBeChecked();
  expect(existsSync(OFF)).toBe(false);
});

test("up to date: the Backup page says so and there is no notice", async ({ browser }) => {
  status({ latest: "1.2.0" });
  const admin = await page(browser, ADMIN_STATE);
  await admin.goto("/backup");
  await expect(admin.getByText("EZI is up to date.")).toBeVisible();
  await expect(admin.getByRole("status")).toHaveCount(0);
});

for (const [lang, theme, text] of [
  ["id", "light", "Versi 9.9.9 tersedia"],
  ["en", "dark", "Version 9.9.9 is available"],
  ["id", "dark", "Versi 9.9.9 tersedia"],
] as const) {
  test(`the notice and the card fit a phone (390 px): ${lang}, ${theme}`, async ({ browser }) => {
    status(NEWER);
    const context = await browser.newContext({ storageState: ADMIN_STATE, viewport: { width: 390, height: 844 } });
    await context.addInitScript(([l, th]) => { localStorage.setItem("ezi-lang", l); localStorage.setItem("ezi-theme", th); }, [lang, theme]);
    const phone = await context.newPage();
    await phone.goto("/backup");
    await expect(phone.getByRole("status").filter({ hasText: text })).toBeVisible();
    await expect(phone.locator("html")).toHaveClass(theme === "dark" ? /dark/ : /^((?!dark).)*$/);
    expect(await noSideScroll(phone)).toBe(true);
  });
}
