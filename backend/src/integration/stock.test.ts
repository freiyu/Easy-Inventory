// Master data rules, stock transactions, concurrency and idempotency on a real MySQL (PRD 4.2-4.5, 7.4, BR-03, BR-19).
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { addUser, Client, ledgerMismatches, masterData, resetData, setupAccounts, startServer, TODAY } from "./helpers";

let server: Awaited<ReturnType<typeof startServer>>;
let admin: Client;
let staff: Client;
let adminId: number;
let data: Awaited<ReturnType<typeof masterData>>;

beforeAll(async () => {
  await resetData();
  server = await startServer();
  ({ admin, staff, adminId } = await setupAccounts(server.base));
  data = await masterData(admin, [{ name: "Kertas A4", stock: 5 }, { name: "Spidol", stock: 20 }]);
});
afterAll(async () => {
  await server.close();
  await prisma.$disconnect();
});

const out = (itemId: number, quantity: number, clientRequestId?: string) =>
  ({ date: TODAY, destination: "Ruang rapat", lines: [{ itemId, quantity }], notes: "", clientRequestId });

describe("master data", () => {
  it("generates item codes per category and subcategory and posts opening stock as an ADJUSTMENT", async () => {
    const items = await prisma.item.findMany({ orderBy: { id: "asc" } });
    expect(items.map((i) => i.code)).toEqual(["OFF-ELK-0001", "OFF-ELK-0002"]);
    const tx = await prisma.stockTransaction.findMany({ where: { type: "ADJUSTMENT" } });
    expect(tx).toHaveLength(2);
  });

  it("refuses an unknown unit and an inactive category or supplier, but lets an item keep its own", async () => {
    const base = { name: "Map", categoryId: data.categoryId, subcategoryId: data.subcategoryId, unit: "pcs", minimumStock: 0, lastPurchasePrice: 0, supplierId: data.supplierId };
    const unit = await admin.post("/items", { ...base, unit: "lusin" });
    expect(unit.status).toBe(422);
    expect(unit.body.error.fields.unit).toBeTruthy();

    const cat2 = await admin.ok("POST", "/categories", { name: "Arsip", code: "ARS" });
    await admin.ok("POST", `/categories/${cat2.id}/deactivate`);
    const inactiveCat = await admin.post("/items", { ...base, categoryId: cat2.id });
    expect(inactiveCat.status).toBe(422);
    expect(inactiveCat.body.error.fields.categoryId).toBeTruthy();

    const sup2 = await admin.ok("POST", "/suppliers", { name: "Toko Tutup" });
    await admin.ok("POST", `/suppliers/${sup2.id}/deactivate`);
    expect((await admin.post("/items", { ...base, supplierId: sup2.id })).body.error.fields.supplierId).toBeTruthy();

    // An item whose own category was deactivated can still be edited without moving it.
    const own = await admin.ok("POST", "/items", { ...base, name: "Map Biru" });
    await admin.ok("POST", `/categories/${data.categoryId}/deactivate`);
    await admin.ok("PUT", `/items/${own.id}`, { ...base, name: "Map Biru Tua" });
    await admin.ok("POST", `/categories/${data.categoryId}/activate`);
  });

  it("deletes only what has no history; a category that issued codes stays", async () => {
    const unused = await admin.ok("POST", "/categories", { name: "Kosong", code: "KSG" });
    await admin.ok("DELETE", `/categories/${unused.id}`);
    expect((await admin.del(`/categories/${data.categoryId}`)).status).toBe(409);
    expect((await admin.del(`/items/${data.itemIds[0]}`)).status).toBe(409);
    await admin.ok("POST", `/items/${data.itemIds[1]}/deactivate`);
    expect((await admin.post("/stock/out", out(data.itemIds[1], 1))).body.error.code).toBe("BUSINESS_RULE_VIOLATION");
    await admin.ok("POST", `/items/${data.itemIds[1]}/activate`);
  });

  it("shows Staff the item list without code, price, supplier or stock numbers", async () => {
    const rows = await staff.ok("GET", "/items");
    expect(rows.length).toBeGreaterThan(0);
    for (const key of ["code", "lastPurchasePrice", "supplierId", "supplierName", "currentStock", "minimumStock"]) {
      expect(rows[0], key).not.toHaveProperty(key);
    }
    expect(rows[0]).toHaveProperty("availableForLoan");
  });
});

describe("stock under concurrency", () => {
  it("never goes below zero when ten outgoing requests race for 5 units", async () => {
    const itemId = data.itemIds[0];
    const results = await Promise.all(Array.from({ length: 10 }, () => admin.post("/stock/out", out(itemId, 1))));
    expect(results.filter((r) => r.status === 201)).toHaveLength(5);
    expect(results.filter((r) => r.status === 422).every((r) => r.body.error.code === "INSUFFICIENT_STOCK")).toBe(true);
    expect((await prisma.item.findUniqueOrThrow({ where: { id: itemId } })).currentStock).toBe(0);
    expect(await ledgerMismatches()).toEqual([]);
  });

  it("keeps every balance equal to its ledger with mixed writes on two items at once", async () => {
    const [a, b] = data.itemIds;
    await admin.ok("POST", "/stock/in", { date: TODAY, supplierId: data.supplierId, lines: [{ itemId: a, quantity: 10, unitPrice: 500 }], notes: "" });
    const twoLines = (first: number, second: number) => ({ date: TODAY, destination: "Gudang", lines: [{ itemId: first, quantity: 1 }, { itemId: second, quantity: 1 }], notes: "" });
    // Opposite line orders on purpose: the item locks are taken in id order, so this must not deadlock.
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => admin.post("/stock/out", i % 2 ? twoLines(a, b) : twoLines(b, a))));
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(await ledgerMismatches()).toEqual([]);
  });

  it("reverses a transaction once; voiding it again is refused", async () => {
    const posted = await admin.ok("POST", "/stock/in", { date: TODAY, supplierId: data.supplierId, lines: [{ itemId: data.itemIds[1], quantity: 3, unitPrice: 700 }], notes: "" });
    const [first, second] = await Promise.all([
      admin.post(`/stock/transactions/${posted.id}/void`, { reason: "Salah input" }),
      admin.post(`/stock/transactions/${posted.id}/void`, { reason: "Salah input" }),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 422]);
    expect(await prisma.stockTransaction.count({ where: { reversalOfId: posted.id } })).toBe(1);
    expect(await ledgerMismatches()).toEqual([]);
  });
});

describe("idempotency (BR-19)", () => {
  it("creates one transaction when the same request arrives twice at once", async () => {
    const key = randomUUID();
    const [r1, r2] = await Promise.all([admin.post("/stock/out", out(data.itemIds[1], 1, key)), admin.post("/stock/out", out(data.itemIds[1], 1, key))]);
    expect(r1.body.data.id).toBe(r2.body.data.id);
    const again = await admin.ok("POST", "/stock/out", out(data.itemIds[1], 1, key));
    expect(again.id).toBe(r1.body.data.id);
    expect(await prisma.stockTransaction.count({ where: { clientRequestId: `${adminId}:${key}` } })).toBe(1);
  });

  it("keeps request ids per user: another user's identical id is a separate request", async () => {
    const { client: admin2 } = await addUser(admin, server.base, "Admin Two", "admin2@test.example", "Admin");
    const key = randomUUID();
    const mine = await admin.ok("POST", "/stock/out", out(data.itemIds[1], 1, key));
    const theirs = await admin2.ok("POST", "/stock/out", out(data.itemIds[1], 1, key));
    expect(theirs.id).not.toBe(mine.id);
  });
});

describe("activity log (PRD 4.12)", () => {
  it("records master data and stock writes", async () => {
    const actions = new Set((await prisma.activityLog.findMany({ select: { action: true } })).map((a) => a.action));
    for (const a of ["Item created", "Item updated", "Category deleted", "Incoming stock posted", "Outgoing stock posted", "Transaction voided"]) expect(actions, a).toContain(a);
  });
});
