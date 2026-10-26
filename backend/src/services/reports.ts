// Dashboard, expense summary, the three reports and the Excel exports (PRD 4.1, 4.7 to 4.9, 7.5).
import XLSX from "xlsx";
import { daysOverdue, loanDisplayStatus, monthsBetween, safeCell, stockStatus } from "../domain/rules";
import { fail } from "../http";
import { filterId, filterValue, MAX_PAGE_SIZE, paged, searchRows, type Query } from "../list";
import { monthKey, t, type LoanStatus } from "../shared";
import { isAdmin, log, num, reservedByItem, toDate, ymd, ymdOrNull, type Ctx } from "./core";
import { itemRows, listItems } from "./master";
import { ledger } from "./stock";

const STOCK_ORDER = { Out: 0, Low: 1, Safe: 2 };
const briefInclude = { lines: { orderBy: { id: "asc" }, include: { item: { select: { name: true } } } } } as const;
type BriefRow = { id: number; number: string; status: string; expectedReturnDate: Date; lines: { quantity: number; item: { name: string } }[] };

const loanBrief = (c: Ctx, l: BriefRow) => {
  const expected = ymd(l.expectedReturnDate);
  const status = l.status as LoanStatus;
  return {
    id: l.id, number: l.number, summary: l.lines.map((x) => `${x.item.name} x${x.quantity}`).join(", "), expectedReturnDate: expected,
    status: loanDisplayStatus(status, expected, c.today), daysOverdue: daysOverdue(status, expected, c.today),
  };
};

// ---------------------------------------------------------------- dashboard

export async function dashboardSummary(c: Ctx) {
  const today = toDate(c.today);
  const overdueWhere = { status: "Borrowed", expectedReturnDate: { lt: today } };
  if (!isAdmin(c)) {
    // Staff: own loans and how many items can be requested; no stock numbers, no money (PRD 3.2).
    const [mine, items, reserved] = await Promise.all([
      c.tx.loan.findMany({ where: { borrowerId: c.actor.id, status: { in: ["Pending Approval", "Approved", "Borrowed"] } }, include: briefInclude, orderBy: { id: "desc" } }),
      c.tx.item.findMany({ where: { status: "Active" }, select: { id: true, currentStock: true } }),
      reservedByItem(c.tx),
    ]);
    const active = mine.map((l) => loanBrief(c, l));
    const overdue = active.filter((l) => l.status === "Overdue");
    return {
      staff: {
        activeLoans: active, overdueCount: overdue.length, overdueFirst: overdue[0] ?? null,
        requestable: items.filter((i) => i.currentStock - (reserved.get(i.id) ?? 0) > 0).length, activeItems: items.length,
      },
    };
  }
  const [items, statusCounts, overdueLoans, purchasesPending, loansPendingForMe] = await Promise.all([
    c.tx.item.findMany({ where: { status: "Active" }, select: { id: true, name: true, currentStock: true, minimumStock: true, category: { select: { name: true } } } }),
    c.tx.loan.groupBy({ by: ["status"], where: { status: { in: ["Pending Approval", "Approved", "Borrowed"] } }, _count: true }),
    c.tx.loan.findMany({ where: overdueWhere, include: briefInclude, orderBy: { expectedReturnDate: "asc" } }),
    c.tx.purchaseRequest.count({ where: { status: "Pending Approval", requesterId: { not: c.actor.id } } }),
    c.tx.loan.count({ where: { status: "Pending Approval", borrowerId: { not: c.actor.id } } }),
  ]);
  const stock = { Safe: 0, Low: 0, Out: 0 };
  for (const i of items) stock[stockStatus(i.currentStock, i.minimumStock)]++;
  const count = (s: string) => statusCounts.find((r) => r.status === s)?._count ?? 0;
  const loans = { pending: count("Pending Approval"), approved: count("Approved"), borrowed: count("Borrowed"), overdue: overdueLoans.length, active: 0 };
  loans.active = loans.pending + loans.approved + loans.borrowed;
  return {
    badges: { items: stock.Low + stock.Out, loans: overdueLoans.length, purchases: purchasesPending },
    admin: {
      pendingApprovals: loansPendingForMe + purchasesPending,
      stock, attention: stock.Low + stock.Out, loans,
      needsAttention: items
        .filter((i) => stockStatus(i.currentStock, i.minimumStock) !== "Safe")
        .sort((a, b) => a.currentStock - b.currentStock)
        .slice(0, 6)
        .map((i) => ({ id: i.id, name: i.name, categoryName: i.category.name, currentStock: i.currentStock, minimumStock: i.minimumStock, stockStatus: stockStatus(i.currentStock, i.minimumStock) })),
      overdueLoans: overdueLoans.map((l) => loanBrief(c, l)),
    },
  };
}

// ----------------------------------------------------------------- expenses

/** PRD 4.7: line totals of posted (not voided) IN transactions in the period, at most 12 months. */
export async function expenseSummary(c: Ctx, q: Query) {
  const from = filterValue(q, "from"), to = filterValue(q, "to");
  const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (!isDate(from) || !isDate(to)) {
    throw fail("VALIDATION_ERROR", t.errors.fix, { from: t.validation.required(t.common.from), to: t.validation.required(t.common.to) });
  }
  if (to! < from!) throw fail("VALIDATION_ERROR", t.expenses.rangeInvalid, { to: t.expenses.rangeInvalid });
  const keys = monthsBetween(monthKey(from!), monthKey(to!));
  if (keys.length > 12) throw fail("VALIDATION_ERROR", t.expenses.rangeTooLong, { to: t.expenses.rangeTooLong });
  const ins = await c.tx.stockTransaction.findMany({
    where: { type: "IN", status: "Posted", date: { gte: toDate(from!), lte: toDate(to!) } },
    select: { date: true, lines: { select: { total: true } } },
  });
  const months = keys.map((k) => {
    const inMonth = ins.filter((x) => monthKey(ymd(x.date)) === k);
    return { month: k, count: inMonth.length, value: inMonth.reduce((n, x) => n + x.lines.reduce((m, l) => m + (num(l.total) ?? 0), 0), 0) };
  });
  return { total: months.reduce((n, r) => n + r.value, 0), count: ins.length, months };
}

// ------------------------------------------------------------------ reports

export async function stockReport(c: Ctx, q: Query) {
  const categoryId = filterId(q, "categoryId");
  let rows = await itemRows(c.tx, { status: "Active", ...(categoryId ? { categoryId } : {}) }, true);
  const status = filterValue(q, "stockStatus");
  if (status) rows = rows.filter((i) => i.stockStatus === status);
  rows = searchRows(rows, q, (i) => [i.name, i.code]);
  return paged(rows, q, {
    code: (r) => r.code ?? "", name: (r) => r.name, category: (r) => r.categoryName, unit: (r) => r.unit,
    stock: (r) => r.currentStock ?? 0, minimum: (r) => r.minimumStock ?? 0, status: (r) => STOCK_ORDER[r.stockStatus],
  }, "code:asc");
}

export const movementsReport = (c: Ctx, q: Query) => ledger(c, q, { report: true });

export async function loansReport(c: Ctx, q: Query) {
  const from = filterValue(q, "from"), to = filterValue(q, "to");
  const loans = await c.tx.loan.findMany({
    where: from || to ? { loanDate: { gte: from ? toDate(from) : undefined, lte: to ? toDate(to) : undefined } } : {},
    include: { borrower: { select: { name: true } }, ...briefInclude },
  });
  let rows = loans.map((l) => ({
    id: l.id, number: l.number, borrowerName: l.borrower.name, summary: l.lines.map((x) => `${x.item.name} x${x.quantity}`).join(", "),
    loanDate: ymd(l.loanDate), expectedReturnDate: ymd(l.expectedReturnDate), returnedAt: ymdOrNull(l.returnedAt),
    status: loanDisplayStatus(l.status as LoanStatus, ymd(l.expectedReturnDate), c.today),
  }));
  const status = filterValue(q, "status");
  if (status) rows = rows.filter((r) => r.status === status);
  rows = searchRows(rows, q, (r) => [r.number, r.borrowerName, r.summary]);
  return paged(rows, q, {
    number: (r) => r.number, borrower: (r) => r.borrowerName, loanDate: (r) => r.loanDate,
    expected: (r) => r.expectedReturnDate, returned: (r) => r.returnedAt ?? "", status: (r) => r.status,
  }, "number:desc");
}

// --------------------------------------------------------------- Excel export

/** Collects every page of a list with the same filters and sort (PRD 7.5: exports respect the active filters). */
async function allRows<T>(list: (q: Query) => Promise<{ rows: T[]; meta: { total: number } }>, q: Query): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; ; page++) {
    const r = await list({ ...q, page, pageSize: MAX_PAGE_SIZE });
    out.push(...r.rows);
    if (r.rows.length < MAX_PAGE_SIZE || out.length >= r.meta.total) return out;
  }
}

/** PRD 4.9: dates are real date cells, not text. "YYYY-MM-DD" is a calendar day, so it is kept as UTC midnight. */
const day = (s: string | null) => (s ? new Date(`${s}T00:00:00Z`) : "");

function workbook(sheet: string, header: string[], rows: unknown[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows.map((r) => r.map(safeCell))], { cellDates: true, UTC: true, dateNF: "yyyy-mm-dd" });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheet.slice(0, 31));
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

const ic = t.items, rc = t.reports;

/** PRD 4.12: every export is logged. */
const logExport = (c: Ctx, what: string) => log(c, "Excel exported", "Reports", what);

export async function exportItems(c: Ctx, q: Query) {
  const rows = await allRows((p) => listItems(c, p), q);
  await logExport(c, "items");
  return workbook(t.nav.items, [ic.colCode, ic.colName, ic.colCategory, ic.colUnit, ic.colStock, ic.colMinimum, ic.stockStatusFilter, t.fields.lastPrice, ic.colSupplier, ic.colLocation, t.fields.status],
    rows.map((r) => [
      r.code, r.name, r.categoryName, r.unit, r.currentStock, r.minimumStock, r.stockStatus, r.lastPurchasePrice,
      r.supplierId ? r.supplierName : "", r.location, r.status,
    ]));
}

export async function exportReport(c: Ctx, type: string, q: Query) {
  if (["stock", "movements", "loans"].includes(type)) await logExport(c, `report ${type}`);
  if (type === "stock") {
    const rows = await allRows((p) => stockReport(c, p), q);
    return workbook(rc.stockCaption, [rc.colCode, rc.colItem, rc.colCategory, rc.colUnit, rc.colStock, rc.colMinimum, rc.colStatus],
      rows.map((r) => [r.code, r.name, r.categoryName, r.unit, r.currentStock, r.minimumStock, r.stockStatus]));
  }
  if (type === "movements") {
    const rows = await allRows((p) => movementsReport(c, p), q);
    return workbook(rc.movementsCaption, [rc.colDate, rc.colItem, rc.colType, rc.colChange, rc.colBalance, rc.colUser, rc.colRef],
      rows.map((r) => [day(r.date), r.itemName, r.type, r.quantityChange, r.balanceAfter, r.userName, r.number]));
  }
  if (type === "loans") {
    const rows = await allRows((p) => loansReport(c, p), q);
    return workbook(rc.loansCaption, [rc.colLoan, rc.colBorrower, rc.colItem, rc.colLoanDate, rc.colExpected, rc.colReturned, rc.colStatus],
      rows.map((r) => [r.number, r.borrowerName, r.summary, day(r.loanDate), day(r.expectedReturnDate), day(r.returnedAt), r.status]));
  }
  throw fail("NOT_FOUND", t.errors.notFound);
}
