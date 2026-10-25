// Contract tests for the loan endpoints on the mock adapter (PRD 4.6, 6.6).
import { beforeEach, describe, expect, it } from "vitest";
import { daysFromToday, today } from "../format";
import { setLatency } from "../mock/adapter";
import { DEMO_PASSWORD, resetMock } from "../mock/state";
import { auth } from "./auth";
import { loans, type LoanDto } from "./loans";
import { items, type ItemDto } from "./master";

const ADMIN = "rina.wulandari@kantor.example"; // id 1
const ADMIN2 = "hendra.kusuma@kantor.example"; // id 2
const STAFF = "budi.santoso@kantor.example"; // id 3
const STAFF2 = "dewi.lestari@kantor.example"; // id 4

type Env<T> = { success: true; data: T; meta?: { total: number } } | { success: false; status: number; error: { code: string; fields?: Record<string, string> } };
const good = <T,>(r: Env<T>) => {
  expect(r.success, JSON.stringify(r)).toBe(true);
  return r as Extract<Env<T>, { success: true }>;
};

beforeEach(() => {
  setLatency(0);
  resetMock();
});
const loginAs = async (email: string) => good(await auth.login(email, DEMO_PASSWORD, false));

const input = (borrowerId: number, itemId: number, quantity = 1) => ({
  borrowerId, lines: [{ itemId, quantity }], loanDate: today(), expectedReturnDate: daysFromToday(3), purpose: "Test", notes: "",
});
const item = async (name: string) => good<ItemDto[]>(await items.list({ search: name, pageSize: 5 })).data[0];

describe("loan visibility", () => {
  it("Staff list and read only their own loans", async () => {
    await loginAs(ADMIN);
    const all = good<LoanDto[]>(await loans.list({ pageSize: 500 })).data;
    const others = all.filter((l) => l.borrowerId !== 3);
    expect(others.length).toBeGreaterThan(0);
    await loginAs(STAFF);
    const mine = good<LoanDto[]>(await loans.list({ pageSize: 500 })).data;
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((l) => l.borrowerId === 3)).toBe(true);
    expect(await loans.one(others[0].id)).toMatchObject({ success: false, status: 404 });
    // Staff lines carry no stock numbers
    expect(mine.flatMap((l) => l.lines).every((x) => x.currentStock === undefined && x.availableForLoan === undefined)).toBe(true);
  });

  it("filters by tab (Borrowed includes Overdue) and searches item names", async () => {
    await loginAs(ADMIN);
    const borrowed = good<LoanDto[]>(await loans.list({ status: "Borrowed", pageSize: 500 })).data;
    expect(borrowed.every((l) => l.displayStatus === "Borrowed" || l.displayStatus === "Overdue")).toBe(true);
    const overdue = good<LoanDto[]>(await loans.list({ status: "Overdue", pageSize: 500 })).data;
    expect(overdue.every((l) => l.displayStatus === "Overdue" && l.daysOverdue > 0)).toBe(true);
    const found = good<LoanDto[]>(await loans.list({ search: "charger", pageSize: 500 })).data;
    expect(found.every((l) => l.itemsSummary.toLowerCase().includes("charger") || l.purpose.toLowerCase().includes("charger") || l.borrowerName.toLowerCase().includes("charger"))).toBe(true);
  });
});

describe("loan workflow", () => {
  it("creates once per clientRequestId, then approve reserves stock and issue/return move it", async () => {
    await loginAs(STAFF);
    const toner = await item("Toner");
    const body = input(3, toner.id, 1);
    const first = good<LoanDto>(await loans.create(body, true, "req-1")).data;
    const again = good<LoanDto>(await loans.create(body, true, "req-1")).data;
    expect(again.id).toBe(first.id);
    expect(first.status).toBe("Pending Approval");
    expect(first.allowedActions).toEqual(["cancel"]);

    await loginAs(ADMIN);
    const before = (await item("Toner")).availableForLoan;
    const seen = good<LoanDto>(await loans.one(first.id)).data;
    expect(seen.allowedActions).toEqual(["cancel", "approve", "reject"]);
    const approved = good<LoanDto>(await loans.approve(first.id)).data;
    expect(approved.status).toBe("Approved");
    expect(approved.allowedActions).toEqual(["cancel", "issue"]);
    expect((await item("Toner")).availableForLoan).toBe(before - 1);

    const stockBefore = (await item("Toner")).currentStock!;
    good(await loans.issue(first.id));
    expect((await item("Toner")).currentStock).toBe(stockBefore - 1);
    const borrowed = good<LoanDto>(await loans.one(first.id)).data;
    expect(borrowed.allowedActions).toEqual(["return"]);
    const early = await loans.return(first.id, { returnDate: daysFromToday(-30), notes: "" });
    expect(early).toMatchObject({ success: false, error: { code: "VALIDATION_ERROR", fields: { returnDate: expect.any(String) } } });
    const done = good<LoanDto>(await loans.return(first.id, { returnDate: today(), notes: "ok" })).data;
    expect(done.status).toBe("Completed");
    expect(done.allowedActions).toEqual([]);
    expect((await item("Toner")).currentStock).toBe(stockBefore);
  });

  it("blocks self-approval and Staff approving", async () => {
    await loginAs(ADMIN);
    const mine = good<LoanDto>(await loans.create(input(1, (await item("Toner")).id), true, "own-1")).data;
    expect(mine.allowedActions).toEqual(["cancel"]); // no approve/reject on your own request
    expect(await loans.approve(mine.id)).toMatchObject({ success: false, error: { code: "BUSINESS_RULE_VIOLATION" } });
    await loginAs(ADMIN2);
    expect(good<LoanDto>(await loans.one(mine.id)).data.allowedActions).toContain("approve");
    await loginAs(STAFF);
    expect(await loans.approve(mine.id)).toMatchObject({ success: false, status: 403, error: { code: "FORBIDDEN" } });
  });

  it("refuses more than is available with INSUFFICIENT_STOCK and a line-level field", async () => {
    await loginAs(STAFF);
    const charger = await item("Charger");
    const r = await loans.create(input(3, charger.id, 999), true, "big-1");
    expect(r).toMatchObject({ success: false, error: { code: "INSUFFICIENT_STOCK", fields: { "lines.0.quantity": expect.any(String) } } });
  });

  it("lets only the owner edit a draft, and Staff cannot touch someone else's", async () => {
    await loginAs(STAFF);
    const toner = await item("Toner");
    const draft = good<LoanDto>(await loans.create(input(3, toner.id), false, "draft-1")).data;
    expect(draft.allowedActions).toEqual(["edit", "submit", "cancel"]);
    const edited = good<LoanDto>(await loans.update(draft.id, { ...input(3, toner.id, 2), purpose: "Changed" }, false)).data;
    expect(edited.lines[0].quantity).toBe(2);
    await loginAs(STAFF2);
    expect(await loans.update(draft.id, input(4, toner.id), false)).toMatchObject({ success: false, status: 404 });
    await loginAs(STAFF);
    const sub = good<LoanDto>(await loans.submit(draft.id)).data;
    expect(sub.status).toBe("Pending Approval");
    expect(await loans.update(draft.id, input(3, toner.id), false)).toMatchObject({ success: false, error: { code: "BUSINESS_RULE_VIOLATION" } });
  });
});
