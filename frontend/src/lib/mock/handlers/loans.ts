// Loan routes (PRD 6.6). Business rules are in ops.ts; this file shapes responses, filters lists,
// and works out allowedActions for the current user.
import type { LoanAction, LoanDto } from "../../api/loans";
import type { LoanInput, ReturnInput } from "../../schemas";
import { availableForLoan, daysOverdue, loanDisplayStatus, returnFloor } from "../rules";
import { t } from "../../strings";
import type { Loan, LoanDisplayStatus } from "../../types";
import {
  approveLoan, cancelLoan, createLoan, fail, issueLoan, ok, rejectLoan, returnLoan, submitLoan, updateLoanDraft, type Ctx,
} from "../ops";
import { filterValue, paged, searchRows } from "./list";
import type { H, Out, Route } from "./types";

const id = (h: H) => Number(h.params.id);
const isAdmin = (c: Ctx) => c.actor.role === "Admin";
const visible = (c: Ctx, l: Loan) => isAdmin(c) || l.borrowerId === c.actor.id;

function actions(c: Ctx, l: Loan): LoanAction[] {
  const own = l.borrowerId === c.actor.id;
  const admin = isAdmin(c);
  const out: LoanAction[] = [];
  if (l.status === "Draft" && (own || admin)) out.push("edit", "submit", "cancel");
  if (l.status === "Pending Approval") {
    if (own || admin) out.push("cancel");
    if (admin && !own) out.push("approve", "reject"); // BR: nobody approves their own request
  }
  if (l.status === "Approved" && admin) out.push("cancel", "issue");
  if (l.status === "Borrowed" && admin) out.push("return");
  return out;
}

export function loanDto(c: Ctx, l: Loan): LoanDto {
  const { db } = c;
  const name = (uid: number | null) => db.users.find((u) => u.id === uid)?.name ?? "-";
  const lines = l.lines.map((x) => {
    const item = db.items.find((i) => i.id === x.itemId);
    return {
      itemId: x.itemId,
      itemName: item?.name ?? "-",
      unit: item?.unit ?? "",
      quantity: x.quantity,
      ...(isAdmin(c) && item ? { currentStock: item.currentStock, availableForLoan: availableForLoan(item, db.loans) } : {}),
    };
  });
  return {
    ...l,
    lines,
    borrowerName: name(l.borrowerId),
    approvedByName: name(l.approvedBy),
    issuedByName: name(l.issuedBy),
    receivedByName: name(l.receivedBy),
    displayStatus: loanDisplayStatus(l),
    daysOverdue: daysOverdue(l),
    returnFloor: returnFloor(l),
    itemsSummary: lines.map((x) => `${x.itemName} x${x.quantity}`).join(", "),
    allowedActions: actions(c, l),
  };
}

// The status tabs: "Borrowed" includes overdue loans, "closed" is Rejected plus Cancelled.
const inTab = (s: LoanDisplayStatus, v: string) =>
  v === "closed" ? s === "Rejected" || s === "Cancelled" : v === "Borrowed" ? s === "Borrowed" || s === "Overdue" : s === v;

function list({ c, query }: H): Out {
  let rows = c.db.loans.filter((l) => visible(c, l)).map((l) => loanDto(c, l));
  const status = filterValue(query, "status");
  if (status) rows = rows.filter((l) => inTab(l.displayStatus, status));
  const borrower = filterValue(query, "borrowerId");
  if (isAdmin(c) && borrower) rows = rows.filter((l) => String(l.borrowerId) === borrower);
  const from = filterValue(query, "from");
  if (from) rows = rows.filter((l) => l.loanDate >= from);
  const to = filterValue(query, "to");
  if (to) rows = rows.filter((l) => l.loanDate <= to);
  rows = searchRows(rows, query, (l) => [l.number, l.borrowerName, l.purpose, ...l.lines.map((x) => x.itemName)]);
  return paged(rows, query, {
    number: (r) => r.number, borrower: (r) => r.borrowerName, loanDate: (r) => r.loanDate,
    expected: (r) => r.expectedReturnDate, status: (r) => r.displayStatus,
  }, "number:desc");
}

function one(h: H): Out {
  const l = h.c.db.loans.find((x) => x.id === id(h));
  return l && visible(h.c, l) ? ok(loanDto(h.c, l)) : fail("NOT_FOUND", t.errors.notFound);
}

const shape = (h: H, r: ReturnType<typeof createLoan>): Out => (r.ok ? ok(loanDto(h.c, r.data)) : r);
const form = (h: H) => {
  const { submit, ...v } = h.body as unknown as LoanInput & { submit?: boolean };
  return { v: v as LoanInput, submit: submit === true };
};

export const loanRoutes: Route[] = [
  { method: "GET", path: "/loans", run: list },
  { method: "GET", path: "/loans/:id", run: one },
  { method: "POST", path: "/loans", idempotent: true, run: (h) => { const f = form(h); return shape(h, createLoan(h.c, f.v, f.submit)); } },
  { method: "PUT", path: "/loans/:id", run: (h) => { const f = form(h); return shape(h, updateLoanDraft(h.c, id(h), f.v, f.submit)); } },
  { method: "POST", path: "/loans/:id/submit", run: (h) => shape(h, submitLoan(h.c, id(h))) },
  { method: "POST", path: "/loans/:id/cancel", run: (h) => shape(h, cancelLoan(h.c, id(h))) },
  { method: "POST", path: "/loans/:id/approve", admin: true, run: (h) => shape(h, approveLoan(h.c, id(h))) },
  { method: "POST", path: "/loans/:id/reject", admin: true, run: (h) => shape(h, rejectLoan(h.c, id(h), String(h.body.reason ?? ""))) },
  { method: "POST", path: "/loans/:id/issue", admin: true, run: (h) => shape(h, issueLoan(h.c, id(h))) },
  { method: "POST", path: "/loans/:id/return", admin: true, run: (h) => shape(h, returnLoan(h.c, id(h), h.body as unknown as ReturnInput)) },
];
