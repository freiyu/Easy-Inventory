// Update of the installed program (design: docs/docs-1.2/UPDATE-DESIGN.md). This file only decides and moves bytes:
// it asks the public releases repo for the newest version, downloads the installer, checks its SHA-256 and, when the
// off switch is not set and nobody is using EZI, hands it to `install`. It never talks to the database and never
// sends anything about the office: the only outbound requests are two GETs to GitHub with a generic User-Agent.
// Running the installer needs an administrator, so the caller is the SYSTEM scheduled task (tools/cli.ts `auto-update`),
// not the web service (which runs as LocalService).
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { RequestHandler } from "express";

/** The public repo that holds the installers (the source repo is private). */
export const RELEASES_REPO = "freiyu/Easy-Inventory-Releases";
const API_HOST = "api.github.com";
/** Hosts a download may be redirected to: GitHub itself and its release-asset storage. */
const ASSET_HOSTS = new Set(["github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com"]);
const USER_AGENT = "EZI-Updater";
const SUMS_NAME = "SHA256SUMS.txt";
const MAX_INSTALLER_BYTES = 600 * 1024 * 1024;
const MAX_SUMS_BYTES = 64 * 1024;
const MAX_REDIRECTS = 4;
const TIMEOUT_MS = 30_000;
const CHECK_EVERY_MS = 12 * 60 * 60 * 1000;
const RETRY_AFTER_MS = 24 * 60 * 60 * 1000;
export const MAX_ATTEMPTS = 3;
const IDLE_SECONDS = 600;
const IDLE_RECHECK_MS = 30_000;
const LOCK_STALE_MS = 2 * 60 * 60 * 1000;

export class UpdateError extends Error {
  constructor(readonly kind: "unreachable" | "malformed" | "forbidden-source" | "checksum" | "too-large", message: string) {
    super(message);
  }
}

// ------------------------------------------------------------------------------------------------ versions

/** `1.2.3` or `v1.2.3`. Anything else (pre-release suffixes, words) is not a release this updater installs. */
export function parseVersion(text: string): [number, number, number] | null {
  const m = /^v?(\d{1,6})\.(\d{1,6})\.(\d{1,6})$/.exec(text.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function isNewer(candidate: string, current: string): boolean {
  const a = parseVersion(candidate);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

// ------------------------------------------------------------------------------------------------ the releases source

export interface Release {
  version: string;
  releaseId: number;
  installerName: string;
  installerUrl: string;
  sumsUrl: string;
}

export interface Source {
  repo: string;
  fetch: typeof fetch;
}

export const defaultSource = (): Source => ({ repo: RELEASES_REPO, fetch });

/** One GET, nothing else in the request. A redirect is followed only to https and only to the hosts above. */
async function get(src: Source, url: string, accept: string): Promise<Response> {
  let target = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const u = new URL(target);
    const allowed = hop === 0 ? u.protocol === "https:" : u.protocol === "https:" && ASSET_HOSTS.has(u.hostname);
    if (!allowed) throw new UpdateError("forbidden-source", `Refused to fetch ${u.protocol}//${u.hostname}`);
    let res: Response;
    try {
      res = await src.fetch(target, { method: "GET", redirect: "manual", headers: { Accept: accept, "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (err) {
      throw new UpdateError("unreachable", `Cannot reach ${u.hostname}: ${(err as Error).message}`);
    }
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      if (!next) throw new UpdateError("malformed", "Redirect without a location");
      target = new URL(next, target).toString();
      continue;
    }
    if (!res.ok) throw new UpdateError("unreachable", `${u.hostname} answered ${res.status}`);
    return res;
  }
  throw new UpdateError("malformed", "Too many redirects");
}

/** Picks the installer and checksum files out of GitHub's "latest release" answer. Anything unexpected is `malformed`. */
export function pickRelease(json: unknown, repo: string): Release {
  const bad = (why: string) => new UpdateError("malformed", `Unexpected release data: ${why}`);
  if (!json || typeof json !== "object") throw bad("not an object");
  const r = json as Record<string, unknown>;
  if (r.draft === true || r.prerelease === true) throw bad("draft or pre-release");
  const version = typeof r.tag_name === "string" && parseVersion(r.tag_name) ? r.tag_name.replace(/^v/, "").trim() : null;
  if (!version) throw bad("tag is not a version");
  if (typeof r.id !== "number" || !Number.isInteger(r.id)) throw bad("no release id");
  const assets = Array.isArray(r.assets) ? (r.assets as Record<string, unknown>[]) : [];
  const prefix = `https://github.com/${repo}/releases/download/`;
  const find = (name: string) => {
    const a = assets.find((x) => x && x.name === name);
    const url = a && typeof a.browser_download_url === "string" ? a.browser_download_url : null;
    if (!url) throw bad(`no ${name}`);
    if (!url.startsWith(prefix)) throw new UpdateError("forbidden-source", `${name} is not from ${repo}`);
    return url;
  };
  const installerName = `EZI-Setup-${version}.exe`;
  return { version, releaseId: r.id, installerName, installerUrl: find(installerName), sumsUrl: find(SUMS_NAME) };
}

/** The newest published release, whatever it is (the caller compares it with the installed version). */
export async function fetchLatest(src: Source): Promise<Release> {
  const res = await get(src, `https://${API_HOST}/repos/${src.repo}/releases/latest`, "application/vnd.github+json");
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new UpdateError("malformed", "The release answer is not JSON");
  }
  return pickRelease(json, src.repo);
}

// ------------------------------------------------------------------------------------------------ checksum and download

/** `<64 hex>  <file name>` per line, as `sha256sum` and build.ps1 write it. Returns file name -> hash. */
export function parseSums(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^([0-9a-fA-F]{64})\s+\*?(.+?)\s*$/.exec(line);
    if (m) out.set(m[2], m[1].toLowerCase());
  }
  return out;
}

async function readLimited(res: Response, limit: number): Promise<string> {
  const text = await res.text();
  if (text.length > limit) throw new UpdateError("too-large", "The checksum file is too large");
  return text;
}

/**
 * Downloads the installer into `dir`, hashing it on the way, and keeps it only when the hash equals the one published
 * in the same release. A wrong file is deleted and an UpdateError("checksum") is thrown: it is never run.
 */
export async function downloadVerified(src: Source, release: Release, dir: string): Promise<{ file: string; sha256: string }> {
  await mkdir(dir, { recursive: true });
  const expected = parseSums(await readLimited(await get(src, release.sumsUrl, "text/plain"), MAX_SUMS_BYTES)).get(release.installerName);
  if (!expected) throw new UpdateError("checksum", `${SUMS_NAME} has no line for ${release.installerName}`);

  const final = path.join(dir, release.installerName);
  const part = `${final}.part`;
  const res = await get(src, release.installerUrl, "application/octet-stream");
  if (!res.body) throw new UpdateError("malformed", "The download has no body");
  const hash = createHash("sha256");
  let bytes = 0;
  try {
    await pipeline(
      Readable.fromWeb(res.body as import("node:stream/web").ReadableStream),
      async function* (chunks: AsyncIterable<Buffer>) {
        for await (const c of chunks) {
          bytes += c.length;
          if (bytes > MAX_INSTALLER_BYTES) throw new UpdateError("too-large", "The installer is larger than allowed");
          hash.update(c);
          yield c;
        }
      },
      createWriteStream(part),
    );
  } catch (err) {
    await rm(part, { force: true });
    throw err instanceof UpdateError ? err : new UpdateError("unreachable", `Download failed: ${(err as Error).message}`);
  }
  const actual = hash.digest("hex");
  if (actual !== expected) {
    await rm(part, { force: true });
    throw new UpdateError("checksum", `SHA-256 of ${release.installerName} does not match ${SUMS_NAME}`);
  }
  await rename(part, final);
  return { file: final, sha256: actual };
}

export async function sha256File(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

// ------------------------------------------------------------------------------------------------ status and the off switch

export const updateDirOf = (dataDir: string) => path.join(dataDir, "update");

export interface UpdateStatus {
  checkedAt: string | null;
  latest: string | null;
  releaseId: number | null;
  /** SHA-256 of the verified installer waiting in the update folder, null when there is none. */
  downloadedSha256: string | null;
  /** The release whose installer failed the checksum: not downloaded again until a newer release is published. */
  blockedRelease: number | null;
  attempts: number;
  lastAttemptAt: string | null;
  installedAt: string | null;
  lastError: string | null;
}

const EMPTY: UpdateStatus = { checkedAt: null, latest: null, releaseId: null, downloadedSha256: null, blockedRelease: null, attempts: 0, lastAttemptAt: null, installedAt: null, lastError: null };
const statusFile = (dir: string) => path.join(dir, "status.json");
const offFile = (dir: string) => path.join(dir, "auto-update.off");

export async function readStatus(dir: string): Promise<UpdateStatus> {
  try {
    return { ...EMPTY, ...(JSON.parse(await readFile(statusFile(dir), "utf8")) as Partial<UpdateStatus>) };
  } catch {
    return { ...EMPTY };
  }
}

export async function writeStatus(dir: string, patch: Partial<UpdateStatus>): Promise<UpdateStatus> {
  const next = { ...(await readStatus(dir)), ...patch };
  await mkdir(dir, { recursive: true });
  await writeFile(`${statusFile(dir)}.tmp`, JSON.stringify(next, null, 2));
  await rename(`${statusFile(dir)}.tmp`, statusFile(dir));
  return next;
}

export async function autoEnabled(dir: string): Promise<boolean> {
  return stat(offFile(dir)).then(() => false, () => true);
}

export async function setAutoEnabled(dir: string, enabled: boolean): Promise<void> {
  if (enabled) return rm(offFile(dir), { force: true });
  await mkdir(dir, { recursive: true });
  await writeFile(offFile(dir), "Automatic update is off. Delete this file, or switch it on in EZI > Backup, to turn it on again.\n");
}

/** What the Admin page shows. `available` is only true for a version newer than the installed one. */
export async function summary(dir: string, current: string) {
  const s = await readStatus(dir);
  return {
    current,
    latest: s.latest,
    available: !!s.latest && isNewer(s.latest, current),
    autoEnabled: await autoEnabled(dir),
    checkedAt: s.checkedAt,
    lastError: s.lastError,
  };
}

// ------------------------------------------------------------------------------------------------ idle rule

const gauge = { active: 0, lastAt: Date.now() };

/** Counts the requests that are running and when the last one started. The idle question itself is not counted. */
export const trackRequests: RequestHandler = (req, res, next) => {
  if (req.path === "/update/idle") return next();
  gauge.active++;
  gauge.lastAt = Date.now();
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    gauge.active--;
    gauge.lastAt = Date.now();
  };
  res.once("close", finish);
  next();
};

export const idleReading = (now = Date.now()) => ({ active: gauge.active, idleSeconds: Math.max(0, Math.floor((now - gauge.lastAt) / 1000)) });

export interface IdleReading {
  active: number;
  idleSeconds: number;
}

/**
 * Idle = nothing running and 10 minutes without a request, seen twice 30 seconds apart. `read` returns null when
 * the program does not answer (service stopped): then nobody is using it.
 */
export async function isIdle(read: () => Promise<IdleReading | null>, sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): Promise<boolean> {
  const ok = (r: IdleReading | null) => r === null || (r.active === 0 && r.idleSeconds >= IDLE_SECONDS);
  if (!ok(await read())) return false;
  await sleep(IDLE_RECHECK_MS);
  return ok(await read());
}

// ------------------------------------------------------------------------------------------------ one run of the updater

export type RunResult = "current" | "off" | "waiting-retry" | "gave-up" | "no-file" | "waiting-idle" | "installed" | "failed" | "check-failed" | "no-file" | "locked";

export interface RunDeps {
  dir: string;
  current: string;
  source: Source;
  now: () => number;
  isIdle: () => Promise<boolean>;
  /** Runs the downloaded installer silently and returns its exit code. */
  install: (file: string) => Promise<number>;
  /** Brings the services up again after a failed installer (it may have stopped them). */
  startServices: () => Promise<void>;
  log: (line: string) => void;
}

async function withLock<T>(dir: string, now: number, work: () => Promise<T>): Promise<T | "locked"> {
  const lock = path.join(dir, "lock");
  await mkdir(dir, { recursive: true });
  const taken = await stat(lock).then((s) => now - s.mtimeMs < LOCK_STALE_MS, () => false);
  if (taken) return "locked";
  await writeFile(lock, String(process.pid));
  try {
    return await work();
  } finally {
    await rm(lock, { force: true });
  }
}

/** One round of the hourly task: check (at most every 12 hours), download, verify, wait for idle, install. */
export async function runAutoUpdate(d: RunDeps): Promise<RunResult> {
  return withLock(d.dir, d.now(), async (): Promise<RunResult> => {
    const auto = await autoEnabled(d.dir);
    let status = await readStatus(d.dir);
    const newer = (x: UpdateStatus) => !!x.latest && isNewer(x.latest, d.current);
    // A file is wanted when an update is due and no verified installer waits (never again for a release that failed its checksum).
    const wantsFile = (x: UpdateStatus) => auto && newer(x) && !x.downloadedSha256 && x.attempts < MAX_ATTEMPTS && x.blockedRelease !== x.releaseId;
    const checkedAgo = status.checkedAt ? d.now() - Date.parse(status.checkedAt) : Infinity;

    if (checkedAgo >= CHECK_EVERY_MS || wantsFile(status)) {
      try {
        const release = await fetchLatest(d.source);
        const changed = status.releaseId !== release.releaseId;
        status = await writeStatus(d.dir, {
          checkedAt: new Date(d.now()).toISOString(), latest: release.version, releaseId: release.releaseId, lastError: null,
          ...(changed ? { attempts: 0, lastAttemptAt: null, downloadedSha256: null, blockedRelease: null } : {}),
        });
        if (wantsFile(status)) status = await writeStatus(d.dir, { downloadedSha256: (await downloadVerified(d.source, release, d.dir)).sha256 });
      } catch (err) {
        const blocked = err instanceof UpdateError && err.kind === "checksum" ? { blockedRelease: status.releaseId } : {};
        status = await writeStatus(d.dir, { checkedAt: new Date(d.now()).toISOString(), lastError: (err as Error).message, ...blocked });
        d.log(`Update check failed: ${(err as Error).message}`);
        // Without internet a installer that was already downloaded and verified can still be installed.
        if (!newer(status) || !status.downloadedSha256) return "check-failed";
      }
    }

    if (!newer(status)) return "current";
    if (!auto) return "off";
    if (status.attempts >= MAX_ATTEMPTS) return "gave-up";
    if (status.lastAttemptAt && d.now() - Date.parse(status.lastAttemptAt) < RETRY_AFTER_MS) return "waiting-retry";

    const file = path.join(d.dir, `EZI-Setup-${status.latest}.exe`);
    // The file on disk must still be the verified one: a changed or missing file is never run, the next round downloads it again.
    const onDisk = status.downloadedSha256 ? await sha256File(file).catch(() => null) : null;
    if (!status.downloadedSha256 || onDisk !== status.downloadedSha256) {
      await rm(file, { force: true });
      await writeStatus(d.dir, { downloadedSha256: null });
      return "no-file";
    }
    if (!(await d.isIdle())) return "waiting-idle";

    await writeStatus(d.dir, { attempts: status.attempts + 1, lastAttemptAt: new Date(d.now()).toISOString() });
    d.log(`Installing ${status.latest} silently`);
    const code = await d.install(file).catch(() => -1);
    if (code === 0) {
      await rm(file, { force: true });
      await writeStatus(d.dir, { installedAt: new Date(d.now()).toISOString(), downloadedSha256: null, attempts: 0, lastAttemptAt: null, lastError: null });
      return "installed";
    }
    await d.startServices().catch((err) => d.log(`Could not start EZI again: ${(err as Error).message}`));
    await writeStatus(d.dir, { lastError: `The installer stopped with code ${code}. EZI was started again; it will try again in 24 hours.` });
    return "failed";
  });
}
