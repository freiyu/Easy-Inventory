import { defineConfig, env } from "prisma/config";

try {
  process.loadEnvFile(".env");
} catch {
  // no .env file: the variables come from the environment (installer config)
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: env("DATABASE_URL"), shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL },
});
