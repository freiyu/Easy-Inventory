// PRD 10.1 UX and 5.6: every page per role on desktop and a 390 px phone, light and dark: it renders, has no
// console errors and never scrolls sideways.
import { expect, test } from "./fixtures";
import { ADMIN_PAGES, ADMIN_STATE, STAFF_PAGES, STAFF_STATE } from "./helpers";


const roles = [
  { role: "Admin", state: ADMIN_STATE, pages: ADMIN_PAGES },
  { role: "Staff", state: STAFF_STATE, pages: STAFF_PAGES },
];
const screens = [
  { name: "desktop", viewport: { width: 1366, height: 800 } },
  { name: "phone", viewport: { width: 390, height: 844 } },
];

for (const { role, state, pages } of roles) {
  for (const screen of screens) {
    for (const colorScheme of ["light", "dark"] as const) {
      test(`${role} pages on ${screen.name}, ${colorScheme}`, async ({ browser }) => {
        test.setTimeout(120_000);
        const context = await browser.newContext({ storageState: state, viewport: screen.viewport, colorScheme });
        const page = await context.newPage();
        const problems: string[] = [];
        page.on("console", (m) => m.type() === "error" && problems.push(`${page.url()}: console ${m.text()}`));
        page.on("pageerror", (e) => problems.push(`${page.url()}: ${e.message}`));
        for (const path of pages) {
          await page.goto(path);
          await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
          await page.waitForLoadState("networkidle");
          await expect(page.locator("html")).toHaveClass(colorScheme === "dark" ? /dark/ : /^(?!.*dark).*$/);
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          if (overflow > 1) problems.push(`${path}: scrolls sideways by ${overflow}px`);
          if (await page.getByText("You do not have access to this page").count()) problems.push(`${path}: no access`);
          if (await page.getByText(/not found/i).count()) problems.push(`${path}: record not found`);
        }
        await context.close();
        expect(problems).toEqual([]);
      });
    }
  }
}
