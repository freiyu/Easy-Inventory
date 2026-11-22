// Item photo endpoints (v1.2): Admin writes, both roles read, Staff see nothing new, the activity log records changes.
import { mkdir, rm } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { photoDir, PHOTO_MAX_BYTES } from "../services/photos";
import { Client, masterData, type Body, resetData, setupAccounts, startServer } from "./helpers";

let server: Awaited<ReturnType<typeof startServer>>;
let admin: Client;
let staff: Client;
let data: Awaited<ReturnType<typeof masterData>>;
let itemId: number;

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 1)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 2)]);

const body = (res: Response): Promise<Body> => res.json();

/** The body is the image itself, so these calls bypass Client's JSON helper but reuse its session cookie. */
const send = (who: Client, method: string, id: number, body?: Buffer, type = "image/jpeg") =>
  fetch(`${server.base}/api/items/${id}/photo`, { method, headers: { Cookie: who.cookie, ...(body ? { "Content-Type": type } : {}) }, body });

beforeAll(async () => {
  await resetData();
  await rm(photoDir(), { recursive: true, force: true });
  await mkdir(photoDir(), { recursive: true });
  server = await startServer();
  ({ admin, staff } = await setupAccounts(server.base));
  data = await masterData(admin, [{ name: "Proyektor Foto", stock: 2 }, { name: "Kabel Foto", stock: 2 }]);
  itemId = data.itemIds[0];
});
afterAll(async () => {
  await server.close();
  await prisma.$disconnect();
});

describe("photo endpoints", () => {
  it("Admin uploads, both roles fetch the same bytes, and the item DTO carries the photoVersion", async () => {
    const up = await send(admin, "PUT", itemId, JPEG);
    expect(up.status).toBe(200);
    const { photoVersion } = (await body(up)).data;
    expect(photoVersion).toMatch(/^[0-9a-f]{32}\.jpg$/);

    for (const who of [admin, staff]) {
      const res = await send(who, "GET", itemId);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/jpeg");
      expect(res.headers.get("cache-control")).toBe("private, no-cache");
      expect(Buffer.from(await res.arrayBuffer()).equals(JPEG)).toBe(true);
    }
    expect((await admin.ok("GET", `/items/${itemId}`)).photoVersion).toBe(photoVersion);
    expect((await staff.ok("GET", `/items/${itemId}`)).photoVersion).toBe(photoVersion);
    expect((await staff.ok("GET", "/items")).find((i: { id: number }) => i.id === itemId).photoVersion).toBe(photoVersion);
  });

  it("Staff upload and delete get the forbidden error, and the photo stays", async () => {
    const before = (await admin.ok("GET", `/items/${itemId}`)).photoVersion;
    for (const res of [await send(staff, "PUT", itemId, PNG, "image/png"), await send(staff, "DELETE", itemId)]) {
      expect(res.status).toBe(403);
      expect((await body(res)).error.code).toBe("FORBIDDEN");
    }
    expect((await admin.ok("GET", `/items/${itemId}`)).photoVersion).toBe(before);
  });

  it("an anonymous caller gets 401", async () => {
    const res = await fetch(`${server.base}/api/items/${itemId}/photo`);
    expect(res.status).toBe(401);
  });

  it("Staff responses still carry no price, supplier, code or stock fields (only photoVersion is new)", async () => {
    const detail = await staff.ok("GET", `/items/${itemId}`);
    const rows = await staff.ok("GET", "/items");
    for (const row of [detail, rows[0]]) {
      for (const key of ["code", "lastPurchasePrice", "supplierId", "supplierName", "currentStock", "minimumStock", "location", "notes"]) expect(row, key).not.toHaveProperty(key);
    }
  });

  it("rejects a bad body with the clear message, in both languages, and an oversize file", async () => {
    const text = await send(admin, "PUT", itemId, Buffer.from("not an image"), "text/plain");
    expect(text.status).toBe(422);
    expect((await body(text)).error.fields.photo).toBe("The photo must be a JPEG, PNG or WebP image.");

    const id = await fetch(`${server.base}/api/items/${itemId}/photo`, { method: "PUT", headers: { Cookie: admin.cookie, "Content-Type": "image/png", "X-EZI-Lang": "id" }, body: Buffer.from("bukan gambar") });
    expect((await body(id)).error.fields.photo).toBe("Foto harus berupa gambar JPEG, PNG atau WebP.");

    const big = await send(admin, "PUT", itemId, Buffer.concat([JPEG, Buffer.alloc(PHOTO_MAX_BYTES)]));
    expect(big.status).toBe(422);
    expect((await body(big)).error.fields.photo).toBe("The photo is too large. The limit is 2 MB.");

    const none = await fetch(`${server.base}/api/items/${itemId}/photo`, { method: "PUT", headers: { Cookie: admin.cookie } });
    expect(none.status).toBe(422);
  });

  it("GET gives 404 when the item has no photo, the item is unknown, or Staff ask for an inactive item", async () => {
    const other = data.itemIds[1];
    expect((await send(admin, "GET", other)).status).toBe(404);
    expect((await send(admin, "GET", 999_999)).status).toBe(404);
    await send(admin, "PUT", other, PNG, "image/png");
    expect((await send(staff, "GET", other)).status).toBe(200);
    await admin.ok("POST", `/items/${other}/deactivate`);
    expect((await send(staff, "GET", other)).status).toBe(404);
    expect((await send(admin, "GET", other)).status).toBe(200);
  });

  it("Admin deletes the photo; fetching it then gives 404 and the DTO has no photoVersion", async () => {
    const res = await send(admin, "DELETE", itemId);
    expect(res.status).toBe(200);
    expect((await send(admin, "GET", itemId)).status).toBe(404);
    expect((await admin.ok("GET", `/items/${itemId}`)).photoVersion).toBeNull();
    expect((await send(admin, "DELETE", itemId)).status).toBe(200); // nothing to remove is fine
    expect((await send(admin, "DELETE", 999_999)).status).toBe(404);
  });

  it("the activity log records photo changes with the item code and the actor", async () => {
    const rows = await prisma.activityLog.findMany({ where: { action: { in: ["Item photo changed", "Item photo removed"] } }, orderBy: { id: "asc" } });
    const code = (await prisma.item.findUniqueOrThrow({ where: { id: itemId } })).code;
    expect(rows.map((r) => r.action)).toContain("Item photo changed");
    expect(rows.map((r) => r.action)).toContain("Item photo removed");
    expect(rows.filter((r) => r.reference === code).length).toBeGreaterThanOrEqual(2);
    expect(rows.every((r) => r.module === "Items" && r.userId !== null)).toBe(true);
  });
});
