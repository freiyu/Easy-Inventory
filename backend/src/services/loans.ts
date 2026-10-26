// Loans (PRD 4.6, 6.2, BR-07 to BR-13, BR-19, BR-20, BR-24). Full return only.
// Who may do what is decided once, by loanActions (domain/rules.ts); every write checks it.
import type { Prisma } from "../db";
import { availableForLoan, daysOverdue, loanActions, loanDisplayStatus, returnFloor, totalsByItem, type LoanAction } from "../domain/rules";
import { fail, forbidden, notFound } from "../http";
import { filterId, filterValue, paged, searchRows, type Query } from "../list";
import type { LoanInput } from "../schemas";
import { dayDiff, t, type LoanDisplayStatus, type LoanStatus } from "../shared";
import {
  assertActive, iso, isAdmin, isoOrNull, localDay, lockItems, lockRow, log, nextNumber, once, postTransaction, reader, requestKey, reservedByItem,
  toDate, write, ymd, ymdOrNull, type Ctx, type SessionUser,
} from "./core";

const e = t.errors;
const name = { select: { name: true } } as const;
const loanInclude = {
  borrower: name, approvedBy: name, issuedBy: name, receivedBy: name,
  lines: { orderBy: { id: "asc" }, include: { item: { select: { name: true, unit: true, currentStock: true } } } },
} satisfies Prisma.LoanInclude;
type LoanRow = Prisma.LoanGetPayload<{ include: typeof loanInclude }>;

function loanDto(c: Ctx, l: LoanRow, reserved: Map<number, number>) {
  const status = l.status as LoanStatus;
  const expected = ymd(l.expectedReturnDate);
  const lines = l.lines.map((x) => ({
    itemId: x.itemId, itemName: x.item.name, unit: x.item.unit, quantity: x.quantity,
    // Admin only: stock on hand and what can still be lent (BR-07). Staff never get stock numbers.
    ...(isAdmin(c) ? { currentStock: x.item.currentStock, availableForLoan: availableForLoan(x.item.currentStock, reserved.get(x.itemId) ?? 0) } : {}),
  }));
  return {
    id: l.id, number: l.number, borrowerId: l.borrowerId, status, loanDate: ymd(l.loanDate), expectedReturnDate: expected,
    purpose: l.purpose, notes: l.notes, rejectReason: l.rejectReason,
    approvedBy: l.approvedById, approvedAt: isoOrNull(l.approvedAt), issuedBy: l.issuedById, issuedAt: isoOrNull(l.issuedAt),
    returnedAt: ymdOrNull(l.returnedAt), receivedBy: l.receivedById, returnNotes: l.returnNotes,
    createdAt: iso(l.createdAt), updatedAt: iso(l.updatedAt),
    borrowerName: l.borrower.name, approvedByName: l.approvedBy?.name ?? "-", issuedByName: l.issuedBy?.name ?? "-", receivedByName: l.receivedBy?.name ?? "-",
    displayStatus: loanDisplayStatus(status, expected, c.today), daysOverdue: daysOverdue(status, expected, c.today),
    returnFloor: returnFloor(ymd(l.loanDate), l.issuedAt ? localDay(l.issuedAt) : null),
    itemsSummary: lines.map((x) => `${x.itemName} x${x.quantity}`).join(", "),
    lines,
    allowedActions: loanActions({ status, borrowerId: l.borrowerId }, c.actor),
  };
}

/** Staff see only their own loans (PRD 3.2); anything else looks like it does not exist. */
const visibleWhere = (c: Ctx): Prisma.LoanWhereInput => (isAdmin(c) ? {} : { borrowerId: c.actor.id });

// The status tabs: "Borrowed" includes overdue loans, "closed" is Rejected plus Cancelled.
const inTab = (s: LoanDisplayStatus, v: string) =>
  v === "closed" ? s === "Rejected" || s === "Cancelled" : v === "Borrowed" ? s === "Borrowed" || s === "Overdue" : s === v;

export async function listLoans(c: Ctx, q: Query) {
  const where: Prisma.LoanWhereInput = visibleWhere(c);
  const borrowerId = filterId(q, "borrowerId");
  if (isAdmin(c) && borrowerId) where.borrowerId = borrowerId;
  const from = filterValue(q, "from"), to = filterValue(q, "to");
  if (from || to) where.loanDate = { gte: from ? toDate(from) : undefined, lte: to ? toDate(to) : undefined };
  const [loans, reserved] = await Promise.all([c.tx.loan.findMany({ where, include: loanInclude }), isAdmin(c) ? reservedByItem(c.tx) : new Map()]);
  let rows = loans.map((l) => loanDto(c, l, reserved));
  const status = filterValue(q, "status");
  if (status) rows = rows.filter((l) => inTab(l.displayStatus, status));
  rows = searchRows(rows, q, (l) => [l.number, l.borrowerName, l.purpose, ...l.lines.map((x) => x.itemName)]);
  return paged(rows, q, {
    number: (r) => r.number, borrower: (r) => r.borrowerName, loanDate: (r) => r.loanDate, expected: (r) => r.expectedReturnDate, status: (r) => r.displayStatus,
  }, "number:desc");
}

export async function oneLoan(c: Ctx, id: number) {
  const l = await c.tx.loan.findFirst({ where: { id, ...visibleWhere(c) }, include: loanInclude });
  if (!l) throw notFound();
  return loanDto(c, l, isAdmin(c) ? await reservedByItem(c.tx, l.lines.map((x) => x.itemId)) : new Map());
}

// ---------------------------------------------------------------------- checks

/** Borrower active, Staff only for themselves, items exist and are active (BR-24). */
async function checkBasics(c: Ctx, input: LoanInput) {
  const borrower = await c.tx.user.findUnique({ where: { id: input.borrowerId } });
  if (!borrower || borrower.status !== "Active") throw fail("VALIDATION_ERROR", e.fix, { borrowerId: t.validation.selectBorrower });
  if (!isAdmin(c) && borrower.id !== c.actor.id) throw forbidden();
  const items = await c.tx.item.findMany({ where: { id: { in: input.lines.map((l) => l.itemId) } } });
  if (items.length !== new Set(input.lines.map((l) => l.itemId)).size) throw notFound();
  assertActive(items);
}

/** BR-08: quantity <= available for loan, re-checked under the item locks inside the transaction. */
async function checkAvailable(c: Ctx, lines: { itemId: number; quantity: number }[], excludeLoanId?: number) {
  const items = await lockItems(c.tx, lines.map((l) => l.itemId));
  assertActive(items.values());
  const reserved = await reservedByItem(c.tx, [...items.keys()], excludeLoanId);
  for (const [itemId, qty] of totalsByItem(lines)) {
    const avail = availableForLoan(items.get(itemId)!.currentStock, reserved.get(itemId) ?? 0);
    if (qty > avail) {
      const msg = e.insufficient(avail);
      throw fail("INSUFFICIENT_STOCK", msg, { [`lines.${lines.findIndex((l) => l.itemId === itemId)}.quantity`]: msg });
    }
  }
}

const VERB: Record<LoanAction, [string, LoanStatus]> = {
  edit: ["edited", "Draft"], submit: ["submitted", "Draft"], cancel: ["cancelled", "Pending Approval"], approve: ["approved", "Pending Approval"],
  reject: ["rejected", "Pending Approval"], issue: ["issued", "Approved"], return: ["returned", "Borrowed"],
};

/** Locks the loan, loads it (only if this user may see it) and checks that the action is allowed now. */
async function load(c: Ctx, id: number, action: LoanAction) {
  await lockRow(c.tx, "loans", id);
  const loan = await c.tx.loan.findFirst({ where: { id, ...visibleWhere(c) }, include: { lines: true } });
  if (!loan) throw notFound();
  const status = loan.status as LoanStatus;
  if (!loanActions({ status, borrowerId: loan.borrowerId }, c.actor).includes(action)) {
    if ((action === "approve" || action === "reject") && loan.borrowerId === c.actor.id) throw fail("BUSINESS_RULE_VIOLATION", e.selfApprove);
    if (action === "cancel" && status === "Borrowed") throw fail("BUSINESS_RULE_VIOLATION", e.cancelBorrowed);
    const [verb, need] = VERB[action];
    const stateOk = action === "cancel" ? ["Draft", "Pending Approval", "Approved"].includes(status) : status === need;
    throw stateOk ? forbidden() : fail("BUSINESS_RULE_VIOLATION", e.loanState(verb, need));
  }
  return loan;
}

// ---------------------------------------------------------------------- writes

const lineData = (input: LoanInput) => input.lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity }));

export function createLoan(actor: SessionUser, input: LoanInput) {
  const find = async (k: string) => {
    const l = await reader(actor).tx.loan.findUnique({ where: { clientRequestId: requestKey(actor, k)! }, select: { id: true } });
    return l?.id ?? null;
  };
  const create = () => write(actor, async (c) => {
    await checkBasics(c, input);
    if (input.submit) await checkAvailable(c, input.lines);
    const loan = await c.tx.loan.create({
      data: {
        number: await nextNumber(c.tx, "LN", c.today), borrowerId: input.borrowerId, status: input.submit ? "Pending Approval" : "Draft",
        loanDate: toDate(input.loanDate), expectedReturnDate: toDate(input.expectedReturnDate), purpose: input.purpose, notes: input.notes,
        rejectReason: "", returnNotes: "", clientRequestId: requestKey(actor, input.clientRequestId), lines: { create: lineData(input) },
      },
    });
    await log(c, input.submit ? "Loan submitted" : "Loan draft saved", "Loans", loan.number);
    return loan.id;
  });
  return once(input.clientRequestId, find, create).then((id) => oneLoan(reader(actor), id));
}

export function updateLoanDraft(actor: SessionUser, id: number, input: LoanInput) {
  return write(actor, async (c) => {
    const loan = await load(c, id, "edit");
    await checkBasics(c, input);
    if (input.submit) await checkAvailable(c, input.lines);
    await c.tx.loanItem.deleteMany({ where: { loanId: id } });
    await c.tx.loan.update({
      where: { id },
      data: {
        borrowerId: input.borrowerId, loanDate: toDate(input.loanDate), expectedReturnDate: toDate(input.expectedReturnDate),
        purpose: input.purpose, notes: input.notes, status: input.submit ? "Pending Approval" : "Draft", lines: { create: lineData(input) },
      },
    });
    await log(c, input.submit ? "Loan submitted" : "Loan draft saved", "Loans", loan.number);
    return oneLoan(c, id);
  });
}

export function submitLoan(actor: SessionUser, id: number) {
  return write(actor, async (c) => {
    const loan = await load(c, id, "submit");
    await checkAvailable(c, loan.lines);
    await c.tx.loan.update({ where: { id }, data: { status: "Pending Approval" } });
    await log(c, "Loan submitted", "Loans", loan.number);
    return oneLoan(c, id);
  });
}

/** Cancelling an Approved loan releases its reservation, because reservations are computed (PRD 6.1). */
export function cancelLoan(actor: SessionUser, id: number) {
  return write(actor, async (c) => {
    const loan = await load(c, id, "cancel");
    await c.tx.loan.update({ where: { id }, data: { status: "Cancelled" } });
    await log(c, "Loan cancelled", "Loans", loan.number);
    return oneLoan(c, id);
  });
}

/** BR-13: never your own. Approval reserves the quantities (PRD 4.6); stock changes at issue (BR-09). */
export function approveLoan(actor: SessionUser, id: number) {
  return write(actor, async (c) => {
    const loan = await load(c, id, "approve");
    await checkAvailable(c, loan.lines, loan.id);
    await c.tx.loan.update({ where: { id }, data: { status: "Approved", approvedById: actor.id, approvedAt: c.now } });
    await log(c, "Loan approved", "Loans", loan.number);
    return oneLoan(c, id);
  });
}

export function rejectLoan(actor: SessionUser, id: number, reason: string) {
  return write(actor, async (c) => {
    const loan = await load(c, id, "reject");
    await c.tx.loan.update({ where: { id }, data: { status: "Rejected", rejectReason: reason, approvedById: actor.id, approvedAt: c.now } });
    await log(c, "Loan rejected", "Loans", loan.number, reason);
    return oneLoan(c, id);
  });
}

/** BR-08, BR-09: stock decreases at issue, checked against current stock inside the transaction. */
export function issueLoan(actor: SessionUser, id: number) {
  return write(actor, async (c) => {
    const loan = await load(c, id, "issue");
    assertActive((await lockItems(c.tx, loan.lines.map((l) => l.itemId))).values());
    await postTransaction(c, {
      type: "LOAN_ISSUE", date: c.today, loanId: loan.id, notes: loan.number,
      lines: loan.lines.map((l) => ({ itemId: l.itemId, change: -l.quantity })),
    });
    await c.tx.loan.update({ where: { id }, data: { status: "Borrowed", issuedById: actor.id, issuedAt: c.now } });
    await log(c, "Loan issued", "Loans", loan.number);
    return oneLoan(c, id);
  });
}

/** BR-10, BR-11, BR-20: full return in one transaction; the loan is then Completed. */
export function returnLoan(actor: SessionUser, id: number, input: { returnDate: string; notes: string }) {
  return write(actor, async (c) => {
    const loan = await load(c, id, "return");
    if (input.returnDate < returnFloor(ymd(loan.loanDate), loan.issuedAt ? localDay(loan.issuedAt) : null)) {
      throw fail("VALIDATION_ERROR", e.fix, { returnDate: t.validation.returnBeforeLoan });
    }
    if (dayDiff(c.today, input.returnDate) > 0) throw fail("VALIDATION_ERROR", e.fix, { returnDate: t.validation.returnInFuture });
    await postTransaction(c, {
      type: "LOAN_RETURN", date: input.returnDate, loanId: loan.id, notes: loan.number,
      lines: loan.lines.map((l) => ({ itemId: l.itemId, change: l.quantity })),
    });
    await c.tx.loan.update({ where: { id }, data: { status: "Completed", returnedAt: toDate(input.returnDate), receivedById: actor.id, returnNotes: input.notes } });
    await log(c, "Loan returned", "Loans", loan.number);
    return oneLoan(c, id);
  });
}
