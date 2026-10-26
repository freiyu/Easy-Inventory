// Integration tests against a real MySQL (PRD 0.4 Stage 4): `npm run test:integration`.
// Each run drops every table in ezi_test and rebuilds it from the migrations.
import { defineConfig } from "vitest/config";
import { testEnv } from "./src/integration/test-env.ts";

const env = testEnv();

export default defineConfig({
  test: {
    include: ["src/integration/**/*.test.ts"],
    globalSetup: ["src/integration/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
    env: {
      DATABASE_URL: env.databaseUrl,
      RESTORE_DATABASE_URL: env.restoreUrl,
      DATA_DIR: env.dataDir,
      SESSION_SECRET: "integration-test-secret",
      STATIC_DIR: `${env.dataDir}/static`, // a tiny export-shaped fixture made by global-setup.ts
      TZ: "Asia/Jakarta",
    },
  },
});
