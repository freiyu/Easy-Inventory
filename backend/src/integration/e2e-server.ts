// The app for the Playwright E2E run and TestSprite (PRD 0.4 Stage 5): ezi_test and its own data folder, so ezi_dev
// and its backups (14 kept) are never touched. By default ezi_test is rebuilt empty, like a fresh install;
// E2E_KEEP=1 keeps the data a previous run left (fake data only).
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { dropAllTables } from "./global-setup";
import { assertTestDatabase, testEnv } from "./test-env";

const { databaseUrl } = testEnv();
const dataDir = path.resolve("data/e2e");
assertTestDatabase(databaseUrl);

if (!process.env.E2E_KEEP) {
  rmSync(dataDir, { recursive: true, force: true });
  await dropAllTables(databaseUrl);
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: databaseUrl, PRISMA_HIDE_UPDATE_MESSAGE: "1" },
    stdio: "inherit",
  });
}

// testEnv() loaded backend/.env (ezi_dev); these override it before env.ts reads them.
Object.assign(process.env, {
  DATABASE_URL: databaseUrl,
  DATA_DIR: dataDir,
  PORT: process.env.E2E_PORT ?? "4100",
  HOST: "127.0.0.1",
  SESSION_SECRET: "e2e-test-secret",
  STATIC_DIR: path.resolve("../frontend/out"),
});
await import("../main");
