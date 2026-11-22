// Item photos (v1.2): one file per item in <DATA_DIR>/photos, only the file name in items.photo_path.
// The file name is made here (random hex plus an extension taken from the file's own bytes), never from the client.
// File writes happen outside the database transaction (it can be retried), so a failed write removes the new file again.
import { randomBytes } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Tx } from "../db";
import { env } from "../env";
import { fail, notFound } from "../http";
import { t } from "../shared";
import { isAdmin, log, write, type Ctx, type SessionUser } from "./core";

export const PHOTO_MAX_BYTES = 2 * 1024 * 1024;
const NAME = /^[0-9a-f]{32}\.(jpg|png|webp)$/;
export const photoDir = () => path.join(env.dataDir, "photos");

/** The image type from the file's first bytes, or null. The extension and the declared type are never trusted. */
export function sniffImage(b: Buffer): "jpg" | "png" | "webp" | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (b.length >= 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return "webp";
  return null;
}

/** Full path of a stored photo, or null when the name is not one this service makes (blocks "../" and absolute paths). */
export const photoFile = (name: string) => (NAME.test(name) ? path.join(photoDir(), name) : null);

/** shortcut: a failed delete leaves an orphan file and is ignored; upgrade to a cleanup job if orphans ever matter. */
export async function dropPhotoFile(name: string | null) {
  const file = name && photoFile(name);
  if (file) await rm(file, { force: true }).catch(() => undefined);
}

/** Stores `bytes` as the item's photo and removes the old file. Throws VALIDATION_ERROR for a bad file, NOT_FOUND for an unknown item. */
export async function replaceItemPhoto(actor: SessionUser, itemId: number, bytes: Buffer): Promise<string> {
  const e = t.errors;
  if (bytes.length === 0) throw fail("VALIDATION_ERROR", e.photoEmpty, { photo: e.photoEmpty });
  if (bytes.length > PHOTO_MAX_BYTES) throw fail("VALIDATION_ERROR", e.photoTooBig, { photo: e.photoTooBig });
  const ext = sniffImage(bytes);
  if (!ext) throw fail("VALIDATION_ERROR", e.photoType, { photo: e.photoType });

  const name = `${randomBytes(16).toString("hex")}.${ext}`;
  await mkdir(photoDir(), { recursive: true });
  await writeFile(path.join(photoDir(), name), bytes, { flag: "wx" });
  let old: string | null;
  try {
    old = await write(actor, async (c) => {
      const { photo, code } = await lockedPhoto(c.tx, itemId);
      await c.tx.item.update({ where: { id: itemId }, data: { photoPath: name } });
      await log(c, "Item photo changed", "Items", code);
      return photo;
    });
  } catch (err) {
    await dropPhotoFile(name);
    throw err;
  }
  await dropPhotoFile(old);
  return name;
}

/** Removes the item's photo (no error when there is none). Returns true when a photo was removed. */
export async function removeItemPhoto(actor: SessionUser, itemId: number): Promise<boolean> {
  const old = await write(actor, async (c) => {
    const { photo, code } = await lockedPhoto(c.tx, itemId);
    if (photo) {
      await c.tx.item.update({ where: { id: itemId }, data: { photoPath: null } });
      await log(c, "Item photo removed", "Items", code);
    }
    return photo;
  });
  await dropPhotoFile(old);
  return old !== null;
}

/** The item's current photo name, with the row locked so two concurrent changes cannot orphan a file. */
async function lockedPhoto(tx: Tx, itemId: number): Promise<{ photo: string | null; code: string }> {
  const rows = await tx.$queryRaw<{ photo_path: string | null; code: string }[]>`SELECT photo_path, code FROM items WHERE id = ${itemId} FOR UPDATE`;
  if (rows.length === 0) throw notFound();
  return { photo: rows[0].photo_path, code: rows[0].code };
}

/** The file to send for GET /items/:id/photo. Staff see active items only, like the item detail. NOT_FOUND when there is no photo. */
export async function itemPhotoFile(c: Ctx, itemId: number): Promise<string> {
  const item = await c.tx.item.findUnique({ where: { id: itemId }, select: { photoPath: true, status: true } });
  if (!item || !item.photoPath || (!isAdmin(c) && item.status !== "Active")) throw notFound();
  const file = photoFile(item.photoPath);
  if (!file) throw notFound();
  return file;
}
