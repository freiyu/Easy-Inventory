// Contract tests for the mock adapter behind the API client (PRD 6.6): envelopes, error codes,
// roles, paging, Staff field filtering, automatic item codes (BR-32).
import { beforeEach, describe, expect, it } from "vitest";
import { setLatency } from "../mock/adapter";
import { DEMO_PASSWORD, resetMock } from "../mock/state";
import { auth } from "./auth";
import { get } from "./client";
import { categories, items, suppliers, type ItemDto } from "./master";

const ADMIN = "rina.wulandari@kantor.example";
const STAFF = "budi.santoso@kantor.example";

const ok = <T,>(r: { success: boolean } & Record<string, unknown>) => {
  expect(r.success, JSON.stringify(r)).toBe(true);
  return r as unknown as { success: true; data: T; meta?: { page: number; pageSize: number; total: number } };
};

beforeEach(async () => {
  setLatency(0);
  resetMock();
});

const loginAs = async (email: string) => ok(await auth.login(email, DEMO_PASSWORD, false));

const itemInput = (categoryId: number, name: string) => ({
  name, categoryId, unit: "pcs", openingStock: 0, minimumStock: 1, lastPurchasePrice: 1000, supplierId: null,
  location: "", status: "Active" as const, notes: "",
});

describe("session and errors", () => {
  it("answers 401 UNAUTHENTICATED without a session", async () => {
    const r = await items.list({});
    expect(r).toMatchObject({ success: false, status: 401, error: { code: "UNAUTHENTICATED" } });
  });

  it("uses one generic message for a wrong password and locks after 5 failures (429)", async () => {
    const wrong = await auth.login(ADMIN, "nope", false);
    const unknown = await auth.login("nobody@kantor.example", "nope", false);
    expect(wrong).toMatchObject({ success: false, error: { code: "UNAUTHENTICATED" } });
    expect(!wrong.success && !unknown.success && wrong.error.message === unknown.error.message).toBe(true);
    for (let i = 0; i < 4; i++) await auth.login(ADMIN, "nope", false);
    const locked = await auth.login(ADMIN, DEMO_PASSWORD, false);
    expect(locked).toMatchObject({ success: false, status: 429, error: { code: "RATE_LIMITED" } });
  });

  it("logs in, reports the user on /auth/me and forgets it after logout", async () => {
    await loginAs(ADMIN);
    expect(ok<{ email: string }>(await get("/auth/me")).data.email).toBe(ADMIN);
    await auth.logout();
    expect(await get("/auth/me")).toMatchObject({ success: false, status: 401 });
  });

  it("reports first-run setup only while no user exists", async () => {
    expect(ok<{ needsSetup: boolean }>(await auth.setupStatus()).data.needsSetup).toBe(false);
    resetMock({ firstRun: true });
    expect(ok<{ needsSetup: boolean }>(await auth.setupStatus()).data.needsSetup).toBe(true);
    ok(await auth.firstAdmin({ name: "Owner", email: "owner@kantor.example", password: "longenough1", confirm: "longenough1" }));
    expect(await auth.firstAdmin({ name: "Two", email: "two@kantor.example", password: "longenough1", confirm: "longenough1" })).toMatchObject({ success: false, error: { code: "FORBIDDEN" } });
  });
});

describe("lists", () => {
  it("pages, sorts and searches on the server and returns meta", async () => {
    await loginAs(ADMIN);
    const first = ok<ItemDto[]>(await items.list({ pageSize: 5, sort: "name:asc" }));
    expect(first.data).toHaveLength(5);
    expect(first.meta).toMatchObject({ page: 1, pageSize: 5 });
    expect(first.meta!.total).toBeGreaterThan(5);
    const desc = ok<ItemDto[]>(await items.list({ pageSize: 500, sort: "name:desc" }));
    expect(desc.data[0].name.localeCompare(desc.data[desc.data.length - 1].name)).toBeGreaterThan(0);
    const found = ok<ItemDto[]>(await items.list({ search: "paper" }));
    expect(found.data.length).toBeGreaterThan(0);
    expect(found.data.every((i) => i.name.toLowerCase().includes("paper") || i.code?.toLowerCase().includes("paper"))).toBe(true);
    const low = ok<ItemDto[]>(await items.list({ stockStatus: "Low", pageSize: 500 }));
    expect(low.data.every((i) => i.stockStatus === "Low")).toBe(true);
  });
});

describe("Staff views", () => {
  it("never receive price, supplier, code or stock numbers, and never see inactive items", async () => {
    await loginAs(STAFF);
    const list = ok<ItemDto[]>(await items.list({ pageSize: 500 }));
    expect(list.data.length).toBeGreaterThan(0);
    for (const i of list.data) {
      expect(i.status).toBe("Active");
      for (const key of ["code", "currentStock", "minimumStock", "lastPurchasePrice", "supplierId", "supplierName", "location"]) {
        expect(i, key).not.toHaveProperty(key);
      }
      expect(i.stockStatus).toBeDefined();
    }
  });

  it("get 403 on Admin-only endpoints and only names from /categories", async () => {
    await loginAs(STAFF);
    expect(await suppliers.list({})).toMatchObject({ success: false, status: 403, error: { code: "FORBIDDEN" } });
    expect(await items.create(itemInput(1, "Sneaky"))).toMatchObject({ success: false, status: 403 });
    const cats = ok<Record<string, unknown>[]>(await categories.list({}));
    expect(cats.data.every((c) => Object.keys(c).sort().join() === "id,name")).toBe(true);
  });
});

describe("automatic item codes (BR-32)", () => {
  it("builds CODE-0001, CODE-0002 per category and keeps the code when the category changes", async () => {
    await loginAs(ADMIN);
    const a = ok<{ id: number }>(await categories.create({ name: "Test A", code: "TSA", description: "", status: "Active" }));
    const b = ok<{ id: number }>(await categories.create({ name: "Test B", code: "TSB", description: "", status: "Active" }));
    const one = ok<ItemDto>(await items.create(itemInput(a.data.id, "First")));
    const two = ok<ItemDto>(await items.create(itemInput(a.data.id, "Second")));
    const other = ok<ItemDto>(await items.create(itemInput(b.data.id, "Third")));
    expect([one.data.code, two.data.code, other.data.code]).toEqual(["TSA-0001", "TSA-0002", "TSB-0001"]);
    const moved = ok<ItemDto>(await items.update(one.data.id, itemInput(b.data.id, "First")));
    expect(moved.data.code).toBe("TSA-0001");
    ok(await items.remove(two.data.id));
    const next = ok<ItemDto>(await items.create(itemInput(a.data.id, "Fourth")));
    expect(next.data.code).toBe("TSA-0003"); // numbers are never reused
  });

  it("requires a unique 3-letter category code that is locked once items use it", async () => {
    await loginAs(ADMIN);
    const dup = await categories.create({ name: "Another", code: "ppr", description: "", status: "Active" });
    expect(dup).toMatchObject({ success: false, error: { code: "CONFLICT" } });
    const paper = ok<{ id: number }>(await categories.list({ search: "Paper" })).data[0] as { id: number; name: string; code: string };
    const locked = await categories.update(paper.id, { name: paper.name, code: "NEW", description: "", status: "Active" });
    expect(locked).toMatchObject({ success: false, error: { code: "BUSINESS_RULE_VIOLATION" } });
  });
});
