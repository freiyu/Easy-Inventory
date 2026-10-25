// Contract tests for /purchase-requests (PRD 4.6A, 6.6): ownership, Staff data limits, idempotency,
// approval rules (BR-29), full receipt with generated item codes (BR-28, BR-31, BR-32).
import { beforeEach, describe, expect, it } from "vitest";
import { daysFromToday } from "../format";
import { setLatency } from "../mock/adapter";
import { DEMO_PASSWORD, resetMock } from "../mock/state";
import type { PurchaseInput } from "../schemas";
import { auth } from "./auth";
import { items, type ItemDto } from "./master";
import { purchases, type PurchaseDto } from "./purchases";

const RINA = "rina.wulandari@kantor.example"; // Admin
const HENDRA = "hendra.kusuma@kantor.example"; // Admin
const BUDI = "budi.santoso@kantor.example"; // Staff, id 3
const DEWI = "dewi.lestari@kantor.example"; // Staff, id 4

const ok = <T,>(r: { success: boolean } & Record<string, unknown>) => {
  expect(r.success, JSON.stringify(r)).toBe(true);
  return r as unknown as { success: true; data: T; meta?: { page: number; pageSize: number; total: number } };
};
const loginAs = async (email: string) => ok(await auth.login(email, DEMO_PASSWORD, false));

beforeEach(() => {
  setLatency(0);
  resetMock();
});

const existing = async (name: string) => ok<ItemDto[]>(await items.list({ search: name })).data[0];
const input = (requesterId: number, lines: PurchaseInput["lines"]): PurchaseInput => ({
  requesterId, lines, neededBy: daysFromToday(7), reason: "Running low", notes: "",
});
const freshLine = (name: string, quantity = 6) => ({ itemId: null, quantity, newItem: { name, categoryId: 2, unit: "pcs" } });

/** Staff Budi submits a request with one existing and one new item. */
async function budiSubmits(requestId = "req-1") {
  await loginAs(BUDI);
  const tape = await existing("Correction Tape");
  const r = ok<PurchaseDto>(await purchases.create(input(3, [{ itemId: tape.id, quantity: 4 }, freshLine("Desk Organizer", 2)]), true, requestId));
  return r.data;
}

const keysOf = (v: unknown, out = new Set<string>()): Set<string> => {
  if (Array.isArray(v)) v.forEach((x) => keysOf(x, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { out.add(k); keysOf(x, out); }
  return out;
};

describe("Staff views", () => {
  it("see only their own requests and 404 on someone else's", async () => {
    await loginAs(DEWI);
    const others = ok<PurchaseDto[]>(await purchases.list({ pageSize: 500 })).data;
    expect(others.every((p) => p.requesterName === "Dewi Lestari")).toBe(true);
    await loginAs(RINA);
    const all = ok<PurchaseDto[]>(await purchases.list({ pageSize: 500 })).data;
    const budis = all.find((p) => p.requesterId === 3)!;
    await loginAs(DEWI);
    expect(await purchases.one(budis.id)).toMatchObject({ success: false, status: 404, error: { code: "NOT_FOUND" } });
    expect(await purchases.cancel(budis.id)).toMatchObject({ success: false, status: 404 });
  });

  it("never receive price, supplier, stock or transaction data, even for received requests", async () => {
    await loginAs(RINA);
    const received = ok<PurchaseDto[]>(await purchases.list({ status: "Received", pageSize: 500 })).data;
    expect(received.length).toBeGreaterThan(0);
    const adminKeys = keysOf(received);
    expect(adminKeys.has("transactionId")).toBe(true); // control: Admin does get it
    const own = received.find((p) => p.requesterId === 3 || p.requesterId === 4);
    expect(own, "the seed has a received request by a Staff member").toBeDefined();
    await loginAs(own!.requesterId === 3 ? BUDI : DEWI);
    const mine = ok<PurchaseDto[]>(await purchases.list({ status: "Received", pageSize: 500 }));
    expect(mine.data.length).toBeGreaterThan(0);
    const detail = ok<PurchaseDto>(await purchases.one(own!.id));
    for (const k of [...keysOf(mine.data), ...keysOf(detail.data)]) expect(k, k).not.toMatch(/price|supplier|total|transaction|receipt|stock/i);
  });
});

describe("create", () => {
  it("is idempotent for the same clientRequestId and creates a second record for a new one", async () => {
    await loginAs(BUDI);
    const before = ok<PurchaseDto[]>(await purchases.list({})).meta!.total;
    const tape = await existing("Correction Tape");
    const body = input(3, [{ itemId: tape.id, quantity: 1 }]);
    const a = ok<PurchaseDto>(await purchases.create(body, true, "same-id"));
    const b = ok<PurchaseDto>(await purchases.create(body, true, "same-id"));
    expect(b.data.id).toBe(a.data.id);
    expect(ok<PurchaseDto[]>(await purchases.list({})).meta!.total).toBe(before + 1);
    ok(await purchases.create(body, true, "other-id"));
    expect(ok<PurchaseDto[]>(await purchases.list({})).meta!.total).toBe(before + 2);
  });

  it("refuses to file a request for someone else as Staff (403) and rejects bad input (422)", async () => {
    await loginAs(BUDI);
    const tape = await existing("Correction Tape");
    expect(await purchases.create(input(4, [{ itemId: tape.id, quantity: 1 }]), false, "x1")).toMatchObject({ success: false, status: 403 });
    const bad = await purchases.create(input(3, [{ itemId: tape.id, quantity: 0 }]), false, "x2");
    expect(bad).toMatchObject({ success: false, status: 422, error: { code: "VALIDATION_ERROR" } });
  });
});

describe("approval (BR-29)", () => {
  it("blocks approving or rejecting your own request, allows another Admin, refuses Staff", async () => {
    await loginAs(RINA);
    const tape = await existing("Correction Tape");
    const own = ok<PurchaseDto>(await purchases.create(input(1, [{ itemId: tape.id, quantity: 2 }]), true, "own-1")).data;
    expect(own.allowedActions).toEqual(["cancel"]);
    expect(await purchases.approve(own.id)).toMatchObject({ success: false, error: { code: "BUSINESS_RULE_VIOLATION" } });
    expect(await purchases.reject(own.id, "no")).toMatchObject({ success: false, error: { code: "BUSINESS_RULE_VIOLATION" } });
    await loginAs(HENDRA);
    expect(ok<PurchaseDto>(await purchases.one(own.id)).data.allowedActions).toEqual(["cancel", "approve", "reject"]);
    expect(ok<PurchaseDto>(await purchases.approve(own.id)).data.status).toBe("Approved");
    await loginAs(BUDI);
    expect(await purchases.approve(own.id)).toMatchObject({ success: false, status: 403, error: { code: "FORBIDDEN" } });
  });

  it("requires a reason to reject", async () => {
    const req = await budiSubmits();
    await loginAs(RINA);
    expect(await purchases.reject(req.id, " ")).toMatchObject({ success: false, error: { code: "VALIDATION_ERROR" } });
    expect(ok<PurchaseDto>(await purchases.reject(req.id, "Not needed")).data.status).toBe("Rejected");
  });
});

describe("allowedActions", () => {
  it("follow the status and the role", async () => {
    const req = await budiSubmits();
    expect(req.allowedActions).toEqual(["cancel"]); // Staff, pending: only cancel
    await loginAs(RINA);
    expect(ok<PurchaseDto>(await purchases.approve(req.id)).data.allowedActions).toEqual(["cancel", "receive"]);
    await loginAs(BUDI);
    expect(ok<PurchaseDto>(await purchases.one(req.id)).data.allowedActions).toEqual([]); // Staff cannot cancel once approved
    expect(await purchases.cancel(req.id)).toMatchObject({ success: false, error: { code: "BUSINESS_RULE_VIOLATION" } });
    const draft = ok<PurchaseDto>(await purchases.create(input(3, [freshLine("Draft Thing")]), false, "d-1")).data;
    expect(draft.status).toBe("Draft");
    expect(draft.allowedActions).toEqual(["edit", "submit", "cancel"]);
  });
});

describe("receive (BR-28, BR-31, BR-32)", () => {
  it("creates the new item with a generated code, posts the stock once and blocks a second receipt", async () => {
    const req = await budiSubmits();
    await loginAs(RINA);
    ok(await purchases.approve(req.id));
    const tape = await existing("Correction Tape");
    const receipt = { date: daysFromToday(0), supplierId: 2, notes: "", lines: [{ unitPrice: 3600, minimumStock: 0 }, { unitPrice: 25000, minimumStock: 1 }] };
    const done = ok<PurchaseDto>(await purchases.receive(req.id, receipt)).data;
    expect(done.status).toBe("Received");
    expect(done.transactionNumber).toMatch(/^IN-/);
    expect(done.lines[1].itemId).not.toBeNull();
    const made = await existing("Desk Organizer");
    expect(made).toMatchObject({ code: expect.stringMatching(/^STN-\d{4}$/), currentStock: 2, minimumStock: 1, lastPurchasePrice: 25000 });
    expect((await existing("Correction Tape")).currentStock).toBe((tape.currentStock ?? 0) + 4);
    expect(await purchases.receive(req.id, receipt)).toMatchObject({ success: false, error: { code: "BUSINESS_RULE_VIOLATION" } });
    expect((await existing("Correction Tape")).currentStock).toBe((tape.currentStock ?? 0) + 4); // not posted twice
  });

  it("creates nothing when a later line is invalid", async () => {
    const req = await budiSubmits();
    await loginAs(RINA);
    ok(await purchases.approve(req.id));
    const before = ok<ItemDto[]>(await items.list({ pageSize: 500 })).meta!.total;
    const bad = await purchases.receive(req.id, { date: daysFromToday(0), supplierId: 2, notes: "", lines: [{ unitPrice: 1, minimumStock: 0 }, { unitPrice: 1, minimumStock: -1 }] });
    expect(bad).toMatchObject({ success: false, error: { code: "VALIDATION_ERROR" } });
    expect(ok<ItemDto[]>(await items.list({ pageSize: 500 })).meta!.total).toBe(before);
    await loginAs(BUDI);
    expect(await purchases.receive(req.id, { date: daysFromToday(0), supplierId: 2, notes: "", lines: [] })).toMatchObject({ success: false, status: 403 });
  });
});

describe("lists", () => {
  it("filter by status (also a comma list), search by item name and sort", async () => {
    await loginAs(RINA);
    const closed = ok<PurchaseDto[]>(await purchases.list({ status: "Rejected,Cancelled", pageSize: 500 })).data;
    expect(closed.every((p) => p.status === "Rejected" || p.status === "Cancelled")).toBe(true);
    const all = ok<PurchaseDto[]>(await purchases.list({ pageSize: 500, sort: "number:desc" })).data;
    expect(all.map((p) => p.number)).toEqual([...all.map((p) => p.number)].sort().reverse());
    const word = all[0].lines[0].itemName.split(" ")[0];
    const found = ok<PurchaseDto[]>(await purchases.list({ search: word, pageSize: 500 })).data;
    expect(found.length).toBeGreaterThan(0);
  });
});
