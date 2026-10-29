// EZI host tool for Windows (PRD 11.4-11.5, 2.6): called by the installer, the uninstaller and the Start Menu.
//   install --port N --lan 0|1 --autostart 0|1 [--backup 1]   new install, or update when a config already exists
//   pre-upgrade                                  before the installer replaces files: stop EZI, "Before update" backup
//   start | stop | backup | address
//   restore [file.sql.gz]                        asks for confirmation, takes a "Before restore" backup first
//   final-backup <folder>                        uninstaller: a last backup copied to a folder
//   remove                                       uninstaller: services and firewall rule (data stays)
// Modules that read env.ts are imported only after the config exists (env.ts refuses to load without it).
import { execFile } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { promisify } from "node:util";
import mariadb from "mariadb";
import {
  addresses, APP_SERVICE, DB_NAME, DB_PORT, DB_SERVICE, DB_USER, formatEnv, layout, newConfig, optionsOf, parsePort, readEnv, secret,
  withOptions, withServerSettings, type Layout, type Options,
} from "./host";

const exec = promisify(execFile);
const L = layout(path.resolve(import.meta.dirname, ".."), path.join(process.env.ProgramData ?? "C:\\ProgramData", "EZI"));
process.env.EZI_ENV_FILE = L.envFile;
let logFile: string | null = null;

function say(msg: string) {
  console.log(msg);
  if (logFile) appendFileSync(logFile, `${new Date().toISOString()} ${msg}\r\n`);
}

function startLog(name: string) {
  mkdirSync(L.logs, { recursive: true });
  logFile = path.join(L.logs, `${name}-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}.log`);
  say(`Log: ${logFile}`);
}

/** Runs a program without a shell. Passwords never reach the log or an error message. */
async function sh(cmd: string, args: string[]) {
  const hide = (s: string) => s.replace(/(--password=)\S+/g, "$1***");
  say(`> ${path.basename(cmd)} ${hide(args.join(" "))}`);
  try {
    const { stdout } = await exec(cmd, args, { windowsHide: true });
    return stdout;
  } catch (err) {
    const e = err as { stderr?: string; stdout?: string; code?: number };
    throw new Error(hide(`${path.basename(cmd)} gagal (kode ${e.code ?? "?"}): ${(e.stderr || e.stdout || "").trim().slice(0, 500)}`));
  }
}

const readConfig = () => readEnv(readFileSync(L.envFile, "utf8"));
const writeConfig = (file: string, config: Record<string, string>) => writeFileSync(file, formatEnv(config));

// ---- Windows services -------------------------------------------------------------------------------------------

async function serviceState(name: string): Promise<"missing" | "running" | "stopped" | "pending"> {
  try {
    const { stdout } = await exec("sc.exe", ["query", name], { windowsHide: true });
    return /STATE\s*:\s*4/.test(stdout) ? "running" : /STATE\s*:\s*1\s/.test(stdout) ? "stopped" : "pending";
  } catch {
    return "missing";
  }
}

async function waitFor(name: string, want: "running" | "stopped") {
  for (let i = 0; i < 60; i++) {
    const s = await serviceState(name);
    if (s === want) return;
    if (s === "missing") throw new Error(`Service ${name} tidak ada`);
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Service ${name} tidak ${want === "running" ? "menyala" : "berhenti"} dalam 60 detik`);
}

async function startService(name: string) {
  const s = await serviceState(name);
  if (s === "running") return;
  if (s === "stopped") await sh("sc.exe", ["start", name]);
  await waitFor(name, "running");
}

async function stopService(name: string) {
  const s = await serviceState(name);
  if (s === "missing" || s === "stopped") return;
  if (s === "running") await sh("sc.exe", ["stop", name]);
  await waitFor(name, "stopped");
}

const setStart = (name: string, autostart: boolean) => sh("sc.exe", ["config", name, "start=", autostart ? "auto" : "demand"]);

/** The app service: WinSW runs the bundled Node with the server bundle (PRD 11.2). */
async function installAppService(o: Options) {
  const xml = `<service>
  <id>${APP_SERVICE}</id>
  <name>EZI Inventory</name>
  <description>EZI Inventory web app (port ${o.port}).</description>
  <executable>${path.join(L.programDir, "node", "node.exe")}</executable>
  <arguments>"${path.join(L.app, "main.mjs")}"</arguments>
  <workingdirectory>${L.app}</workingdirectory>
  <env name="EZI_ENV_FILE" value="${L.envFile}" />
  <depend>${DB_SERVICE}</depend>
  <startmode>${o.autostart ? "Automatic" : "Manual"}</startmode>
  <onfailure action="restart" delay="10 sec" />
  <stoptimeout>20 sec</stoptimeout>
  <logpath>${L.logs}</logpath>
  <log mode="roll-by-size"><sizeThreshold>10240</sizeThreshold><keepFiles>5</keepFiles></log>
</service>
`;
  writeFileSync(path.join(L.service, "ezi-service.xml"), xml);
  if ((await serviceState(APP_SERVICE)) === "missing") await sh(path.join(L.service, "ezi-service.exe"), ["install"]);
  // Least privilege: the app runs as LocalService, which can read the config and write only backups and logs.
  await sh("sc.exe", ["config", APP_SERVICE, "obj=", "NT AUTHORITY\\LocalService", "password=", ""]);
  await setStart(APP_SERVICE, o.autostart);
}

/** Folder permissions: the data folder is private; the app service reads config and writes backups and logs. */
async function lockFolders() {
  const ADMINS = "*S-1-5-32-544", SYSTEM = "*S-1-5-18", LOCAL_SERVICE = "*S-1-5-19";
  await sh("icacls.exe", [L.dataDir, "/inheritance:r", "/grant:r", `${ADMINS}:(OI)(CI)F`, `${SYSTEM}:(OI)(CI)F`, `${LOCAL_SERVICE}:(RX)`]);
  await sh("icacls.exe", [L.config, "/grant:r", `${LOCAL_SERVICE}:(OI)(CI)RX`]);
  for (const dir of [L.backups, L.logs]) await sh("icacls.exe", [dir, "/grant:r", `${LOCAL_SERVICE}:(OI)(CI)M`]);
  await sh("icacls.exe", [L.mysqlData, "/grant:r", `NT SERVICE\\${DB_SERVICE}:(OI)(CI)F`]);
}

const FIREWALL = "EZI Inventory";
async function setFirewall(o: Options) {
  await sh("netsh.exe", ["advfirewall", "firewall", "delete", "rule", `name=${FIREWALL}`]).catch(() => undefined);
  // Private networks only, and never for the database port (PRD 2.4).
  if (o.lan) await sh("netsh.exe", ["advfirewall", "firewall", "add", "rule", `name=${FIREWALL}`, "dir=in", "action=allow", "protocol=TCP", `localport=${o.port}`, "profile=private"]);
}

// ---- Database -------------------------------------------------------------------------------------------------------

async function ensureDbService(autostart: boolean) {
  if ((await serviceState(DB_SERVICE)) === "missing") {
    await sh(path.join(L.bin, "mariadbd.exe"), ["--install", DB_SERVICE, `--defaults-file=${path.join(L.mysqlData, "my.ini")}`]);
  }
  await setStart(DB_SERVICE, autostart);
  await startService(DB_SERVICE);
}

async function rootQuery(sql: string[]) {
  const password = readEnv(readFileSync(L.rootFile, "utf8")).DB_ROOT_PASSWORD;
  for (let i = 0; ; i++) {
    try {
      const c = await mariadb.createConnection({ host: "127.0.0.1", port: DB_PORT, user: "root", password });
      try {
        for (const q of sql) await c.query(q);
      } finally {
        await c.end();
      }
      return;
    } catch (err) {
      if (i >= 30) throw err;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

async function migrate(databaseUrl: string) {
  say("Menjalankan migrasi database...");
  const { stdout } = await exec(process.execPath, [path.join(L.app, "node_modules", "prisma", "build", "index.js"), "migrate", "deploy"], {
    cwd: L.app, windowsHide: true,
    env: { ...process.env, DATABASE_URL: databaseUrl, PRISMA_HIDE_UPDATE_MESSAGE: "1", CHECKPOINT_DISABLE: "1" },
  });
  say(stdout.trim());
}

// ---- Checks -------------------------------------------------------------------------------------------------------

function portFree(port: number, host: string) {
  return new Promise<boolean>((resolve) => {
    const s = net.createServer().once("error", () => resolve(false)).once("listening", () => s.close(() => resolve(true)));
    s.listen(port, host);
  });
}

/** PRD 11.9 automatic part: the database answers through the app, and the app serves its pages. */
async function smoke(port: number) {
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; ; i++) {
    try {
      const status = await (await fetch(`${base}/api/setup/status`)).json() as { success: boolean };
      const page = await fetch(`${base}/`);
      if (status.success && page.ok) break;
      throw new Error("jawaban tidak sesuai");
    } catch (err) {
      if (i >= 60) throw new Error(`Smoke test gagal: EZI tidak menjawab di ${base} (${(err as Error).message})`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  say("Smoke test lulus: database terhubung, halaman EZI tampil.");
}

// ---- Commands -------------------------------------------------------------------------------------------------------

async function install(args: Map<string, string>) {
  startLog("install");
  const o: Options = { port: parsePort(args.get("port")), lan: args.get("lan") !== "0", autostart: args.get("autostart") !== "0" };
  if (existsSync(L.envFile)) return update(o, args.get("backup") === "1");
  if (existsSync(L.mysqlData)) throw new Error(`Folder database lama ditemukan tanpa config (${L.mysqlData}). Tidak disentuh. Pindahkan folder itu, lalu install ulang.`);

  const undo: (() => Promise<unknown>)[] = [];
  try {
    say("Mode: install baru.");
    for (const [port, host] of [[o.port, "0.0.0.0"], [DB_PORT, "127.0.0.1"]] as const) {
      if (!(await portFree(port, host))) throw new Error(`Port ${port} sudah dipakai program lain. Pilih port lain atau tutup program itu.`);
    }
    for (const dir of [L.config, L.backups, L.logs]) mkdirSync(dir, { recursive: true });
    // Nothing existed before this run (checked above), so a failed new install removes what it made: the next run
    // starts clean instead of finding a half-made database or an ezi.env that would switch it to update mode.
    undo.push(async () => { for (const p of [L.mysqlData, L.envFile, L.rootFile]) rmSync(p, { recursive: true, force: true }); });
    undo.push(async () => { await stopService(DB_SERVICE); await sh("sc.exe", ["delete", DB_SERVICE]).catch(() => undefined); });

    const root = secret();
    writeConfig(L.rootFile, { DB_ROOT_PASSWORD: root });
    say("Menyiapkan database MariaDB pribadi (127.0.0.1:3307)...");
    await sh(path.join(L.bin, "mariadb-install-db.exe"), [`--datadir=${L.mysqlData}`, `--port=${DB_PORT}`, `--password=${root}`, `--service=${DB_SERVICE}`]);
    const ini = path.join(L.mysqlData, "my.ini");
    writeFileSync(ini, withServerSettings(readFileSync(ini, "utf8"), ["bind-address=127.0.0.1", "character-set-server=utf8mb4"]));
    await ensureDbService(o.autostart);

    const password = secret();
    await rootQuery([
      `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4`,
      `CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${password}'`,
      `CREATE USER IF NOT EXISTS '${DB_USER}'@'127.0.0.1' IDENTIFIED BY '${password}'`,
      `GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost', '${DB_USER}'@'127.0.0.1'`,
    ]);
    const config = newConfig(L, o, password, secret(32));
    writeConfig(L.envFile, config);
    await migrate(config.DATABASE_URL);

    undo.push(async () => { await stopService(APP_SERVICE); await sh(path.join(L.service, "ezi-service.exe"), ["uninstall"]).catch(() => undefined); });
    await installAppService(o);
    await lockFolders();
    undo.push(() => sh("netsh.exe", ["advfirewall", "firewall", "delete", "rule", `name=${FIREWALL}`]).catch(() => undefined));
    await setFirewall(o);
    await startService(APP_SERVICE);
    await smoke(o.port);
    showAddress(o);
  } catch (err) {
    say(`GAGAL: ${(err as Error).message}`);
    say("Membatalkan perubahan install ini...");
    for (const step of undo.reverse()) await step().catch((e) => say(`  (gagal dibatalkan: ${(e as Error).message})`));
    throw err;
  }
}

/** Update mode (PRD 12.2): the config and the database stay; only options the person changed are applied. */
async function update(o: Options, backupFirst: boolean) {
  say("Mode: update (data dan config lama dipakai).");
  const old = readConfig();
  const config = withOptions(old, o);
  if (o.port !== optionsOf(old).port && !(await portFree(o.port, "0.0.0.0"))) throw new Error(`Port ${o.port} sudah dipakai program lain.`);
  writeConfig(L.envFile, config);
  await ensureDbService(o.autostart);
  if (backupFirst) await backup("Before update"); // the installer had no old version to run pre-upgrade with
  await sh(path.join(L.bin, "mariadb-upgrade.exe"), ["--host=127.0.0.1", `--port=${DB_PORT}`, "--user=root", `--password=${readEnv(readFileSync(L.rootFile, "utf8")).DB_ROOT_PASSWORD}`])
    .catch((err) => say(`mariadb-upgrade: ${(err as Error).message.split("\n")[0]}`));
  await migrate(config.DATABASE_URL);
  await installAppService(o);
  await lockFolders();
  await setFirewall(o);
  await startService(APP_SERVICE);
  await smoke(o.port);
  showAddress(o);
}

async function backup(kind: "Manual" | "Before update" | "Before restore") {
  await startService(DB_SERVICE);
  const { createBackup } = await import("../services/backup");
  const file = await createBackup(null, kind);
  say(`Backup dibuat: ${path.join(L.backups, file.fileName)}`);
  return path.join(L.backups, file.fileName);
}

async function preUpgrade() {
  startLog("update");
  say("Persiapan update: EZI dihentikan dan database dibackup.");
  await stopService(APP_SERVICE);
  await backup("Before update"); // a failure here stops the installer before any file is replaced (PRD 11.5)
  await stopService(DB_SERVICE);
}

async function restore(file: string | undefined) {
  if (!file || !/\.sql\.gz$/i.test(file) || !existsSync(file)) throw new Error("Pilih file backup EZI (.sql.gz) yang ada.");
  startLog("restore");
  say(`File backup: ${file}`);
  say("PERHATIAN: semua data EZI saat ini akan DIGANTI dengan isi file ini.");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('Ketik YA lalu Enter untuk melanjutkan: ');
  rl.close();
  if (answer.trim().toUpperCase() !== "YA") return say("Dibatalkan. Tidak ada yang diubah.");

  const safety = await backup("Before restore");
  await stopService(APP_SERVICE);
  try {
    const { restoreDump } = await import("../services/backup");
    const config = readConfig();
    await restoreDump(file, config.DATABASE_URL);
    await migrate(config.DATABASE_URL); // a backup from an older version gets the newer tables
    await startService(APP_SERVICE);
    await smoke(optionsOf(config).port);
    say("Restore selesai. Periksa datanya di EZI.");
  } catch (err) {
    say(`GAGAL: ${(err as Error).message}`);
    say(`Data sebelum restore aman di: ${safety}`);
    say("Jalankan Restore lagi dengan file itu untuk kembali ke keadaan sebelumnya.");
    throw err;
  }
}

async function finalBackup(folder: string | undefined) {
  if (!folder) throw new Error("Folder tujuan tidak diisi.");
  startLog("uninstall");
  // A new install that failed leaves no config and no database: there is nothing to back up.
  if (!existsSync(L.envFile)) return say("EZI belum pernah selesai terpasang di PC ini, jadi tidak ada data untuk dibackup.");
  const made = await backup("Manual");
  mkdirSync(folder, { recursive: true });
  const target = path.join(folder, path.basename(made));
  await copyFile(made, target);
  say(`Backup terakhir disalin ke: ${target}`);
}

async function remove() {
  startLog("uninstall");
  await stopService(APP_SERVICE);
  if ((await serviceState(APP_SERVICE)) !== "missing") await sh(path.join(L.service, "ezi-service.exe"), ["uninstall"]);
  await stopService(DB_SERVICE);
  if ((await serviceState(DB_SERVICE)) !== "missing") await sh("sc.exe", ["delete", DB_SERVICE]);
  await sh("netsh.exe", ["advfirewall", "firewall", "delete", "rule", `name=${FIREWALL}`]).catch(() => undefined);
  say("Service dan aturan firewall EZI sudah dihapus.");
}

function showAddress(o: Options = optionsOf(readConfig())) {
  say("Buka EZI di browser:");
  for (const a of addresses(o.port, o.lan, os.networkInterfaces(), os.hostname())) say(`  ${a}`);
  if (!o.lan) say("(Akses dari perangkat lain dimatikan saat install.)");
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = new Map<string, string>();
  for (let i = 0; i < rest.length; i++) if (rest[i].startsWith("--")) args.set(rest[i].slice(2), rest[++i]);
  switch (cmd) {
    case "install": return install(args);
    case "pre-upgrade": return preUpgrade();
    case "start": await startService(DB_SERVICE); await startService(APP_SERVICE); return say("EZI menyala.");
    case "stop": await stopService(APP_SERVICE); await stopService(DB_SERVICE); return say("EZI berhenti.");
    case "backup": startLog("backup"); await backup("Manual"); return;
    case "restore": return restore(rest[0]);
    case "final-backup": return finalBackup(rest[0]);
    case "remove": return remove();
    case "address": return showAddress();
    default: throw new Error(`Perintah tidak dikenal: ${cmd ?? "(kosong)"}`);
  }
}

main().then(
  () => process.exit(0),
  (err) => { say(`GAGAL: ${(err as Error).message}`); process.exit(1); },
);
