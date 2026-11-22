// Photos travel inside the backup file and come back on restore (v1.2), tested with the real mysqldump/mysql and a real folder.
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { backupDir, restoreDump } from "../services/backup";
import { PHOTO_MAX_BYTES, photoDir, replaceItemPhoto, removeItemPhoto, restorePhotosFrom } from "../services/photos";
import type { SessionUser } from "../services/core";
import { clientFor, dropAllTables } from "./global-setup";
import { Client, masterData, resetData, setupAccounts, startServer, type Body } from "./helpers";

let server: Awaited<ReturnType<typeof startServer>>;
let admin: Client;
let actor: SessionUser;
let data: Awaited<ReturnType<typeof masterData>>;

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(PHOTO_MAX_BYTES - 4, 7)]); // the biggest allowed file
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100, 9)]);
const names = async () => (await readdir(photoDir()).catch(() => [] as string[])).sort();
const photoOf = async (id: number) => (await prisma.item.findUniqueOrThrow({ where: { id } })).photoPath!;

beforeAll(async () => {
  await resetData();
  if (!backupDir().includes(`${path.sep}integration${path.sep}`)) throw new Error(`Refusing to delete ${backupDir()}: not the test data folder.`);
  await rm(backupDir(), { recursive: true, force: true });
  await rm(photoDir(), { recursive: true, force: true });
  server = await startServer();
  const accounts = await setupAccounts(server.base);
  admin = accounts.admin;
  actor = { id: accounts.adminId, name: "Admin One", email: "admin@test.example", role: "Admin", status: "Active", mustChangePassword: false, lastLoginAt: null, createdAt: "" };
  data = await masterData(admin, [{ name: "Foto Satu", stock: 1 }, { name: "Foto Dua", stock: 1 }]);
});
afterAll(async () => {
  await server.close();
  await prisma.$disconnect();
});

const restoreInto = async (file: string) => {
  const url = process.env.RESTORE_DATABASE_URL!;
  await dropAllTables(url); // also checks the target is a test database
  await restoreDump(file, url);
  return clientFor(url);
};

describe("photos in the backup file", () => {
  it("a backup made after adding photos restores them on a clean data folder, byte for byte, with the database", async () => {
    await replaceItemPhoto(actor, data.itemIds[0], JPEG); // 2 MB: also proves the mysql client accepts the long comment line
    await replaceItemPhoto(actor, data.itemIds[1], PNG);
    const [one, two] = [await photoOf(data.itemIds[0]), await photoOf(data.itemIds[1])];

    const made: Body = await admin.ok("POST", "/backup/database");
    const file = path.join(backupDir(), made.fileName);
    const sql = gunzipSync(readFileSync(file)).toString("latin1");
    expect(sql).toContain(`-- EZI-PHOTO ${one} `);
    expect(sql).toContain(`-- EZI-PHOTO ${two} `);

    await rm(photoDir(), { recursive: true, force: true }); // a clean data folder
    expect(await names()).toEqual([]);
    const restored = await restoreInto(file);
    try {
      expect(await names()).toEqual([one, two].sort());
      expect(readFileSync(path.join(photoDir(), one)).equals(JPEG)).toBe(true);
      expect(readFileSync(path.join(photoDir(), two)).equals(PNG)).toBe(true);
      const rows = await restored.item.findMany({ where: { id: { in: data.itemIds } }, orderBy: { id: "asc" } });
      expect(rows.map((r) => r.photoPath)).toEqual([one, two]);
    } finally {
      await restored.$disconnect();
    }
  });

  it("a plain download of the backup is the same single file, so it carries the photos too", async () => {
    const made: Body = await admin.ok("POST", "/backup/database");
    const dl = await admin.get(`/backup/database/${made.id}/download`);
    expect(gunzipSync(Buffer.from(dl.raw!)).toString("latin1")).toContain("-- EZI-PHOTO ");
  });

  it("a backup made without photos still restores and leaves the photo folder as it was", async () => {
    for (const id of data.itemIds) await removeItemPhoto(actor, id);
    await rm(photoDir(), { recursive: true, force: true }); // no folder at all, like an install that never had a photo
    const made: Body = await admin.ok("POST", "/backup/database");
    const file = path.join(backupDir(), made.fileName);
    expect(gunzipSync(readFileSync(file)).toString("latin1")).not.toContain("-- EZI-PHOTO ");
    const restored = await restoreInto(file);
    await restored.$disconnect();
    expect(await names()).toEqual([]);
    expect(existsSync(photoDir())).toBe(false);
  });

  it("a backup file with a hostile or broken photo line writes nothing outside the photo folder", async () => {
    const outside = path.join(path.dirname(photoDir()), "evil.jpg");
    const png = PNG.toString("base64");
    const hostile = [
      `-- EZI-PHOTO ../evil.jpg ${png}`, `-- EZI-PHOTO ${"a".repeat(32)}.jpg ${Buffer.from("not an image").toString("base64")}`,
      `-- EZI-PHOTO ${"b".repeat(32)}.exe ${png}`, `-- EZI-PHOTO ${"c".repeat(32)}.png`, `-- EZI-PHOTO`,
    ].join("\n");
    const file = path.join(backupDir(), "ezi-backup-20000101000000-manual.sql.gz");
    await mkdir(backupDir(), { recursive: true });
    await writeFile(file, gzipSync(`-- dump\n${hostile}\n`));
    expect(await restorePhotosFrom(file)).toBe(0);
    expect(existsSync(outside)).toBe(false);
    expect(await names()).toEqual([]);
    await rm(file, { force: true });
  });
});
