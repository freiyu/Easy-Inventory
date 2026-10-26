// Where the integration tests run (PRD 0.4 Stage 4): the ezi_test database, never ezi_dev. The URL comes from
// TEST_DATABASE_URL, or from backend/.env's DATABASE_URL with the database renamed to ezi_test.
import path from "node:path";

/** Every wipe checks again, so a wrong config can never empty ezi_dev or its backups. */
export function assertTestDatabase(databaseUrl = process.env.DATABASE_URL ?? "") {
  const name = URL.parse(databaseUrl)?.pathname.slice(1) ?? "";
  if (!/_test(_restore)?$/.test(name)) throw new Error(`Refusing to wipe database "${name}": the name must end in _test.`);
}

export function testEnv() {
  try {
    process.loadEnvFile(".env");
  } catch {
    // no .env: TEST_DATABASE_URL must be set
  }
  const raw = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!raw) throw new Error("Set TEST_DATABASE_URL (or DATABASE_URL in backend/.env) to run the integration tests.");
  const db = new URL(raw);
  if (!process.env.TEST_DATABASE_URL) db.pathname = "/ezi_test";
  // Guard: these tests drop every table, so they refuse any database whose name does not end in _test.
  if (!db.pathname.endsWith("_test")) throw new Error(`Refusing to run integration tests on ${db.pathname.slice(1)}: the name must end in _test.`);
  const restore = new URL(db);
  restore.pathname = `${db.pathname}_restore`;
  return {
    databaseUrl: db.toString(),
    restoreUrl: restore.toString(),
    dataDir: path.resolve("data/integration"),
  };
}
