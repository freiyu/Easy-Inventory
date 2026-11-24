// The update endpoints: Admin only, the off switch, and the idle question that answers on this PC (docs/docs-1.2/UPDATE-DESIGN.md).
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { env } from "../env";
import { updateDirOf, writeStatus } from "../services/update";
import { VERSION } from "../version";
import { Client, resetData, setupAccounts, startServer } from "./helpers";

let server: Awaited<ReturnType<typeof startServer>>;
let admin: Client;
let staff: Client;
const dir = updateDirOf(env.dataDir);

beforeAll(async () => {
  await resetData();
  if (!dir.includes(`${path.sep}integration${path.sep}`)) throw new Error(`Refusing to delete ${dir}: not the test data folder.`);
  rmSync(dir, { recursive: true, force: true });
  server = await startServer();
  ({ admin, staff } = await setupAccounts(server.base));
});
afterAll(async () => {
  await server.close();
  await prisma.$disconnect();
});

describe("update status and the off switch", () => {
  it("Staff and signed-out visitors cannot read or change it", async () => {
    for (const [who, c] of [["staff", staff], ["signed out", new Client(server.base)]] as const) {
      const read = await c.get("/admin/update");
      const write = await c.put("/admin/update", { autoEnabled: false });
      const code = who === "staff" ? "FORBIDDEN" : "UNAUTHENTICATED";
      expect([read.status, read.body.error.code], who).toEqual([who === "staff" ? 403 : 401, code]);
      expect([write.status, write.body.error.code], who).toEqual([who === "staff" ? 403 : 401, code]);
    }
    expect(existsSync(path.join(dir, "auto-update.off"))).toBe(false);
  });

  it("Admin sees the installed version and that automatic update is on", async () => {
    const s = await admin.ok("GET", "/admin/update");
    expect(s).toEqual({ current: VERSION, latest: null, available: false, autoEnabled: true, checkedAt: null, lastError: null, requested: false, phase: null, installError: null, installedAt: null });
  });

  it("shows an available version once the updater has found one", async () => {
    await writeStatus(dir, { latest: "9.0.0", checkedAt: "2026-12-01T00:00:00.000Z" });
    const s = await admin.ok("GET", "/admin/update");
    expect(s).toMatchObject({ latest: "9.0.0", available: true, checkedAt: "2026-12-01T00:00:00.000Z" });
    await writeStatus(dir, { latest: VERSION });
    expect((await admin.ok("GET", "/admin/update")).available).toBe(false);
  });

  it("Admin switches it off and on; the switch is a file the updater reads, and each change is logged", async () => {
    const off = await admin.ok("PUT", "/admin/update", { autoEnabled: false });
    expect(off.autoEnabled).toBe(false);
    expect(existsSync(path.join(dir, "auto-update.off"))).toBe(true);
    expect((await admin.ok("GET", "/admin/update")).autoEnabled).toBe(false);
    const on = await admin.ok("PUT", "/admin/update", { autoEnabled: true });
    expect(on.autoEnabled).toBe(true);
    expect(existsSync(path.join(dir, "auto-update.off"))).toBe(false);
    const actions = (await prisma.activityLog.findMany({ where: { action: { startsWith: "Automatic update" } }, orderBy: { id: "asc" } })).map((a) => a.action);
    expect(actions).toEqual(["Automatic update off", "Automatic update on"]);
  });

  it("refuses a body that is not a yes or no", async () => {
    for (const body of [{}, { autoEnabled: "no" }, { autoEnabled: 0 }]) {
      const r = await admin.put("/admin/update", body);
      expect([r.status, r.body.error.code]).toEqual([422, "VALIDATION_ERROR"]);
    }
  });
});

describe("Update now", () => {
  it("is Admin only, and refused when there is nothing newer", async () => {
    await writeStatus(dir, { latest: VERSION });
    expect((await staff.post("/admin/update/install")).status).toBe(403);
    expect((await new Client(server.base).post("/admin/update/install")).status).toBe(401);
    const none = await admin.post("/admin/update/install");
    expect([none.status, none.body.error.code]).toEqual([422, "BUSINESS_RULE_VIOLATION"]);
    expect(existsSync(path.join(dir, "install-now"))).toBe(false);
  });

  it("leaves one request for the updater and logs it once", async () => {
    await writeStatus(dir, { latest: "9.0.0" });
    const first = await admin.post("/admin/update/install");
    expect(first.status).toBe(202);
    expect(first.body.data).toMatchObject({ available: true, requested: true, phase: null, installError: null });
    expect(existsSync(path.join(dir, "install-now"))).toBe(true);
    await admin.post("/admin/update/install");
    expect(await prisma.activityLog.count({ where: { action: "Update requested" } })).toBe(1);
    rmSync(path.join(dir, "install-now"));
    expect((await admin.ok("GET", "/admin/update")).requested).toBe(false);
  });
});

describe("the idle question", () => {
  it("answers the updater on this PC without a login and says nothing else", async () => {
    const r = await new Client(server.base).get("/update/idle");
    expect(r.status).toBe(200);
    expect(Object.keys(r.body.data).sort()).toEqual(["active", "idleSeconds"]);
    expect(r.body.data.active).toBe(0); // this question is not counted as use
  });

  it("counts a request that is running, and the idle time restarts after it", async () => {
    await admin.get("/auth/me");
    const r = await admin.get("/update/idle");
    expect(r.body.data.idleSeconds).toBeLessThan(5);
  });
});
