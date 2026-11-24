// The update logic against a mocked releases source (no network, no database): newer, same, older, malformed and
// unreachable releases, the checksum rule, the redirect rule, the off switch, the idle rule and the retry rules.
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  autoEnabled, downloadVerified, fetchLatest, idleReading, isIdle, isNewer, parseSums, parseVersion, pickRelease, readStatus, runAutoUpdate,
  installRequested, requestInstall, setAutoEnabled, summary, UpdateError, type RunDeps, type Source,
} from "./update";

const REPO = "someone/Easy-Releases";
const BYTES = Buffer.from("pretend this is EZI-Setup");
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

const release = (version: string, extra: Record<string, unknown> = {}) => ({
  id: 41, tag_name: `v${version}`, draft: false, prerelease: false,
  assets: [
    { name: `EZI-Setup-${version}.exe`, browser_download_url: `https://github.com/${REPO}/releases/download/v${version}/EZI-Setup-${version}.exe` },
    { name: "SHA256SUMS.txt", browser_download_url: `https://github.com/${REPO}/releases/download/v${version}/SHA256SUMS.txt` },
  ],
  ...extra,
});

interface Call { url: string; init?: RequestInit }
/** A releases source that answers from a table and remembers every request that was made. */
function source(table: { latest?: unknown | Error; sums?: string; installer?: Buffer; redirectInstallerTo?: string }) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const u = String(url);
    if (u.endsWith("/releases/latest")) {
      if (table.latest instanceof Error) throw table.latest;
      return new Response(JSON.stringify(table.latest), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (u.endsWith("SHA256SUMS.txt")) return new Response(table.sums ?? "", { status: 200 });
    if (table.redirectInstallerTo && u.includes("/releases/download/")) return new Response(null, { status: 302, headers: { location: table.redirectInstallerTo } });
    if (u.includes("EZI-Setup-") || u.includes("objects.githubusercontent.com")) return new Response(table.installer ?? BYTES, { status: 200 });
    return new Response("nope", { status: 404 });
  }) as typeof fetch;
  const src: Source = { repo: REPO, fetch: fetchImpl };
  return { src, calls };
}

let dir: string;
let now: number;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "ezi-update-"));
  now = Date.parse("2026-12-01T10:00:00Z");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function deps(src: Source, over: Partial<RunDeps> = {}) {
  const installed: string[] = [];
  const started: number[] = [];
  const logs: string[] = [];
  const d: RunDeps = {
    dir, current: "1.2.0", source: src, now: () => now, isIdle: async () => true,
    install: async (f) => { installed.push(f); return 0; },
    startServices: async () => { started.push(1); },
    log: (l) => logs.push(l),
    ...over,
  };
  return { d, installed, started, logs };
}
const good = (version = "1.2.1") => source({ latest: release(version), sums: `${sha(BYTES)}  EZI-Setup-${version}.exe\n` });
const HOUR = 3600_000;

describe("versions", () => {
  it("reads plain versions only and compares them as numbers", () => {
    expect(parseVersion("v1.2.10")).toEqual([1, 2, 10]);
    expect(parseVersion("1.2")).toBeNull();
    expect(parseVersion("1.2.3-beta")).toBeNull();
    expect(isNewer("1.2.10", "1.2.9")).toBe(true);
    expect(isNewer("1.10.0", "1.9.9")).toBe(true);
    expect(isNewer("1.2.0", "1.2.0")).toBe(false);
    expect(isNewer("1.1.9", "1.2.0")).toBe(false);
    expect(isNewer("garbage", "1.2.0")).toBe(false);
  });
});

describe("the release answer", () => {
  it("picks the installer and the checksum file", () => {
    const r = pickRelease(release("1.3.0"), REPO);
    expect(r).toMatchObject({ version: "1.3.0", releaseId: 41, installerName: "EZI-Setup-1.3.0.exe" });
  });
  it.each([
    ["not an object", "text"],
    ["a draft", release("1.3.0", { draft: true })],
    ["a pre-release", release("1.3.0", { prerelease: true })],
    ["a tag that is not a version", release("1.3.0", { tag_name: "nightly" })],
    ["no release id", release("1.3.0", { id: "x" })],
    ["no assets", release("1.3.0", { assets: [] })],
    ["no checksum file", release("1.3.0", { assets: [release("1.3.0").assets[0]] })],
  ])("rejects %s as malformed", (_n, json) => {
    expect(() => pickRelease(json, REPO)).toThrowError(UpdateError);
  });
  it("refuses assets that are not from the configured repo", () => {
    const other = release("1.3.0");
    other.assets[0].browser_download_url = "https://github.com/someone-else/Easy-Releases/releases/download/v1.3.0/EZI-Setup-1.3.0.exe";
    expect(() => pickRelease(other, REPO)).toThrowError(/not from/);
    other.assets[0].browser_download_url = `http://github.com/${REPO}/releases/download/v1.3.0/EZI-Setup-1.3.0.exe`;
    expect(() => pickRelease(other, REPO)).toThrowError(UpdateError);
  });
  it("reads sha256sum lines, with and without the binary marker", () => {
    const h = "a".repeat(64);
    expect(parseSums(`${h}  EZI-Setup-1.0.0.exe\r\n${h.toUpperCase()} *Other.exe\nnot a line`).get("EZI-Setup-1.0.0.exe")).toBe(h);
    expect(parseSums(`${h.toUpperCase()} *Other.exe`).get("Other.exe")).toBe(h);
  });
});

describe("what leaves this PC", () => {
  it("is two plain GETs with a generic user agent: no body, no query, no cookie, nothing about the office", async () => {
    const { src, calls } = good();
    const { d } = deps(src);
    await runAutoUpdate(d);
    expect(calls.length).toBeGreaterThanOrEqual(3); // latest, checksums, installer
    for (const c of calls) {
      expect(c.init?.method).toBe("GET");
      expect(c.init?.body).toBeUndefined();
      expect(Object.keys(c.init?.headers as Record<string, string>).sort()).toEqual(["Accept", "User-Agent"]);
      expect((c.init?.headers as Record<string, string>)["User-Agent"]).toBe("EZI-Updater");
      expect(new URL(c.url).search).toBe("");
      expect(new URL(c.url).protocol).toBe("https:");
    }
  });
});

describe("check and download", () => {
  it("newer: downloads, verifies and installs when idle", async () => {
    const { src } = good();
    const { d, installed } = deps(src);
    expect(await runAutoUpdate(d)).toBe("installed");
    expect(installed).toEqual([path.join(dir, "EZI-Setup-1.2.1.exe")]);
    const s = await readStatus(dir);
    expect(s).toMatchObject({ latest: "1.2.1", lastError: null, downloadedSha256: null });
    expect(s.installedAt).toBeTruthy();
    expect(existsSync(path.join(dir, "EZI-Setup-1.2.1.exe"))).toBe(false); // removed after success
  });

  it("same version: nothing is downloaded or run", async () => {
    const { src, calls } = good("1.2.0");
    const { d, installed } = deps(src);
    expect(await runAutoUpdate(d)).toBe("current");
    expect(installed).toEqual([]);
    expect(calls.map((c) => c.url)).toHaveLength(1);
  });

  it("older version: never a downgrade", async () => {
    const { src, calls } = good("1.1.0");
    const { d, installed } = deps(src);
    expect(await runAutoUpdate(d)).toBe("current");
    expect(installed).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("malformed answer: reported, nothing runs", async () => {
    const { src } = source({ latest: { tag_name: "v9", assets: "x" } });
    const { d, installed } = deps(src);
    expect(await runAutoUpdate(d)).toBe("check-failed");
    expect(installed).toEqual([]);
    expect((await readStatus(dir)).lastError).toMatch(/Unexpected release data/);
  });

  it("not JSON: reported as malformed", async () => {
    const calls: string[] = [];
    const src: Source = { repo: REPO, fetch: (async (u: string) => { calls.push(u); return new Response("<html>", { status: 200 }); }) as typeof fetch };
    const { d } = deps(src);
    expect(await runAutoUpdate(d)).toBe("check-failed");
    expect((await readStatus(dir)).lastError).toMatch(/not JSON/);
  });

  it("unreachable (no internet): silent failure, status says why, nothing runs", async () => {
    const { src } = source({ latest: new Error("getaddrinfo ENOTFOUND api.github.com") });
    const { d, installed, logs } = deps(src);
    expect(await runAutoUpdate(d)).toBe("check-failed");
    expect(installed).toEqual([]);
    expect((await readStatus(dir)).lastError).toMatch(/Cannot reach api\.github\.com/);
    expect(logs.join()).toMatch(/Update check failed/);
  });

  it("a server error answer counts as unreachable", async () => {
    const src: Source = { repo: REPO, fetch: (async () => new Response("down", { status: 503 })) as typeof fetch };
    await expect(fetchLatest(src)).rejects.toMatchObject({ kind: "unreachable" });
  });

  it("checks at most every 12 hours when there is nothing to do", async () => {
    const { src, calls } = good("1.2.0");
    const { d } = deps(src);
    await runAutoUpdate(d);
    now += HOUR;
    await runAutoUpdate(d);
    expect(calls).toHaveLength(1);
    now += 12 * HOUR;
    await runAutoUpdate(d);
    expect(calls).toHaveLength(2);
  });
});

describe("the checksum rule", () => {
  it("a wrong SHA-256 deletes the file, is never run, and is not downloaded again for that release", async () => {
    const { src, calls } = source({ latest: release("1.2.1"), sums: `${"0".repeat(64)}  EZI-Setup-1.2.1.exe\n` });
    const { d, installed } = deps(src);
    expect(await runAutoUpdate(d)).toBe("check-failed");
    expect(installed).toEqual([]);
    expect(readdirSync(dir).filter((f) => f.endsWith(".exe") || f.endsWith(".part"))).toEqual([]);
    const s = await readStatus(dir);
    expect(s.lastError).toMatch(/does not match/);
    expect(s.blockedRelease).toBe(41);
    const before = calls.length;
    now += 13 * HOUR;
    await runAutoUpdate(d);
    expect(calls.slice(before).some((c) => c.url.includes("EZI-Setup-"))).toBe(false); // the installer is not fetched again
    expect(installed).toEqual([]);
  });

  it("a checksum file without a line for the installer stops the update", async () => {
    const { src } = source({ latest: release("1.2.1"), sums: `${sha(BYTES)}  Something-else.exe\n` });
    await expect(downloadVerified(src, pickRelease(release("1.2.1"), REPO), dir)).rejects.toMatchObject({ kind: "checksum" });
    expect(readdirSync(dir)).toEqual([]);
  });

  it("a file that changed on disk after the download is not run", async () => {
    const { src } = good();
    const { d, installed } = deps(src, { isIdle: async () => false });
    expect(await runAutoUpdate(d)).toBe("waiting-idle");
    writeFileSync(path.join(dir, "EZI-Setup-1.2.1.exe"), "tampered");
    const again = deps(src);
    now += HOUR;
    expect(await runAutoUpdate(again.d)).toBe("no-file");
    expect(again.installed).toEqual([]);
    expect(installed).toEqual([]);
    expect(existsSync(path.join(dir, "EZI-Setup-1.2.1.exe"))).toBe(false);
    // the next round downloads and verifies a fresh copy
    now += HOUR;
    expect(await runAutoUpdate(again.d)).toBe("installed");
  });
});

describe("where a download may come from", () => {
  it("follows a redirect to GitHub's asset storage", async () => {
    const { src } = source({ latest: release("1.2.1"), sums: `${sha(BYTES)}  EZI-Setup-1.2.1.exe`, redirectInstallerTo: "https://objects.githubusercontent.com/abc/EZI-Setup-1.2.1.exe" });
    const got = await downloadVerified(src, pickRelease(release("1.2.1"), REPO), dir);
    expect(got.sha256).toBe(sha(BYTES));
  });
  it.each([
    ["http", "http://objects.githubusercontent.com/x.exe"],
    ["another host", "https://evil.example/x.exe"],
  ])("refuses a redirect to %s", async (_n, to) => {
    const { src } = source({ latest: release("1.2.1"), sums: `${sha(BYTES)}  EZI-Setup-1.2.1.exe`, redirectInstallerTo: to });
    await expect(downloadVerified(src, pickRelease(release("1.2.1"), REPO), dir)).rejects.toMatchObject({ kind: "forbidden-source" });
    expect(readdirSync(dir).filter((f) => f.endsWith(".exe"))).toEqual([]);
  });
  it("only asks the repo that is configured", async () => {
    const { src, calls } = good();
    await fetchLatest(src);
    expect(calls[0].url).toBe(`https://api.github.com/repos/${REPO}/releases/latest`);
  });
});

describe("the off switch", () => {
  it("is on by default, and turning it off keeps the check but never downloads or installs", async () => {
    expect(await autoEnabled(dir)).toBe(true);
    await setAutoEnabled(dir, false);
    expect(await autoEnabled(dir)).toBe(false);
    const { src, calls } = good();
    const { d, installed } = deps(src);
    expect(await runAutoUpdate(d)).toBe("off");
    expect(installed).toEqual([]);
    expect(calls.filter((c) => c.url.includes("EZI-Setup-") || c.url.endsWith("SHA256SUMS.txt"))).toEqual([]);
    expect(await summary(dir, "1.2.0")).toMatchObject({ latest: "1.2.1", available: true, autoEnabled: false });
    await setAutoEnabled(dir, true);
    expect(await autoEnabled(dir)).toBe(true);
    now += HOUR;
    expect(await runAutoUpdate(d)).toBe("installed");
  });
});

describe("the idle rule", () => {
  it("is idle only when nothing runs and 10 minutes passed, seen twice", async () => {
    const seq = (...r: ({ active: number; idleSeconds: number } | null)[]) => { let i = 0; return async () => r[Math.min(i++, r.length - 1)]; };
    const nap = async () => undefined;
    expect(await isIdle(seq({ active: 0, idleSeconds: 600 }, { active: 0, idleSeconds: 630 }), nap)).toBe(true);
    expect(await isIdle(seq({ active: 1, idleSeconds: 900 }), nap)).toBe(false);
    expect(await isIdle(seq({ active: 0, idleSeconds: 599 }), nap)).toBe(false);
    expect(await isIdle(seq({ active: 0, idleSeconds: 700 }, { active: 0, idleSeconds: 3 }), nap)).toBe(false); // someone came in between
    expect(await isIdle(seq(null), nap)).toBe(true); // the program does not answer: nobody is using it
  });
  it("a busy PC waits and keeps the verified installer for the next round", async () => {
    const { src } = good();
    let idle = false;
    const { d, installed } = deps(src, { isIdle: async () => idle });
    expect(await runAutoUpdate(d)).toBe("waiting-idle");
    expect(installed).toEqual([]);
    expect(existsSync(path.join(dir, "EZI-Setup-1.2.1.exe"))).toBe(true);
    idle = true;
    now += HOUR;
    expect(await runAutoUpdate(d)).toBe("installed");
  });
  it("counts running requests", () => {
    const r = idleReading();
    expect(r.active).toBeGreaterThanOrEqual(0);
    expect(idleReading(Date.now() + 700_000).idleSeconds).toBeGreaterThanOrEqual(600);
  });
});

describe("when the installer fails", () => {
  it("starts EZI again, waits 24 hours, tries again, and gives up after 3 tries until a new release", async () => {
    const { src } = good();
    const { d, started } = deps(src, { install: async () => 5 });
    expect(await runAutoUpdate(d)).toBe("failed");
    expect(started).toHaveLength(1);
    expect((await readStatus(dir)).installError).toMatch(/code 5/);
    now += 2 * HOUR;
    expect(await runAutoUpdate(d)).toBe("waiting-retry");
    now += 24 * HOUR;
    expect(await runAutoUpdate(d)).toBe("failed");
    now += 25 * HOUR;
    expect(await runAutoUpdate(d)).toBe("failed");
    now += 25 * HOUR;
    expect(await runAutoUpdate(d)).toBe("gave-up");
    expect(started).toHaveLength(3);
  });

  it("a thrown installer counts as a failure and the services are started again", async () => {
    const { src } = good();
    const { d, started } = deps(src, { install: async () => { throw new Error("cannot start"); } });
    expect(await runAutoUpdate(d)).toBe("failed");
    expect(started).toHaveLength(1);
  });

  it("a verified installer is still installed when the next check has no internet", async () => {
    const { src } = good();
    let idle = false;
    const { d, installed } = deps(src, { isIdle: async () => idle });
    expect(await runAutoUpdate(d)).toBe("waiting-idle");
    const offline = deps({ repo: REPO, fetch: (async () => { throw new Error("offline"); }) as typeof fetch }, { isIdle: async () => (idle = true) });
    now += 13 * HOUR;
    expect(await runAutoUpdate(offline.d)).toBe("installed");
    expect(offline.installed).toHaveLength(1);
    expect(installed).toEqual([]);
  });
});

describe("two rounds at once", () => {
  it("the second one stops at the lock", async () => {
    const { src } = good();
    writeFileSync(path.join(dir, "lock"), "123");
    utimesSync(path.join(dir, "lock"), now / 1000, now / 1000); // a lock written "now" on the test clock
    const { d } = deps(src);
    expect(await runAutoUpdate(d)).toBe("locked");
  });
});

describe("Update now", () => {
  it("installs at once even with the switch off and people using EZI, then removes the request", async () => {
    const { src } = good();
    await setAutoEnabled(dir, false);
    await requestInstall(dir);
    let phaseWhileInstalling: string | null = null;
    const { d, installed } = deps(src, {
      isIdle: async () => false,
      install: async (f) => { phaseWhileInstalling = (await readStatus(dir)).phase; installed2.push(f); return 0; },
    });
    const installed2: string[] = [];
    expect(await runAutoUpdate(d)).toBe("installed");
    expect(installed2).toHaveLength(1);
    expect(phaseWhileInstalling).toBe("installing");
    expect(await installRequested(dir)).toBe(false);
    expect(installed).toEqual([]);
    expect((await readStatus(dir)).phase).toBeNull();
  });

  it("still verifies the SHA-256: a wrong file is not run even when an Admin asked", async () => {
    const { src } = source({ latest: release("1.2.1"), sums: `${"0".repeat(64)}  EZI-Setup-1.2.1.exe\n` });
    await requestInstall(dir);
    const { d, installed } = deps(src);
    expect(await runAutoUpdate(d)).toBe("check-failed");
    expect(installed).toEqual([]);
    const s = await readStatus(dir);
    expect(s.installError).toMatch(/Could not get the update/);
    expect(await installRequested(dir)).toBe(false);
  });

  it("tries again on request after the automatic retries ran out, and reports a failure to the Admin", async () => {
    const { src } = good();
    const { d } = deps(src, { install: async () => 7 });
    for (let i = 0; i < 3; i++) {
      await runAutoUpdate(d);
      now += 25 * HOUR;
    }
    expect(await runAutoUpdate(d)).toBe("gave-up");
    await requestInstall(dir);
    expect(await runAutoUpdate(d)).toBe("failed");
    expect((await readStatus(dir)).installError).toMatch(/code 7/);
    expect(await installRequested(dir)).toBe(false);
  });

  it("with no internet and nothing downloaded the Admin is told, quietly and once", async () => {
    await requestInstall(dir);
    await writeStatus_(dir);
    const { d, installed } = deps({ repo: REPO, fetch: (async () => { throw new Error("offline"); }) as typeof fetch });
    expect(await runAutoUpdate(d)).toBe("check-failed");
    expect(installed).toEqual([]);
    expect((await readStatus(dir)).installError).toMatch(/offline/);
  });

  it("a request when there is nothing newer is dropped", async () => {
    const { src } = good("1.2.0");
    await requestInstall(dir);
    const { d, installed } = deps(src);
    expect(await runAutoUpdate(d)).toBe("current");
    expect(installed).toEqual([]);
    expect(await installRequested(dir)).toBe(false);
  });
});

async function writeStatus_(d: string) {
  const { writeStatus } = await import("./update");
  await writeStatus(d, { latest: "1.2.1", releaseId: 41, checkedAt: new Date(now).toISOString() });
}
