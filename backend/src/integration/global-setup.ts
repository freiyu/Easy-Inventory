// Before the integration run: empty ezi_test completely and rebuild it with `prisma migrate deploy`, so every run
// also proves the committed migrations build the schema from nothing and seed only the two roles (PRD 0.4 Stage 4).
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../generated/prisma/client";
import { assertTestDatabase, testEnv } from "./test-env";

/** A Prisma client on any URL (the app's own client is bound to DATABASE_URL). */
export function clientFor(databaseUrl: string) {
  const url = new URL(databaseUrl.replace(/^mysql:/, "mariadb:"));
  url.searchParams.set("allowPublicKeyRetrieval", "true");
  return new PrismaClient({ adapter: new PrismaMariaDb(url.toString()) });
}

/** Drops every table, so the database is as empty as a fresh install. */
export async function dropAllTables(databaseUrl: string) {
  assertTestDatabase(databaseUrl);
  const db = clientFor(databaseUrl);
  try {
    await db.$transaction(async (tx) => {
      const tables = await tx.$queryRaw<{ name: string }[]>`SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()`;
      await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 0");
      for (const { name } of tables) await tx.$executeRawUnsafe(`DROP TABLE \`${name}\``);
      await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 1");
    });
  } finally {
    await db.$disconnect();
  }
}

export default async function setup() {
  const env = testEnv();
  rmSync(env.dataDir, { recursive: true, force: true });
  // The shape of the Next static export: login.html beside a login/ folder, plus index.html and 404.html.
  const site = path.join(env.dataDir, "static");
  mkdirSync(path.join(site, "login"), { recursive: true });
  writeFileSync(path.join(site, "index.html"), "home page");
  writeFileSync(path.join(site, "login.html"), "login page");
  writeFileSync(path.join(site, "login", "__next.txt"), "payload");
  writeFileSync(path.join(site, "404.html"), "not found page");
  await dropAllTables(env.databaseUrl);
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: env.databaseUrl, PRISMA_HIDE_UPDATE_MESSAGE: "1" },
    stdio: "inherit",
  });
}
