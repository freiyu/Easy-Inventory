// Loans and purchase requests end to end on a real MySQL: reservations, races between Admins, ownership and
// new-item receipt (PRD 4.6, 4.6A, BR-07, BR-08, BR-27..BR-31).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { addUser, Client, ledgerMismatches, masterData, resetData, setupAccounts, startServer, TODAY } from "./helpers";

let server: Awaited<ReturnType<typeof startServer>>;
let admin: Client;
let staff: Client;
let staffId: number;
let adminId: number;
let data: Awaited<ReturnType<typeof masterData>>;

beforeAll(async () => {
  await resetData();
  server = await startServer();
  ({ admin, staff, staffId, adminId } = await setupAccounts(server.base));
  data = await masterData(admin, [{ name: "Proyektor", stock: 3 }]);
});
afterAll(async () => {
  await server.close();
  await prisma.$disconnect();
});

const loan = (borrowerId: number, quantity: number, submit = true) => ({
  borrowerId, lines: [{ itemId: data.itemIds[0], quantity }], loanDate: TODAY, expectedReturnDate: TODAY, purpose: "Presentasi", notes: "", submit,
});
const stockOf = async (id: number) => (await prisma.item.findUniqueOrThrow({ where: { id } })).currentStock;

describe("loans", () => {
  it("lets only one of two racing approvals reserve the last units", async () => {
    const a = await staff.ok("POST", "/loans", loan(staffId, 2));
    const b = await staff.ok("POST", "/loans", loan(staffId, 2));
    const results = await Promise.all([admin.post(`/loans/${a.id}/approve`), admin.post(`/loans/${b.id}/approve`)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 422]);
    expect(await prisma.loan.count({ where: { status: "Approved" } })).toBe(1);
    // The reservation blocks outgoing stock beyond what is free (BR-07): 3 in stock, 2 reserved.
    const outTwo = await admin.post("/stock/out", { date: TODAY, destination: "x", lines: [{ itemId: data.itemIds[0], quantity: 2 }], notes: "" });
    expect(outTwo.body.error.code).toBe("INSUFFICIENT_STOCK");
    await admin.ok("POST", `/loans/${results[0].status === 200 ? b.id : a.id}/reject`, { reason: "Stok tidak cukup" });
  });

  it("issues once, deducts stock at issue and returns it in full", async () => {
    const approved = await prisma.loan.findFirstOrThrow({ where: { status: "Approved" } });
    expect(await stockOf(data.itemIds[0])).toBe(3); // approval reserves, it does not deduct
    const [i1, i2] = await Promise.all([admin.post(`/loans/${approved.id}/issue`), admin.post(`/loans/${approved.id}/issue`)]);
    expect([i1.status, i2.status].sort()).toEqual([200, 422]);
    expect(await stockOf(data.itemIds[0])).toBe(1);
    await admin.ok("POST", `/loans/${approved.id}/return`, { returnDate: TODAY, notes: "" });
    expect(await stockOf(data.itemIds[0])).toBe(3);
    expect(await ledgerMismatches()).toEqual([]);
  });

  it("refuses self-approval and keeps drafts with their owner", async () => {
    const own = await admin.ok("POST", "/loans", loan(adminId, 1));
    const self = await admin.post(`/loans/${own.id}/approve`);
    expect(self.status).toBe(422);
    expect(self.body.error.code).toBe("BUSINESS_RULE_VIOLATION"); // BR-13: a second Admin must approve
    const draft = await staff.ok("POST", "/loans", loan(staffId, 1, false));
    expect((await admin.put(`/loans/${draft.id}`, loan(staffId, 1, false))).status).toBe(403);
    expect((await admin.post(`/loans/${draft.id}/submit`)).status).toBe(403);
    const { client: other } = await addUser(admin, server.base, "Staff Two", "staff2@test.example", "Staff");
    expect((await other.get(`/loans/${draft.id}`)).status).toBe(404);
    expect((await other.post("/loans", loan(staffId, 1))).status).toBe(403); // Staff borrow only for themselves
  });
});

describe("purchase requests", () => {
  const request = (lines: unknown[]) => ({ requesterId: staffId, lines, neededBy: TODAY, reason: "Kebutuhan kantor", notes: "", submit: true });
  const receive = (n: number) => ({ date: TODAY, supplierId: data.supplierId, lines: Array.from({ length: n }, () => ({ unitPrice: 2500, minimumStock: 2 })), notes: "" });

  it("approves without touching stock and receives once, creating the new item with a code", async () => {
    const pr = await staff.ok("POST", "/purchase-requests", request([
      { itemId: data.itemIds[0], quantity: 2 },
      { itemId: null, quantity: 5, newItem: { name: "Kabel HDMI", categoryId: data.categoryId, subcategoryId: data.subcategoryId, unit: "pcs" } },
    ]));
    expect((await staff.ok("GET", `/purchase-requests/${pr.id}`))).not.toHaveProperty("lines.0.unitPrice");
    await admin.ok("POST", `/purchase-requests/${pr.id}/approve`);
    expect(await stockOf(data.itemIds[0])).toBe(3);
    const [r1, r2] = await Promise.all([admin.post(`/purchase-requests/${pr.id}/receive`, receive(2)), admin.post(`/purchase-requests/${pr.id}/receive`, receive(2))]);
    expect([r1.status, r2.status].sort()).toEqual([200, 422]);
    const created = await prisma.item.findFirstOrThrow({ where: { name: "Kabel HDMI" } });
    expect(created).toMatchObject({ code: "OFF-ELK-0002", currentStock: 5, minimumStock: 2, subcategoryId: data.subcategoryId });
    expect(await stockOf(data.itemIds[0])).toBe(5);
    expect(await prisma.stockTransaction.count({ where: { type: "IN" } })).toBe(1);
    expect(await ledgerMismatches()).toEqual([]);
  });

  it("creates a new item name only once when two requests with that name are received at the same time", async () => {
    const line = [{ itemId: null, quantity: 1, newItem: { name: "Webcam", categoryId: data.categoryId, subcategoryId: data.subcategoryId, unit: "pcs" } }];
    const a = await staff.ok("POST", "/purchase-requests", request(line));
    const b = await staff.ok("POST", "/purchase-requests", request(line));
    await admin.ok("POST", `/purchase-requests/${a.id}/approve`);
    await admin.ok("POST", `/purchase-requests/${b.id}/approve`);
    const results = await Promise.all([admin.post(`/purchase-requests/${a.id}/receive`, receive(1)), admin.post(`/purchase-requests/${b.id}/receive`, receive(1))]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await prisma.item.count({ where: { name: "Webcam" } })).toBe(1);
  });

  it("refuses self-approval (BR-29) and receiving an item deactivated after approval (BR-24)", async () => {
    const own = await admin.ok("POST", "/purchase-requests", { ...request([{ itemId: data.itemIds[0], quantity: 1 }]), requesterId: adminId });
    const self = await admin.post(`/purchase-requests/${own.id}/approve`);
    expect(self.body.error.code).toBe("BUSINESS_RULE_VIOLATION");
    const pr = await staff.ok("POST", "/purchase-requests", request([{ itemId: data.itemIds[0], quantity: 1 }]));
    await admin.ok("POST", `/purchase-requests/${pr.id}/approve`);
    await admin.ok("POST", `/items/${data.itemIds[0]}/deactivate`);
    const r = await admin.post(`/purchase-requests/${pr.id}/receive`, receive(1));
    expect(r.body.error.code).toBe("BUSINESS_RULE_VIOLATION");
    await admin.ok("POST", `/items/${data.itemIds[0]}/activate`);
    expect(await ledgerMismatches()).toEqual([]);
  });
});
