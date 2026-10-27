// Subcategories (v12: PRD 4.3A, BR-31 to BR-34) on a real MySQL: management rules, item codes per
// category and subcategory pair, names unique within a category, filters and exports.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { prisma } from "../db";
import { Client, masterData, resetData, setupAccounts, startServer, TODAY } from "./helpers";

let server: Awaited<ReturnType<typeof startServer>>;
let admin: Client;
let staff: Client;
let staffId: number;
let data: Awaited<ReturnType<typeof masterData>>;

beforeAll(async () => {
  await resetData();
  server = await startServer();
  ({ admin, staff, staffId } = await setupAccounts(server.base));
  data = await masterData(admin, [{ name: "Proyektor", stock: 1 }]);
});
afterAll(async () => {
  await server.close();
  await prisma.$disconnect();
});

const item = (name: string, categoryId: number, subcategoryId: number | undefined) =>
  ({ name, categoryId, subcategoryId, unit: "pcs", minimumStock: 0, lastPurchasePrice: 0 });

describe("subcategory management (BR-34)", () => {
  it("refuses a duplicate code, locks a used code and keeps a used subcategory from deletion", async () => {
    expect((await admin.post("/subcategories", { name: "Elektronik Lain", code: "elk" })).status).toBe(409);
    const used = await admin.put(`/subcategories/${data.subcategoryId}`, { name: "Elektronik", code: "ELE" });
    expect(used.body.error.fields.code).toBeTruthy();
    expect((await admin.del(`/subcategories/${data.subcategoryId}`)).status).toBe(409);
    const unused = await admin.ok("POST", "/subcategories", { name: "Sementara", code: "TMP" });
    await admin.ok("DELETE", `/subcategories/${unused.id}`);
    expect(await prisma.activityLog.count({ where: { module: "Subcategories" } })).toBeGreaterThanOrEqual(2);
  });

  it("gives Staff only the id and name of active subcategories, and refuses their writes", async () => {
    const off = await admin.ok("POST", "/subcategories", { name: "Arsip", code: "ARS" });
    await admin.ok("POST", `/subcategories/${off.id}/deactivate`);
    const rows = await staff.ok("GET", "/subcategories");
    expect(rows).toEqual([{ id: data.subcategoryId, name: "Elektronik" }]);
    expect((await staff.post("/subcategories", { name: "X", code: "XXX" })).status).toBe(403);
  });

  it("requires an active subcategory for a new item, but an item may keep an inactive one", async () => {
    const none = await admin.post("/items", item("Mic", data.categoryId, undefined));
    expect(none.status).toBe(422);
    expect(none.body.error.fields.subcategoryId).toBeTruthy();
    const sub = await admin.ok("POST", "/subcategories", { name: "Audio", code: "AUD" });
    const mic = await admin.ok("POST", "/items", item("Mic", data.categoryId, sub.id));
    await admin.ok("POST", `/subcategories/${sub.id}/deactivate`);
    expect((await admin.post("/items", item("Mic 2", data.categoryId, sub.id))).body.error.fields.subcategoryId).toBeTruthy();
    await admin.ok("PUT", `/items/${mic.id}`, item("Mic Utama", data.categoryId, sub.id));
    await admin.ok("POST", `/subcategories/${sub.id}/activate`);
  });
});

describe("item codes and names (BR-31 to BR-33)", () => {
  it("numbers each category and subcategory pair on its own, without gaps or repeats under concurrency", async () => {
    const area = await admin.ok("POST", "/categories", { name: "Aula", code: "AUL" });
    const fur = await admin.ok("POST", "/subcategories", { name: "Furnitur", code: "FUR" });
    const made = await Promise.all(Array.from({ length: 6 }, (_, i) => admin.ok("POST", "/items", item(`Kursi ${i}`, area.id, data.subcategoryId))));
    expect(made.map((m) => m.code).sort()).toEqual(["AUL-ELK-0001", "AUL-ELK-0002", "AUL-ELK-0003", "AUL-ELK-0004", "AUL-ELK-0005", "AUL-ELK-0006"]);
    expect((await admin.ok("POST", "/items", item("Meja Panjang", area.id, fur.id))).code).toBe("AUL-FUR-0001");
  });

  it("allows the same new-item name in another category but not in the same one", async () => {
    const other = await admin.ok("POST", "/categories", { name: "Ruang Rapat", code: "RRP" });
    const line = (categoryId: number) => [{ itemId: null, quantity: 1, newItem: { name: "Proyektor", categoryId, subcategoryId: data.subcategoryId, unit: "unit" } }];
    const request = (categoryId: number) => ({ requesterId: staffId, lines: line(categoryId), neededBy: TODAY, reason: "Rapat", notes: "", submit: true });
    const same = await staff.post("/purchase-requests", request(data.categoryId));
    expect(same.status).toBe(409);
    const pr = await staff.ok("POST", "/purchase-requests", request(other.id));
    await admin.ok("POST", `/purchase-requests/${pr.id}/approve`);
    await admin.ok("POST", `/purchase-requests/${pr.id}/receive`, { date: TODAY, supplierId: data.supplierId, lines: [{ unitPrice: 0, minimumStock: 0 }], notes: "" });
    expect((await prisma.item.findFirstOrThrow({ where: { name: "Proyektor", categoryId: other.id } })).code).toBe("RRP-ELK-0001");
  });

  it("imports a CSV name that exists in another category, and skips one in the same category", async () => {
    const csv = "name,category,subcategory,unit\nProyektor,Office,ELK,unit\nProyektor,Aula,elk,unit\n";
    const report = await admin.ok("POST", "/items/import/preview", { csv });
    expect(report.rows.map((r: { status: string }) => r.status)).toEqual(["skipped", "ready"]);
  });
});

describe("data from before v12", () => {
  it("explains why a request whose new-item line has no subcategory cannot be received", async () => {
    const pr = await staff.ok("POST", "/purchase-requests", {
      requesterId: staffId, neededBy: TODAY, reason: "Lama", notes: "", submit: true,
      lines: [{ itemId: null, quantity: 1, newItem: { name: "Barang Lama", categoryId: data.categoryId, subcategoryId: data.subcategoryId, unit: "pcs" } }],
    });
    await prisma.purchaseRequestItem.updateMany({ where: { purchaseRequestId: pr.id }, data: { newItemSubcategoryId: null } }); // as saved before v12
    await admin.ok("POST", `/purchase-requests/${pr.id}/approve`);
    const r = await admin.post(`/purchase-requests/${pr.id}/receive`, { date: TODAY, supplierId: data.supplierId, lines: [{ unitPrice: 0, minimumStock: 0 }], notes: "" });
    expect(r.body.error).toMatchObject({ code: "BUSINESS_RULE_VIOLATION", message: expect.stringContaining("before subcategories existed") });
  });

  it("refuses at database level to delete a subcategory that items use", async () => {
    await expect(prisma.subcategory.delete({ where: { id: data.subcategoryId } })).rejects.toThrow();
  });
});

describe("filters and exports", () => {
  it("filters items and the stock report by subcategory and exports the subcategory column", async () => {
    const fur = await prisma.subcategory.findUniqueOrThrow({ where: { code: "FUR" } });
    const items = await admin.ok("GET", `/items?subcategoryId=${fur.id}`);
    expect(items.map((i: { name: string; subcategoryName: string }) => [i.name, i.subcategoryName])).toEqual([["Meja Panjang", "Furnitur"]]);
    expect((await admin.ok("GET", `/reports/stock?subcategoryId=${fur.id}`)).map((i: { code: string }) => i.code)).toEqual(["AUL-FUR-0001"]);
    const file = await admin.get(`/export/items?subcategoryId=${fur.id}`);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(XLSX.read(Buffer.from(file.raw!)).Sheets[XLSX.read(Buffer.from(file.raw!)).SheetNames[0]], { header: 1 });
    expect(rows[0]).toContain("Subcategory");
    expect(rows[1]).toEqual(expect.arrayContaining(["AUL-FUR-0001", "Meja Panjang", "Aula", "Furnitur"]));
  });
});
