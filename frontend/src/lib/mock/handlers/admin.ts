// Dashboard, expenses, reports, users, activity log and backup routes (PRD 4.1, 4.7 to 4.12, 6.6).
import type {
  ActivityRow, AdminDashboard, DashboardSummary, ExpenseSummary, LoanBrief, LoanReportRow, MovementRow, StaffDashboard,
} from "../../api/admin";
import { monthKey } from "../../format";
import { lineSummary, loanCounts, stockCounts } from "../queries";
import { availableForLoan, daysOverdue, loanDisplayStatus, stockStatus } from "../rules";
import { t } from "../../strings";
import type { Loan } from "../../types";
import {
  createBackup, createUser, fail, ok, resetUserPassword, setUserStatus, updateUser, type Ctx, type DB,
} from "../ops";
import { mock } from "../state";
import { filterValue, paged, searchRows } from "./list";
import { itemDto } from "./master";
import type { H, Out, Route } from "./types";

const id = (h: H) => Number(h.params.id);
const userName = (db: DB, userId: number | null) => db.users.find((u) => u.id === userId)?.name ?? null;
const STOCK_ORDER = { Out: 0, Low: 1, Safe: 2 };
const pad = (n: number) => String(n).padStart(8, "0");
const inRange = (date: string, q: H["query"]) => {
  const from = filterValue(q, "from");
  const to = filterValue(q, "to");
  return (!from || date >= from) && (!to || date <= to);
};

// ---------------------------------------------------------------- dashboard

const loanBrief = (db: DB, l: Loan): LoanBrief => ({
  id: l.id,
  number: l.number,
  summary: lineSummary(db, l),
  expectedReturnDate: l.expectedReturnDate,
  status: loanDisplayStatus(l),
  daysOverdue: daysOverdue(l),
});

function adminDashboard({ db, actor }: Ctx): AdminDashboard {
  const stock = stockCounts(db);
  const active = db.items.filter((i) => i.status === "Active");
  return {
    pendingApprovals:
      db.loans.filter((l) => l.status === "Pending Approval").length +
      db.purchaseRequests.filter((p) => p.status === "Pending Approval" && p.requesterId !== actor.id).length,
    stock: { Safe: stock.Safe, Low: stock.Low, Out: stock.Out },
    attention: stock.attention,
    loans: loanCounts(db),
    needsAttention: active
      .filter((i) => stockStatus(i.currentStock, i.minimumStock) !== "Safe")
      .sort((a, b) => a.currentStock - b.currentStock)
      .slice(0, 6)
      .map((i) => ({
        id: i.id, name: i.name, categoryName: db.categories.find((c) => c.id === i.categoryId)?.name ?? "-",
        currentStock: i.currentStock, minimumStock: i.minimumStock, stockStatus: stockStatus(i.currentStock, i.minimumStock),
      })),
    overdueLoans: db.loans.filter((l) => loanDisplayStatus(l) === "Overdue").map((l) => loanBrief(db, l)),
  };
}

function staffDashboard({ db, actor }: Ctx): StaffDashboard {
  const mine = db.loans.filter((l) => l.borrowerId === actor.id);
  const overdue = mine.filter((l) => loanDisplayStatus(l) === "Overdue");
  const active = db.items.filter((i) => i.status === "Active");
  return {
    activeLoans: mine.filter((l) => ["Pending Approval", "Approved", "Borrowed"].includes(l.status)).map((l) => loanBrief(db, l)),
    overdueCount: overdue.length,
    overdueFirst: overdue[0] ? loanBrief(db, overdue[0]) : null,
    requestable: active.filter((i) => availableForLoan(i, db.loans) > 0).length,
    activeItems: active.length,
  };
}

function dashboardSummary({ c }: H): Out {
  const { db, actor } = c;
  const data: DashboardSummary =
    actor.role === "Admin"
      ? {
          badges: {
            items: db.items.filter((i) => i.status === "Active" && stockStatus(i.currentStock, i.minimumStock) !== "Safe").length,
            loans: db.loans.filter((l) => loanDisplayStatus(l) === "Overdue").length,
            purchases: db.purchaseRequests.filter((p) => p.status === "Pending Approval" && p.requesterId !== actor.id).length,
          },
          admin: adminDashboard(c),
        }
      : { staff: staffDashboard(c) };
  return ok(data);
}

// ----------------------------------------------------------------- expenses

const monthsBetween = (from: string, to: string): string[] => {
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    if (++m > 12) { m = 1; y++; }
  }
  return out;
};

/** PRD 4.7: sum of line totals of posted (not voided) IN transactions in the period, at most 12 months. */
function expenseSummary({ c, query }: H): Out {
  const from = filterValue(query, "from");
  const to = filterValue(query, "to");
  if (!from || !to) return fail("VALIDATION_ERROR", t.errors.fix, { from: t.validation.required(t.common.from), to: t.validation.required(t.common.to) });
  if (to < from) return fail("VALIDATION_ERROR", t.expenses.rangeInvalid, { to: t.expenses.rangeInvalid });
  const keys = monthsBetween(monthKey(from), monthKey(to));
  if (keys.length > 12) return fail("VALIDATION_ERROR", t.expenses.rangeTooLong, { to: t.expenses.rangeTooLong });
  const ins = c.db.transactions.filter((x) => x.type === "IN" && x.status === "Posted" && x.date >= from && x.date <= to);
  const months = keys.map((k) => {
    const inMonth = ins.filter((x) => monthKey(x.date) === k);
    return { month: k, count: inMonth.length, value: inMonth.reduce((n, x) => n + x.lines.reduce((m, l) => m + (l.total ?? 0), 0), 0) };
  });
  const data: ExpenseSummary = { total: months.reduce((n, r) => n + r.value, 0), count: ins.length, months };
  return ok(data);
}

// ------------------------------------------------------------------ reports

function stockReport(h: H): Out {
  const { c, query } = h;
  let rows = c.db.items.filter((i) => i.status === "Active");
  const category = filterValue(query, "categoryId");
  if (category) rows = rows.filter((i) => String(i.categoryId) === category);
  const status = filterValue(query, "stockStatus");
  if (status) rows = rows.filter((i) => stockStatus(i.currentStock, i.minimumStock) === status);
  rows = searchRows(rows, query, (i) => [i.name, i.code]);
  return paged(rows.map((i) => itemDto(c, i)), query, {
    code: (r) => r.code ?? "", name: (r) => r.name, category: (r) => r.categoryName, unit: (r) => r.unit,
    stock: (r) => r.currentStock ?? 0, minimum: (r) => r.minimumStock ?? 0, status: (r) => STOCK_ORDER[r.stockStatus],
  }, "code:asc");
}

function movementsReport({ c, query }: H): Out {
  const { db } = c;
  const type = filterValue(query, "type");
  let rows: (MovementRow & { sortKey: string })[] = db.transactions
    .filter((tx) => (!type || tx.type === type) && inRange(tx.date, query))
    .flatMap((tx) => tx.lines.map((l) => ({
      key: `${tx.id}-${l.itemId}`, txId: tx.id, number: tx.number, date: tx.date,
      itemName: db.items.find((i) => i.id === l.itemId)?.name ?? "-", type: tx.type,
      quantityChange: l.quantityChange, balanceAfter: l.balanceAfter, userName: userName(db, tx.userId) ?? "-",
      sortKey: `${tx.date}${pad(tx.id)}`,
    })));
  rows = searchRows(rows, query, (r) => [r.itemName, r.number, r.userName]);
  return paged(rows, query, {
    date: (r) => r.sortKey, item: (r) => r.itemName, type: (r) => r.type, change: (r) => r.quantityChange,
    balance: (r) => r.balanceAfter, user: (r) => r.userName, ref: (r) => r.number,
  }, "date:desc");
}

function loansReport({ c, query }: H): Out {
  const { db } = c;
  const status = filterValue(query, "status");
  let rows: LoanReportRow[] = db.loans
    .filter((l) => (!status || loanDisplayStatus(l) === status) && inRange(l.loanDate, query))
    .map((l) => ({
      id: l.id, number: l.number, borrowerName: userName(db, l.borrowerId) ?? "-", summary: lineSummary(db, l),
      loanDate: l.loanDate, expectedReturnDate: l.expectedReturnDate, returnedAt: l.returnedAt, status: loanDisplayStatus(l),
    }));
  rows = searchRows(rows, query, (r) => [r.number, r.borrowerName, r.summary]);
  return paged(rows, query, {
    number: (r) => r.number, borrower: (r) => r.borrowerName, loanDate: (r) => r.loanDate,
    expected: (r) => r.expectedReturnDate, returned: (r) => r.returnedAt ?? "", status: (r) => r.status,
  }, "number:desc");
}

// -------------------------------------------------------------------- users

function listUsers({ c, query }: H): Out {
  let rows = c.db.users;
  const role = filterValue(query, "role");
  if (role) rows = rows.filter((u) => u.role === role);
  const status = filterValue(query, "status");
  if (status) rows = rows.filter((u) => u.status === status);
  rows = searchRows(rows, query, (u) => [u.name, u.email]);
  return paged(rows, query, {
    name: (u) => u.name, email: (u) => u.email, role: (u) => u.role, status: (u) => u.status, last: (u) => u.lastLoginAt ?? "",
  }, "name:asc");
}

const userInput = (h: H) => h.body as unknown as Parameters<typeof updateUser>[2];

// ------------------------------------------------------------- activity log

function listActivity({ c, query }: H): Out {
  const { db } = c;
  const moduleName = filterValue(query, "module");
  const userId = filterValue(query, "userId");
  let rows: ActivityRow[] = db.activity
    .filter((a) => (!moduleName || a.module === moduleName) && (!userId || String(a.userId) === userId) && inRange(a.createdAt.slice(0, 10), query))
    .map((a) => ({ ...a, userName: userName(db, a.userId) }));
  rows = searchRows(rows, query, (a) => [a.action, a.reference, a.metadata, a.userName]);
  return paged(rows, query, {
    time: (a) => `${a.createdAt}${pad(a.id)}`, user: (a) => a.userName ?? "", action: (a) => a.action, module: (a) => a.module,
  }, "time:desc");
}

// ------------------------------------------------------------------- backup

const downloadBackup = (h: H): Out => {
  const file = h.c.db.backups.find((b) => b.id === id(h));
  return file ? ok({ fileName: file.fileName, stub: true }) : fail("NOT_FOUND", t.errors.notFound);
};

export const adminRoutes: Route[] = [
  { method: "GET", path: "/dashboard/summary", run: dashboardSummary },
  { method: "GET", path: "/expenses/summary", admin: true, run: expenseSummary },
  { method: "GET", path: "/reports/stock", admin: true, run: stockReport },
  { method: "GET", path: "/reports/movements", admin: true, run: movementsReport },
  { method: "GET", path: "/reports/loans", admin: true, run: loansReport },

  { method: "GET", path: "/users", admin: true, run: listUsers },
  { method: "GET", path: "/users/:id", admin: true, run: (h) => { const u = h.c.db.users.find((x) => x.id === id(h)); return u ? ok(u) : fail("NOT_FOUND", t.errors.notFound); } },
  {
    method: "POST", path: "/users", admin: true,
    run: (h) => {
      const r = createUser(h.c, userInput(h));
      if (r.ok) mock.passwords.set(r.data.user.id, r.data.tempPassword); // so the new user can sign in with it
      return r;
    },
  },
  { method: "PUT", path: "/users/:id", admin: true, run: (h) => updateUser(h.c, id(h), userInput(h)) },
  { method: "POST", path: "/users/:id/deactivate", admin: true, run: (h) => setUserStatus(h.c, id(h), "Inactive") },
  { method: "POST", path: "/users/:id/activate", admin: true, run: (h) => setUserStatus(h.c, id(h), "Active") },
  {
    method: "POST", path: "/users/:id/reset-password", admin: true,
    run: (h) => {
      const r = resetUserPassword(h.c, id(h));
      if (r.ok) mock.passwords.set(id(h), r.data.tempPassword);
      return r;
    },
  },

  { method: "GET", path: "/activity-log/modules", admin: true, run: ({ c }) => ok([...new Set(c.db.activity.map((a) => a.module))].sort()) },
  { method: "GET", path: "/activity-log", admin: true, run: listActivity },

  {
    method: "GET", path: "/backup/database", admin: true,
    run: ({ c, query }) => paged(c.db.backups, query, {
      file: (b) => b.fileName, created: (b) => b.createdAt, kind: (b) => b.kind, size: (b) => b.sizeKb,
    }, "created:desc"),
  },
  { method: "POST", path: "/backup/database", admin: true, run: ({ c }) => createBackup(c) },
  { method: "GET", path: "/backup/database/:id/download", admin: true, run: downloadBackup },
];

