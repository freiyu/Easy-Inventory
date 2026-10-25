// Configuration from environment variables (PRD 13.2). In development they come from backend/.env;
// in production the installer writes them (PRD 6.7). Never hard-code secrets here.
import path from "node:path";

try {
  process.loadEnvFile(".env");
} catch {
  // no .env file: the variables come from the environment
}
process.env.TZ ??= "Asia/Jakarta";

const need = (key: string) => {
  const v = process.env[key];
  if (!v) throw new Error(`Missing environment variable ${key}`);
  return v;
};

export const env = {
  databaseUrl: need("DATABASE_URL"),
  sessionSecret: need("SESSION_SECRET"),
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? "0.0.0.0",
  /** Backups and the error log live here (PRD 2.6, 7.2). */
  dataDir: path.resolve(process.env.DATA_DIR ?? "data"),
  mysqldump: process.env.MYSQLDUMP_PATH ?? "mysqldump",
  /** The static Next.js export served on the same port (PRD 0.2). */
  staticDir: path.resolve(process.env.STATIC_DIR ?? path.join(import.meta.dirname, "../../frontend/out")),
};
