// Contract tests for the stock endpoints (PRD 4.5, 6.6) through the API client and mock adapter.
import { beforeEach, describe, expect, it } from "vitest";
import { daysFromToday } from "../format";
import { setLatency } from "../mock/adapter";
import { DEMO_PASSWORD, resetMock } from "../mock/state";
import { auth } from "./auth";
import { items, type ItemDto } from "./master";
import { stock, type StockMovementDto, type StockTxDto } from "./stock";

const ADMIN = "rina.wulandari@kantor.example";
const STAFF = "budi.santoso@kantor.example";

type Env = { success: boolean } & Record<string, unknown>;
const ok = <T,>(r: Env) => {
  expect(r.success, JSON.stringify(r)).toBe(true);
  return r as unknown as { success: true; data: T; meta?: { page: number; pageSize: number; total: number } };
};

beforeEach(async () => {
  setLatency(0);
  resetMock();
  await auth.login(ADMIN, DEMO_PASSWORD, false);
});

const today = () => daysFromToday(0);
const itemByName = async (name: string) => ok<ItemDto[]>(await items.list({ search: name, pageSize: 5 })).data[0];
const total = async () => ok<StockTxDto[]>(await stock.list({ pageSize: 1 })).meta!.total;

describe("transaction lists", () => {
  it("returns joined names, allowedActions and meta, newest first", async () => {
    const r = ok<StockTxDto[]>(await stock.list({ pageSize: 10 }));
    expect(r.meta).toMatchObject({ page: 1, pageSize: 10 });
    expect(r.meta!.total).toBeGreaterThan(10);
    const dates = r.data.map((x) => x.date);
    expect([...dates].sort().reverse()).toEqual(dates);
    const posted = r.data.find((x) => x.status === "Posted" && x.type === "IN")!;
    expect(posted.userName).not.toBe("-");
    expect(posted.supplierName).not.toBe("-");
    expect(posted.lines[0].itemName).not.toBe("-");
    expect(posted.allowedActions).toEqual(["void"]);
  });

  it("filters by type, status and item, searches by number and sorts", async () => {
    const outs = ok<StockTxDto[]>(await stock.list({ type: "OUT", pageSize: 500 }));
    expect(outs.data.length).toBeGreaterThan(0);
    expect(outs.data.every((x) => x.type === "OUT")).toBe(true);
    const voided = ok<StockTxDto[]>(await stock.list({ status: "Voided", pageSize: 500 }));
    expect(voided.data.every((x) => x.status === "Voided" && x.allowedActions.length === 0)).toBe(true);
    const paper = await itemByName("A4 Paper");
    const forItem = ok<StockTxDto[]>(await stock.list({ itemId: paper.id, pageSize: 500 }));
    expect(forItem.data.every((x) => x.lines.some((l) => l.itemId === paper.id))).toBe(true);
    const one = outs.data[0];
    expect(ok<StockTxDto[]>(await stock.list({ search: one.number })).data.map((x) => x.id)).toContain(one.id);
    const asc = ok<StockTxDto[]>(await stock.list({ sort: "number:asc", pageSize: 500 })).data.map((x) => x.number);
    expect(asc).toEqual([...asc].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })));
    const future = ok<StockTxDto[]>(await stock.list({ from: daysFromToday(1) }));
    expect(future.meta!.total).toBe(0);
  });

  it("returns one transaction, 404 for a missing one, and per-line history", async () => {
    const list = ok<StockTxDto[]>(await stock.list({ pageSize: 1 }));
    expect(ok<StockTxDto>(await stock.one(list.data[0].id)).data.number).toBe(list.data[0].number);
    expect(await stock.one(999999)).toMatchObject({ success: false, status: 404, error: { code: "NOT_FOUND" } });
    const paper = await itemByName("A4 Paper");
    const h = ok<StockMovementDto[]>(await stock.history({ itemId: paper.id, pageSize: 3 }));
    expect(h.data).toHaveLength(3);
    expect(h.data.every((m) => m.itemId === paper.id)).toBe(true);
  });
});

describe("writes", () => {
  it("posts incoming stock, and a repeated clientRequestId returns the first result without a second transaction", async () => {
    const paper = await itemByName("A4 Paper");
    const before = await total();
    const input = { date: today(), supplierId: 1, lines: [{ itemId: paper.id, quantity: 5, unitPrice: 50000 }], notes: "" };
    const first = ok<StockTxDto>(await stock.in(input, "req-1"));
    const again = ok<StockTxDto>(await stock.in(input, "req-1"));
    expect(again.data.id).toBe(first.data.id);
    expect(await total()).toBe(before + 1);
    expect(ok<ItemDto>(await items.one(paper.id)).data.currentStock).toBe((paper.currentStock ?? 0) + 5);
    // a different key is a different request
    ok(await stock.in(input, "req-2"));
    expect(await total()).toBe(before + 2);
  });

  it("answers INSUFFICIENT_STOCK as 422 with a field error and changes nothing", async () => {
    const paper = await itemByName("A4 Paper");
    const before = await total();
    const r = await stock.out({ date: today(), destination: "Finance", lines: [{ itemId: paper.id, quantity: 999999 }], notes: "" });
    expect(r).toMatchObject({ success: false, status: 422, error: { code: "INSUFFICIENT_STOCK" } });
    expect(!r.success && Object.keys(r.error.fields ?? {})[0]).toMatch(/^lines\./);
    expect(await total()).toBe(before);
  });

  it("adjusts to the physical count and rejects a missing reason", async () => {
    const paper = await itemByName("A4 Paper");
    const bad = await stock.adjust({ date: today(), itemId: paper.id, physical: 3, reason: " " });
    expect(bad).toMatchObject({ success: false, error: { code: "VALIDATION_ERROR" } });
    const r = ok<StockTxDto>(await stock.adjust({ date: today(), itemId: paper.id, physical: 3, reason: "Count" }));
    expect(r.data.type).toBe("ADJUSTMENT");
    expect(ok<ItemDto>(await items.one(paper.id)).data.currentStock).toBe(3);
  });

  it("voids once with a reason; the reversal links back and cannot be voided", async () => {
    const paper = await itemByName("A4 Paper");
    const made = ok<StockTxDto>(await stock.in({ date: today(), supplierId: 1, lines: [{ itemId: paper.id, quantity: 2, unitPrice: 1000 }], notes: "" }));
    expect(await stock.void(made.data.id, " ")).toMatchObject({ success: false, error: { code: "VALIDATION_ERROR" } });
    const rev = ok<StockTxDto>(await stock.void(made.data.id, "Entered twice"));
    expect(rev.data).toMatchObject({ type: "REVERSAL", reversalOfId: made.data.id, reversalOfNumber: made.data.number, allowedActions: [] });
    const original = ok<StockTxDto>(await stock.one(made.data.id)).data;
    expect(original).toMatchObject({ status: "Voided", voidedById: rev.data.id, allowedActions: [] });
    expect(await stock.void(made.data.id, "Again")).toMatchObject({ success: false, error: { code: "BUSINESS_RULE_VIOLATION" } });
    expect(await stock.void(rev.data.id, "Nope")).toMatchObject({ success: false, error: { code: "BUSINESS_RULE_VIOLATION" } });
  });
});

describe("Staff", () => {
  it("get 403 on every stock endpoint", async () => {
    await auth.login(STAFF, DEMO_PASSWORD, false);
    for (const r of [
      await stock.list({}), await stock.one(1), await stock.history({}),
      await stock.in({ date: today(), supplierId: 1, lines: [{ itemId: 1, quantity: 1, unitPrice: 1 }], notes: "" }),
      await stock.out({ date: today(), destination: "x", lines: [{ itemId: 1, quantity: 1 }], notes: "" }),
      await stock.adjust({ date: today(), itemId: 1, physical: 1, reason: "x" }),
      await stock.void(1, "x"),
    ]) expect(r).toMatchObject({ success: false, status: 403, error: { code: "FORBIDDEN" } });
  });
});
