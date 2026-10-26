// Unit tests (`npm test`). The MySQL integration tests have their own config: vitest.integration.config.ts.
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: { exclude: [...configDefaults.exclude, "src/integration/**"] },
});
