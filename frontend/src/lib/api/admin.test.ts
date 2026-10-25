// Contract tests for the admin module of the mock adapter: dashboard, expenses, reports, users, activity log, backup.
import { beforeEach, describe, expect, it } from "vitest";
import { setLatency } from "../mock/adapter";
import { DEMO_PASSWORD, mock, resetMock } from "../mock/state";
import type { User } from "../types";
import { activity, backup, dashboard, expenses, reports, users, type ExpenseSummary, type LoanReportRow } from "./admin";
import { auth } from "./auth";
import { get } from "./client";
import type { Envelope } from "./types";

const ADMIN = "rina.wulandari@kantor.example";
const STAFF = "budi.santoso@kantor.example";

function good<T>(r: Envelope<T>) {
  expect(r.success, JSON.stringify(r)).toBe(true);
  return r as Extract<Envelope<T>, { success: true }>;
}
const loginAs = async (email: string, password = DEMO_PASSWORD) => good(await auth.login(email, password, false));
const newUser = { name: "Nina Test", email: "nina.test@kantor.example", role: "Staff" as const };

beforeEach(() => {
  setLatency(0);
  resetMock();
});

describe("dashboard", () => {
  it("gives Admin the stock and loan numbers plus the sidebar badges", async () => {
    await loginAs(ADMIN);
    const { admin, badges, staff } = good(await dashboard.summary()).data;
    expect(staff).toBeUndefined();
    expect(badges).toEqual({ items: expect.any(Number), loans: expect.any(Number), purchases: expect.any(Number) });
    expect(admin!.attention).toBe(admin!.stock.Low + admin!.stock.Out);
    expect(admin!.needsAttention.length).toBeLessThanOrEqual(6);
  });

  it("gives Staff only their own loans and no stock numbers or money", async () => {
    await loginAs(STAFF);
    const data = good(await dashboard.summary()).data;
    expect(data.admin).toBeUndefined();
    expect(data.badges).toBeUndefined();
    const json = JSON.stringify(data);
    for (const key of ["totalStock", "currentStock", "minimumStock", "price", "Price", "total\":"]) expect(json).not.toContain(key);
  });

  it("only lists the signed-in Staff member's loans", async () => {
    await loginAs(STAFF);
    const staff = good(await dashboard.summary()).data.staff!;
    await auth.logout();
    await loginAs(ADMIN);
    const all = good(await reports.loans({ pageSize: 500 })).data as LoanReportRow[];
    const budi = all.filter((l) => l.borrowerName === "Budi Santoso" && ["Pending Approval", "Approved", "Borrowed", "Overdue"].includes(l.status));
    expect(staff.activeLoans.map((l) => l.number).sort()).toEqual(budi.map((l) => l.number).sort());
  });
});

describe("role limits", () => {
  it("answers 403 to Staff on every admin endpoint", async () => {
    await loginAs(STAFF);
    for (const call of [
      () => expenses.summary("2026-01-01", "2026-01-31"), () => reports.stock({}), () => reports.movements({}), () => reports.loans({}),
      () => users.list({}), () => activity.list({}), () => backup.list({}), () => backup.create(),
    ]) expect(await call()).toMatchObject({ success: false, status: 403, error: { code: "FORBIDDEN" } });
  });
});

describe("users", () => {
  it("creates a user whose temporary password works once and must be changed", async () => {
    await loginAs(ADMIN);
    const created = good(await users.create(newUser)).data;
    expect(created.user.mustChangePassword).toBe(true);
    expect(JSON.stringify(created.user)).not.toContain(created.tempPassword);
    await auth.logout();
    const me = await loginAs(newUser.email, created.tempPassword);
    expect(me.data.mustChangePassword).toBe(true);
    const changed = good(await auth.changePassword(undefined, "brand-new-pass"));
    expect(changed.data.mustChangePassword).toBe(false);
    await auth.logout();
    expect(await auth.login(newUser.email, created.tempPassword, false)).toMatchObject({ success: false });
    await loginAs(newUser.email, "brand-new-pass");
  });

  it("filters, searches and rejects duplicate emails", async () => {
    await loginAs(ADMIN);
    const staff = good(await users.list({ role: "Staff", pageSize: 500 })).data;
    expect(staff.length).toBeGreaterThan(0);
    expect(staff.every((u) => u.role === "Staff")).toBe(true);
    const inactive = good(await users.list({ status: "Inactive" })).data;
    expect(inactive.every((u) => u.status === "Inactive")).toBe(true);
    expect(good(await users.list({ search: "budi" })).data.map((u) => u.name)).toEqual(["Budi Santoso"]);
    expect(await users.create({ ...newUser, email: STAFF.toUpperCase() })).toMatchObject({ success: false, status: 409, error: { code: "CONFLICT" } });
    expect(JSON.stringify(good(await users.list({})).data)).not.toMatch(/"(password|tempPassword|hash)/i);
  });

  it("keeps the last active Admin, and a deactivated user can no longer sign in", async () => {
    await loginAs(ADMIN);
    const all = good(await users.list({ pageSize: 500 })).data;
    const admins = all.filter((u) => u.role === "Admin" && u.status === "Active");
    expect(admins).toHaveLength(2);
    const [me, other] = [admins.find((u) => u.email === ADMIN)!, admins.find((u) => u.email !== ADMIN)!];
    good(await users.setStatus(other.id, "deactivate"));
    expect(await users.setStatus(me.id, "deactivate")).toMatchObject({ success: false, error: { code: "BUSINESS_RULE_VIOLATION" } });
    expect(await users.update(me.id, { name: me.name, email: me.email, role: "Staff" })).toMatchObject({ success: false, error: { code: "BUSINESS_RULE_VIOLATION" } });
    await auth.logout();
    expect(await auth.login(other.email, DEMO_PASSWORD, false)).toMatchObject({ success: false });
  });

  it("resets a password to a new temporary one", async () => {
    await loginAs(ADMIN);
    const budi = good(await users.list({ search: "budi" })).data[0];
    const { tempPassword } = good(await users.resetPassword(budi.id)).data;
    await auth.logout();
    expect((await loginAs(STAFF, tempPassword)).data.mustChangePassword).toBe(true);
    expect(await auth.login(STAFF, DEMO_PASSWORD, false)).toMatchObject({ success: false });
  });
});

describe("activity log", () => {
  it("returns newest first with user names, and filters by user, module and dates", async () => {
    await loginAs(ADMIN);
    const created = good(await users.create(newUser)).data.user;
    const all = good(await activity.list({ pageSize: 500 })).data;
    expect(all[0]).toMatchObject({ action: "User created", module: "Users", reference: newUser.email, userName: "Rina Wulandari" });
    for (let i = 1; i < all.length; i++) expect(all[i - 1].createdAt >= all[i].createdAt).toBe(true);
    const byModule = good(await activity.list({ module: "Users", pageSize: 500 })).data;
    expect(byModule.length).toBeGreaterThan(0);
    expect(byModule.every((a) => a.module === "Users")).toBe(true);
    expect(good(await activity.modules()).data).toContain("Users");
    const mine = good(await activity.list({ userId: 1, pageSize: 500 })).data;
    expect(mine.every((a) => a.userId === 1)).toBe(true);
    expect(good(await activity.list({ from: "2999-01-01" })).meta!.total).toBe(0);
    expect(good(await activity.list({ search: created.email })).data.length).toBeGreaterThan(0);
  });
});

describe("backup", () => {
  it("lists newest first, creates a manual backup and keeps 14 files", async () => {
    await loginAs(ADMIN);
    const before = good(await backup.list({ pageSize: 500 }));
    expect(before.meta!.total).toBe(14);
    const made = good(await backup.create()).data;
    expect(made.kind).toBe("Manual");
    const after = good(await backup.list({ pageSize: 500 }));
    expect(after.meta!.total).toBe(14); // retention (PRD 4.13)
    expect(after.data[0].id).toBe(made.id);
    expect(good(await backup.list({ pageSize: 1 })).data).toHaveLength(1);
    expect(good(await backup.download(made.id)).data).toMatchObject({ fileName: made.fileName, stub: true });
    expect(await backup.download(99999)).toMatchObject({ success: false, status: 404 });
  });
});

describe("expenses", () => {
  it("totals posted incoming stock per month and rejects bad ranges", async () => {
    await loginAs(ADMIN);
    const from = "2000-01-01";
    const to = "2999-12-31";
    expect(await expenses.summary(to, from)).toMatchObject({ success: false, status: 422, error: { code: "VALIDATION_ERROR" } });
    expect(await expenses.summary(from, to)).toMatchObject({ success: false, error: { code: "VALIDATION_ERROR" } }); // longer than 12 months
    const ins = mock.db.transactions.filter((x) => x.type === "IN" && x.status === "Posted");
    expect(ins.length).toBeGreaterThan(0);
    const dates = ins.map((x) => x.date).sort();
    // The seed spans about 5 months, inside the 12-month limit.
    const sum = good(await expenses.summary(dates[0], dates[dates.length - 1])).data as ExpenseSummary;
    expect(sum.count).toBe(ins.length);
    expect(sum.total).toBe(ins.reduce((n, x) => n + x.lines.reduce((m, l) => m + (l.total ?? 0), 0), 0));
    expect(sum.months.reduce((n, m) => n + m.value, 0)).toBe(sum.total);
    expect(sum.months.reduce((n, m) => n + m.count, 0)).toBe(sum.count);
    const empty = good(await expenses.summary("2000-01-01", "2000-01-31")).data;
    expect(empty).toMatchObject({ total: 0, count: 0 });
  });
});

describe("reports", () => {
  it("pages, sorts and filters on the server", async () => {
    await loginAs(ADMIN);
    const stock = good(await reports.stock({ pageSize: 5, sort: "name:desc" }));
    expect(stock.data).toHaveLength(5);
    expect(stock.meta!.total).toBeGreaterThan(5);
    expect(stock.data[0].name.localeCompare(stock.data[4].name)).toBeGreaterThan(0);
    expect(good(await reports.stock({ stockStatus: "Out", pageSize: 500 })).data.every((i) => i.stockStatus === "Out")).toBe(true);

    const moves = good(await reports.movements({ pageSize: 10, sort: "date:desc" }));
    expect(moves.data).toHaveLength(10);
    expect(moves.data[0].date >= moves.data[9].date).toBe(true);
    const outs = good(await reports.movements({ type: "OUT", pageSize: 500 })).data;
    expect(outs.every((m) => m.type === "OUT")).toBe(true);

    const loans = good(await reports.loans({ pageSize: 500 })).data;
    expect(loans.length).toBeGreaterThan(0);
    const overdue = good(await reports.loans({ status: "Overdue", pageSize: 500 })).data;
    expect(overdue.every((l) => l.status === "Overdue")).toBe(true);
    expect(good(await reports.loans({ pageSize: 2, page: 2, sort: "number:asc" })).meta).toMatchObject({ page: 2, pageSize: 2 });
  });
});

describe("user type", () => {
  it("never carries password fields", async () => {
    await loginAs(ADMIN);
    const me: User = good(await get<User>("/auth/me")).data;
    expect(Object.keys(me).some((k) => /pass(?!.*change)/i.test(k) && k !== "mustChangePassword")).toBe(false);
  });
});
