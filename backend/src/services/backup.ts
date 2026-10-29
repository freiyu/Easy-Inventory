// Database backups (PRD 2.6): mysqldump into gzip files in the data folder, latest 14 kept, one automatic
// backup per day while EZI runs. Backups are files, not rows (PRD 6.1). Restore is not an API: the host tool
// (tools/cli.ts) calls restoreDump.
import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { chmod, mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";
import { dbConfig, prisma } from "../db";
import { env } from "../env";
import { fail, logError, notFound } from "../http";
import { paged, type Query } from "../list";
import { BACKUP_RETENTION, t, type BackupFile } from "../shared";
import type { SessionUser } from "./core";

type Kind = BackupFile["kind"];
const SLUG: Record<Kind, string> = {
  Automatic: "automatic", Manual: "manual", "Before update": "before-update", "Before import": "before-import", "Before restore": "before-restore",
};
const KIND = Object.fromEntries(Object.entries(SLUG).map(([k, s]) => [s, k])) as Record<string, Kind>;
const NAME = /^ezi-backup-(\d{14})-([a-z-]+)\.sql\.gz$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export const backupDir = () => path.join(env.dataDir, "backups");

const stampOf = (d: Date) => d.toISOString().replace(/\D/g, "").slice(0, 14); // UTC yyyyMMddHHmmss
const dateOf = (stamp: string) =>
  new Date(`${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(8, 10)}:${stamp.slice(10, 12)}:${stamp.slice(12, 14)}Z`);

/** The files on disk, newest first. The id is the UTC timestamp in the name. */
async function files(): Promise<(BackupFile & { path: string })[]> {
  await mkdir(backupDir(), { recursive: true, mode: 0o700 });
  const out = [];
  for (const name of await readdir(backupDir())) {
    const m = NAME.exec(name);
    if (!m || !KIND[m[2]]) continue;
    const full = path.join(backupDir(), name);
    const size = (await stat(full)).size;
    out.push({ id: Number(m[1]), fileName: name, createdAt: dateOf(m[1]).toISOString(), kind: KIND[m[2]], sizeKb: Math.max(1, Math.round(size / 1024)), path: full });
  }
  return out.sort((a, b) => b.id - a.id);
}

const strip = ({ path: _p, ...b }: BackupFile & { path: string }): BackupFile => b;

export async function listBackups(q: Query) {
  return paged((await files()).map(strip), q, {
    file: (b) => b.fileName, created: (b) => b.createdAt, kind: (b) => b.kind, size: (b) => b.sizeKb,
  }, "created:desc");
}

export async function backupPath(id: number) {
  const f = (await files()).find((b) => b.id === id);
  if (!f) throw notFound();
  return f;
}

type Connection = Pick<typeof dbConfig, "host" | "port" | "user" | "password">;

/** Runs `use` with a private options file holding the password, never on the command line where other processes can see it. */
async function withOptions<T>(dir: string, c: Connection, use: (file: string) => Promise<T>): Promise<T> {
  const file = path.join(dir, `.db-${process.pid}.cnf`);
  const q = (s: string | number) => `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  await writeFile(file, `[client]\nhost=${q(c.host)}\nport=${c.port}\nuser=${q(c.user)}\npassword=${q(c.password)}\n`, { mode: 0o600 });
  try {
    return await use(file);
  } finally {
    await rm(file, { force: true });
  }
}

/** Runs a database client with stdin fed from `input` and stdout handed to `output`; rejects on a non-zero exit. */
function client(cmd: string, args: string[], input?: Readable, output?: (stdout: Readable) => Promise<unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: [input ? "pipe" : "ignore", output ? "pipe" : "ignore", "pipe"] });
    let stderr = "";
    child.stderr!.on("data", (d) => { stderr += d; });
    const piped = Promise.all([input && pipeline(input, child.stdin!), output?.(child.stdout!)]);
    child.on("error", reject);
    child.on("close", (code) => {
      piped.then(() => (code === 0 ? resolve() : reject(new Error(`${path.basename(cmd)} exited with ${code}: ${stderr.trim()}`))), reject);
    });
  });
}

const dump = (target: string, optionsFile: string) =>
  client(env.mysqldump, [`--defaults-extra-file=${optionsFile}`, "--single-transaction", "--no-tablespaces", "--default-character-set=utf8mb4", dbConfig.database],
    undefined, (out) => pipeline(out, createGzip(), createWriteStream(target, { mode: 0o600 })));

let queue: Promise<unknown> = Promise.resolve();

/** Creates one backup file, then keeps only the latest 14 (PRD 2.6). Runs one at a time. */
export function createBackup(actor: SessionUser | null, kind: Kind = "Manual"): Promise<BackupFile> {
  const run = queue.then(async () => {
    const dir = backupDir();
    await mkdir(dir, { recursive: true, mode: 0o700 });
    let at = new Date();
    const taken = new Set((await files()).map((f) => f.id));
    while (taken.has(Number(stampOf(at)))) at = new Date(at.getTime() + 1000); // one file per second
    const fileName = `ezi-backup-${stampOf(at)}-${SLUG[kind]}.sql.gz`;
    const target = path.join(dir, fileName);
    const partial = `${target}.partial`;
    try {
      await withOptions(dir, dbConfig, (options) => dump(partial, options));
      await rename(partial, target);
      await chmod(target, 0o600);
    } catch (err) {
      await rm(partial, { force: true });
      await logError(`backup ${kind}`, err);
      throw fail("INTERNAL_ERROR", t.errors.server);
    }
    const all = await files();
    for (const old of all.slice(BACKUP_RETENTION)) await rm(old.path, { force: true });
    await prisma.activityLog.create({ data: { userId: actor?.id ?? null, action: "Backup created", module: "Backup", reference: fileName, metadata: kind } });
    return strip(all.find((f) => f.fileName === fileName)!);
  });
  queue = run.catch(() => undefined);
  return run;
}

/**
 * Replaces the database behind `databaseUrl` with a backup file (.sql.gz): drops and re-creates the database, then
 * loads the dump with the command-line client. The host restore tool takes a "Before restore" backup first (PRD 2.6).
 */
export async function restoreDump(file: string, databaseUrl: string) {
  const u = new URL(databaseUrl);
  const name = u.pathname.slice(1).replace(/`/g, "``");
  const c = { host: u.hostname, port: Number(u.port || 3306), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password) };
  const reset = Readable.from([`DROP DATABASE IF EXISTS \`${name}\`;\nCREATE DATABASE \`${name}\` CHARACTER SET utf8mb4;\nUSE \`${name}\`;\n`]);
  async function* sql() {
    yield* reset;
    yield* createReadStream(file).pipe(createGunzip());
  }
  await mkdir(backupDir(), { recursive: true, mode: 0o700 });
  await withOptions(backupDir(), c, (options) =>
    client(env.mysql, [`--defaults-extra-file=${options}`, "--default-character-set=utf8mb4"], Readable.from(sql())));
}

/** One automatic backup per day while EZI runs: checked at start and every hour. */
export function startDailyBackup() {
  const check = async () => {
    try {
      const last = (await files()).find((f) => f.kind === "Automatic");
      if (!last || Date.now() - Date.parse(last.createdAt) >= DAY_MS) await createBackup(null, "Automatic");
    } catch (err) {
      await logError("daily backup", err);
    }
  };
  void check();
  return setInterval(check, 60 * 60 * 1000).unref();
}
