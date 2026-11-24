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
    /** Downloaded installers and the update status; the web service (LocalService) may write here, it holds nothing secret. */
    update: path.join(dataDir, "update"),
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

// ---- Automatic update on Windows (docs/docs-1.2/UPDATE-DESIGN.md) ---------------------------------------------------------
// Two Task Scheduler tasks run as SYSTEM: "EZI Updater" every 5 minutes (one round of `cli.mjs auto-update`) and
// "EZI Updater Install" on demand (runs the silent installer in its own process, so the updater is not holding the program files
// the installer replaces). Both only run .cmd files in the update folder, which only SYSTEM and Administrators can write.

export const UPDATER_TASK = "EZI Updater";
export const UPDATER_INSTALL_TASK = "EZI Updater Install";
/** The installer takes at most this long to finish before the updater calls it failed (minutes). Keep in step with update.ts. */
const BLOCK_MINUTES = 50;

export function updatePaths(updateDir: string) {
  return {
    runUpdater: path.join(updateDir, "run-updater.cmd"),
    runInstaller: path.join(updateDir, "run-installer.cmd"),
    installing: path.join(updateDir, "installing.flag"),
    exit: path.join(updateDir, "installer-exit.txt"),
    updaterXml: path.join(updateDir, "task-updater.xml"),
    installerXml: path.join(updateDir, "task-installer.xml"),
  };
}

/** A value that is safe inside a .cmd file and inside the PowerShell one-liner: no quotes, percent signs or shell characters. */
export function cmdSafe(value: string): string {
  if (/["'%&|<>^`$\r\n]/.test(value)) throw new Error(`Path not allowed in an update script: ${value}`);
  return value;
}

const crlf = (lines: string[]) => lines.join("\r\n") + "\r\n";

/** One round of the update task. It does nothing while an installer started by the last round is still working (or for 50 minutes at most). */
export function runUpdaterCmd(nodeExe: string, cliMjs: string, updateDir: string): string {
  const p = updatePaths(cmdSafe(updateDir));
  return crlf([
    "@echo off",
    "rem Written by the EZI installer. One round of the automatic-update task, run as SYSTEM.",
    "rem While the installer works it replaces the program files this round would start, so the round waits.",
    `powershell.exe -NoProfile -NonInteractive -Command "$f='${p.installing}'; if ((Test-Path $f) -and -not (Test-Path '${p.exit}') -and ((Get-Date) - (Get-Item $f).LastWriteTime).TotalMinutes -lt ${BLOCK_MINUTES}) { exit 1 }"`,
    "if errorlevel 1 exit /b 0",
    `"${cmdSafe(nodeExe)}" "${cmdSafe(cliMjs)}" auto-update`,
  ]);
}

/** Runs the downloaded installer silently, waits for it, and writes its exit code for the next round. */
export function runInstallerCmd(installer: string, logFile: string, updateDir: string): string {
  const p = updatePaths(cmdSafe(updateDir));
  return crlf([
    "@echo off",
    "rem Written by the EZI updater for one installation, run as SYSTEM by the on-demand task.",
    `del "${p.exit}" 2>nul`,
    `start "" /wait "${cmdSafe(installer)}" /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP- /NOCANCEL "/LOG=${cmdSafe(logFile)}"`,
    `>"${p.exit}" echo %errorlevel%`,
  ]);
}

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Task Scheduler definition (schtasks /Create /XML). `repeatMinutes` makes it run again and again from the moment it is made;
 * without it the task has no trigger and only runs when started (`schtasks /Run`).
 */
export function taskXml(cmdFile: string, opts: { description: string; repeatMinutes?: number; timeLimit: string }): string {
  const trigger = opts.repeatMinutes
    ? `<Triggers><TimeTrigger><Repetition><Interval>PT${opts.repeatMinutes}M</Interval></Repetition><StartBoundary>2026-01-01T00:00:00</StartBoundary><Enabled>true</Enabled></TimeTrigger></Triggers>`
    : "<Triggers />";
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>${xml(opts.description)}</Description></RegistrationInfo>
  ${trigger}
  <Principals><Principal id="Author"><UserId>S-1-5-18</UserId><RunLevel>HighestAvailable</RunLevel></Principal></Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <StartWhenAvailable>true</StartWhenAvailable>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Hidden>true</Hidden>
    <ExecutionTimeLimit>${opts.timeLimit}</ExecutionTimeLimit>
  </Settings>
  <Actions Context="Author"><Exec><Command>cmd.exe</Command><Arguments>/c ""${xml(cmdSafe(cmdFile))}""</Arguments></Exec></Actions>
</Task>
`;
}

/** schtasks wants UTF-16 with a byte order mark for /XML files. */
export const utf16 = (text: string) => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]);
