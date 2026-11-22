// Item photo storage on a real MySQL and a real folder (v1.2): type by content, size limit, safe names, old files removed.
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { PHOTO_MAX_BYTES, photoDir, photoFile, removeItemPhoto, replaceItemPhoto } from "../services/photos";
import type { SessionUser } from "../services/core";
import { Client, masterData, resetData, setupAccounts, startServer } from "./helpers";

let server: Awaited<ReturnType<typeof startServer>>;
let admin: Client;
let actor: SessionUser;
let data: Awaited<ReturnType<typeof masterData>>;
let itemId: number;

// Only the first bytes matter: the service reads the type from them.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 1)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 2)]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(32, 3)]);

const files = async () => (await readdir(photoDir()).catch(() => [])).sort();
const photoOf = async (id: number) => (await prisma.item.findUniqueOrThrow({ where: { id } })).photoPath;
const code = async (p: Promise<unknown>) => ((await p.then(() => null, (e: unknown) => e)) as { code?: string } | null)?.code;

beforeAll(async () => {
  await resetData();
  await rm(photoDir(), { recursive: true, force: true });
  await mkdir(photoDir(), { recursive: true });
  server = await startServer();
  const accounts = await setupAccounts(server.base);
  admin = accounts.admin;
  actor = { id: accounts.adminId, name: "Admin One", email: "admin@test.example", role: "Admin", status: "Active", mustChangePassword: false, lastLoginAt: null, createdAt: "" };
  data = await masterData(admin, [{ name: "Kamera Uji", stock: 1 }]);
  itemId = data.itemIds[0];
});
afterAll(async () => {
  await server.close();
  await prisma.$disconnect();
});

describe("item photos", () => {
  it("adds a photo_path column to items", async () => {
    const cols = await prisma.$queryRaw<{ name: string }[]>`SELECT column_name AS name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'items' AND column_name = 'photo_path'`;
    expect(cols).toHaveLength(1);
  });

  it("stores JPEG, PNG and WebP under a server-made name and keeps only that name in the database", async () => {
    for (const [bytes, ext] of [[JPEG, "jpg"], [PNG, "png"], [WEBP, "webp"]] as const) {
      const name = await replaceItemPhoto(actor, itemId, bytes);
      expect(name).toMatch(new RegExp(`^[0-9a-f]{32}\\.${ext}$`));
      expect(await photoOf(itemId)).toBe(name);
      expect((await stat(path.join(photoDir(), name))).size).toBe(bytes.length);
    }
  });

  it("removes the old file when a photo is replaced, so one file is left", async () => {
    await replaceItemPhoto(actor, itemId, JPEG);
    await replaceItemPhoto(actor, itemId, PNG);
    expect(await files()).toEqual([(await photoOf(itemId))!]);
  });

  it("rejects text, an empty file and an oversize file, and changes nothing", async () => {
    const before = { name: await photoOf(itemId), files: await files() };
    // A text file renamed to .jpg is still text: the name is never read, only the bytes.
    expect(await code(replaceItemPhoto(actor, itemId, Buffer.from("<script>alert(1)</script>.jpg")))).toBe("VALIDATION_ERROR");
    expect(await code(replaceItemPhoto(actor, itemId, Buffer.alloc(0)))).toBe("VALIDATION_ERROR");
    expect(await code(replaceItemPhoto(actor, itemId, Buffer.concat([JPEG, Buffer.alloc(PHOTO_MAX_BYTES)])))).toBe("VALIDATION_ERROR");
    expect({ name: await photoOf(itemId), files: await files() }).toEqual(before);
  });

  it("accepts a file of exactly the size limit", async () => {
    const name = await replaceItemPhoto(actor, itemId, Buffer.concat([JPEG, Buffer.alloc(PHOTO_MAX_BYTES - JPEG.length)]));
    expect((await stat(path.join(photoDir(), name))).size).toBe(PHOTO_MAX_BYTES);
  });

  it("gives a path only for names it made (no traversal, no absolute path, no other extension)", () => {
    const ok = `${"a".repeat(32)}.jpg`;
    expect(photoFile(ok)).toBe(path.join(photoDir(), ok));
    for (const bad of [`../${ok}`, `/etc/passwd`, `${"a".repeat(32)}.exe`, `${"A".repeat(32)}.jpg`, `${"a".repeat(31)}.jpg`, `sub/${ok}`, `${ok}/..`, ""]) expect(photoFile(bad), bad).toBeNull();
  });

  it("unknown item: NOT_FOUND and no file is left behind", async () => {
    const before = await files();
    expect(await code(replaceItemPhoto(actor, 999_999, JPEG))).toBe("NOT_FOUND");
    expect(await code(removeItemPhoto(actor, 999_999))).toBe("NOT_FOUND");
    expect(await files()).toEqual(before);
  });

  it("removes the photo: file gone, column null, a second remove is a no-op", async () => {
    await replaceItemPhoto(actor, itemId, JPEG);
    expect(await removeItemPhoto(actor, itemId)).toBe(true);
    expect(await photoOf(itemId)).toBeNull();
    expect(await files()).toEqual([]);
    expect(await removeItemPhoto(actor, itemId)).toBe(false);
  });

  it("two photos set at the same time leave exactly one file, the one in the database", async () => {
    await Promise.all([replaceItemPhoto(actor, itemId, JPEG), replaceItemPhoto(actor, itemId, PNG), replaceItemPhoto(actor, itemId, WEBP)]);
    expect(await files()).toEqual([(await photoOf(itemId))!]);
  });

  it("deleting an item without history removes its photo file; an item with history is still refused", async () => {
    const blank = await admin.ok("POST", "/items", { name: "Tanpa Riwayat", categoryId: data.categoryId, subcategoryId: data.subcategoryId, unit: "pcs", openingStock: 0, minimumStock: 0, lastPurchasePrice: 0 });
    await replaceItemPhoto(actor, blank.id, JPEG);
    const name = (await photoOf(blank.id))!;
    expect(await files()).toContain(name);
    await admin.ok("DELETE", `/items/${blank.id}`);
    expect(await files()).not.toContain(name);
    expect((await admin.del(`/items/${itemId}`)).status).toBe(409);
    expect(await photoOf(itemId)).not.toBeNull();
    expect(await files()).toContain((await photoOf(itemId))!);
  });
});
