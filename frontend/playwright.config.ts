// E2E user flows per role (PRD 0.4 Stage 5, Section 10): `npm run e2e` builds the static export, then the backend
// serves it on one port against ezi_test (backend `npm run e2e:server`), never ezi_dev.
// Files are *.e2e.ts so Vitest does not pick them up.
import { defineConfig, devices } from "@playwright/test";

export const BASE_URL = "http://127.0.0.1:4100";

export default defineConfig({
  testDir: "e2e",
  testMatch: /.*\.e2e\.ts/,
  // One shared database: files run one at a time, in name order.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: BASE_URL, locale: "en-GB", timezoneId: "Asia/Jakarta", trace: "retain-on-failure" },
  projects: [
    { name: "setup", testMatch: /setup\.e2e\.ts/ },
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, dependencies: ["setup"], testIgnore: /setup\.e2e\.ts/ },
  ],
  webServer: {
    command: "npm --prefix ../backend run e2e:server",
    url: `${BASE_URL}/api/setup/status`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
