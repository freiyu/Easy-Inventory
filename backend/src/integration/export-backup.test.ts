// Excel export and database backup with a tested restore on a real MySQL (PRD 2.6, 4.9, 7.5, 8.3).
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { prisma } from "../db";
import { env } from "../env";
import { backupDir, startDailyBackup } from "../services/backup";
import { clientFor, dropAllTables } from "./global-setup";
import { Client, ledgerMismatches, masterData, resetData, setupAccounts, startServer, TODAY } from "./helpers";

let server: Awaited<ReturnType<typeof startServer>>;
let admin: Client;
let data: Awaited<ReturnType<typeof masterData>>;

beforeAll(async () => {
  await resetData();
  if (!backupDir().includes(`${path.sep}integration${path.sep}`)) throw new Error(`Refusing to delete ${backupDir()}: not the test data folder.`);
  rmSync(backupDir(), { recursive: true, force: true });
  server = await startServer();
  ({ admin } = await setupAccounts(server.base));
  data = await masterData(admin, [{ name: "=HYPERLINK(\"http://x\")", stock: 4 }, { name: "Stapler", stock: 2 }]);
  await admin.ok("POST", "/stock/out", { date: TODAY, destination: "Lobby", lines: [{ itemId: data.itemIds[1], quantity: 1 }], notes: "" });
});
afterAll(async () => {
  await server.close();
  await prisma.$disconnect();
});

const sheet = (raw: ArrayBuffer | null) => {
  const wb = XLSX.read(Buffer.from(raw!));
  return wb.Sheets[wb.SheetNames[0]];
};

describe("Excel export", () => {
  it("exports the filtered items as a valid .xlsx with formulas escaped", async () => {
    const r = await admin.get(`/export/items?search=HYPERLINK`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-disposition")).toMatch(/filename="ezi-items-\d{8}\.xlsx"/);
    const ws = sheet(r.raw);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
    expect(rows).toHaveLength(2); // header + the one matching item
    expect(ws.B2.v).toBe("'=HYPERLINK(\"http://x\")");
    expect(ws.B2.f).toBeUndefined();
    expect(typeof ws.F2.v).toBe("number"); // current stock is a real number (after the v12 subcategory column)
  });

  it("writes report dates as date cells", async () => {
    const r = await admin.get(`/reports/movements/export?from=${TODAY}&to=${TODAY}`);
    const a2 = sheet(r.raw).A2;
    expect(a2.t).toBe("n");
    expect(XLSX.SSF.format("yyyy-mm-dd", a2.v)).toBe(TODAY);
    expect(await prisma.activityLog.count({ where: { action: "Excel exported" } })).toBe(2);
  });
});

describe("CSV item import (BR-33)", () => {
  it("previews without saving, then backs up and creates only the ready rows", async () => {
    const csv = "name,category,subcategory,unit,opening_stock\nKertas HVS,Office,ELK,ream,10\nStapler,Office,Elektronik,pcs,1\nPenggaris,Gudang,ELK,pcs,1\n";
    const before = await prisma.item.count();
    const preview = await admin.ok("POST", "/items/import/preview", { csv });
    expect(preview).toMatchObject({ ready: 1, skipped: 1, errors: 1 });
    expect(await prisma.item.count()).toBe(before);
    const done = await admin.ok("POST", "/items/import", { csv });
    expect(done).toMatchObject({ created: 1 });
    expect(await prisma.item.findFirstOrThrow({ where: { name: "Kertas HVS" } })).toMatchObject({ currentStock: 10 });
    expect((await admin.ok("GET", "/backup/database")).map((b: { kind: string }) => b.kind)).toContain("Before import");
    expect(await ledgerMismatches()).toEqual([]);
  });
});

describe("database backup and restore", () => {
  it("takes the daily automatic backup when none exists", async () => {
    const timer = startDailyBackup();
    clearInterval(timer);
    for (let i = 0; i < 50 && !(await admin.ok("GET", "/backup/database")).some((b: { kind: string }) => b.kind === "Automatic"); i++) {
      await new Promise((res) => setTimeout(res, 200));
    }
    expect((await admin.ok("GET", "/backup/database")).map((b: { kind: string }) => b.kind)).toContain("Automatic");
  });

  it("restores a manual backup into a separate database with the same data", async () => {
    const made = await admin.ok("POST", "/backup/database");
    const dl = await admin.get(`/backup/database/${made.id}/download`);
    expect(dl.status).toBe(200);
    const sql = gunzipSync(Buffer.from(dl.raw!));
    expect(sql.equals(gunzipSync(readFileSync(path.join(backupDir(), made.fileName))))).toBe(true);

    // Restore the way the host tool will: load the dump into an empty database with the mysql client.
    const restoreUrl = process.env.RESTORE_DATABASE_URL!;
    await dropAllTables(restoreUrl);
    const u = new URL(restoreUrl);
    const cnf = path.join(env.dataDir, "restore-test.cnf");
    const q = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`; // same quoting as services/backup.ts
    writeFileSync(cnf, `[client]\nhost=${q(u.hostname)}\nport=${u.port || 3306}\nuser=${q(decodeURIComponent(u.username))}\npassword=${q(decodeURIComponent(u.password))}\n`, { mode: 0o600 });
    try {
      execFileSync("mysql", [`--defaults-extra-file=${cnf}`, u.pathname.slice(1)], { input: sql });
    } finally {
      rmSync(cnf, { force: true });
    }

    const restored = clientFor(restoreUrl);
    try {
      const snapshot = async (db: typeof prisma) => ({
        roles: await db.role.count(), users: await db.user.count(), items: await db.item.findMany({ select: { id: true, code: true, name: true, currentStock: true }, orderBy: { id: "asc" } }),
        ledger: await db.stockTransactionItem.count(), transactions: await db.stockTransaction.count(), migrations: await db.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM _prisma_migrations`,
      });
      expect(await snapshot(restored as unknown as typeof prisma)).toEqual(await snapshot(prisma));
    } finally {
      await restored.$disconnect();
    }
    expect(await ledgerMismatches()).toEqual([]);
  });

  it("keeps only the latest 14 backups", async () => {
    for (let i = 0; i < 14; i++) await admin.ok("POST", "/backup/database");
    const list = await admin.call("GET", "/backup/database?pageSize=50");
    expect(list.body.meta.total).toBe(14);
  });
});
