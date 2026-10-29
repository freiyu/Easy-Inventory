// Pure helpers for the Windows host tool (cli.ts, PRD 11): the installer's config file and the access addresses.
// Kept free of env.ts and the database so they can be unit-tested and used before the config exists.
import { randomBytes } from "node:crypto";
import { win32 as path } from "node:path"; // the host is always Windows
import { parseEnv } from "node:util";

export const APP_SERVICE = "EZI";
export const DB_SERVICE = "EZI-DB";
export const DB_PORT = 3307;
export const DB_NAME = "ezi";
export const DB_USER = "ezi";

export type Options = { port: number; lan: boolean; autostart: boolean };

/** Folders of one installation: program files (replaced by updates) and data (never replaced, PRD 11.3). */
export function layout(programDir: string, dataDir: string) {
  return {
    programDir,
    dataDir,
    app: path.join(programDir, "app"),
    bin: path.join(programDir, "mariadb", "bin"),
    service: path.join(programDir, "service"),
    config: path.join(dataDir, "config"),
    envFile: path.join(dataDir, "config", "ezi.env"),
    rootFile: path.join(dataDir, "config", "db-root.env"),
    mysqlData: path.join(dataDir, "mysql-data"),
    backups: path.join(dataDir, "backups"),
    logs: path.join(dataDir, "logs"),
  };
}
export type Layout = ReturnType<typeof layout>;

/** Hex secrets: no characters that need escaping in a URL, an options file or the env file. */
export const secret = (bytes = 24) => randomBytes(bytes).toString("hex");

/** The app's config file for a new install (PRD 13.2 keys plus the installer options). */
export function newConfig(l: Layout, o: Options, password: string, sessionSecret: string): Record<string, string> {
  return {
    DATABASE_URL: `mysql://${DB_USER}:${password}@127.0.0.1:${DB_PORT}/${DB_NAME}`,
    SESSION_SECRET: sessionSecret,
    ...withOptions({}, o),
    TZ: "Asia/Jakarta",
    DATA_DIR: l.dataDir,
    STATIC_DIR: path.join(l.app, "public"),
    MYSQLDUMP_PATH: path.join(l.bin, "mariadb-dump.exe"),
    MYSQL_PATH: path.join(l.bin, "mariadb.exe"),
  };
}

/** Applies installer options to a config: the app listens on every interface only when LAN access is on (PRD 2.4). */
export function withOptions(config: Record<string, string>, o: Options): Record<string, string> {
  return { ...config, PORT: String(o.port), HOST: o.lan ? "0.0.0.0" : "127.0.0.1", EZI_LAN: o.lan ? "1" : "0", EZI_AUTOSTART: o.autostart ? "1" : "0" };
}

export function optionsOf(config: Record<string, string>): Options {
  return { port: Number(config.PORT), lan: config.EZI_LAN === "1", autostart: config.EZI_AUTOSTART !== "0" };
}

/** Unquoted KEY=value lines: Windows paths keep their backslashes (double quotes would turn "\n" into a newline). */
export function formatEnv(config: Record<string, string>) {
  for (const [k, v] of Object.entries(config)) {
    if (/[\r\n#"'`]/.test(v) || v !== v.trim()) throw new Error(`Config value for ${k} cannot be written safely`);
  }
  return Object.entries(config).map(([k, v]) => `${k}=${v}`).join("\r\n") + "\r\n";
}

export const readEnv = (text: string) => parseEnv(text) as Record<string, string>;

export function parsePort(raw: string | undefined) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1024 || n > 65535 || n === DB_PORT) throw new Error(`Port tidak valid: ${raw} (pilih 1024-65535, bukan ${DB_PORT})`);
  return n;
}

type Nic = { family: string | number; internal: boolean; address: string };

/** The addresses other devices use (PRD 11.4: localhost, LAN IP, computer name). */
export function addresses(port: number, lan: boolean, nics: Record<string, Nic[] | undefined>, hostname: string) {
  const out = [`http://localhost:${port}`];
  if (!lan) return out;
  for (const list of Object.values(nics)) {
    for (const n of list ?? []) if ((n.family === "IPv4" || n.family === 4) && !n.internal) out.push(`http://${n.address}:${port}`);
  }
  out.push(`http://${hostname}:${port}`);
  return out;
}

/** Puts settings under the [mysqld] section of the my.ini that mariadb-install-db wrote. */
export function withServerSettings(ini: string, settings: string[]) {
  const lines = ini.split(/\r?\n/).filter((l) => !settings.some((s) => l.trim().startsWith(s.split("=")[0] + "=")));
  const at = lines.findIndex((l) => l.trim().toLowerCase() === "[mysqld]");
  if (at < 0) return ["[mysqld]", ...settings, ...lines].join("\r\n");
  lines.splice(at + 1, 0, ...settings);
  return lines.join("\r\n");
}
