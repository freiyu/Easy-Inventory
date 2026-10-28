// Pure domain rules (PRD 4.5, 4.6, 4.6A, 6.2, 6.4). No database access, so they are unit tested directly.
import { dayDiff, type LoanDisplayStatus, type LoanStatus, type PurchaseStatus, type Role, type StockStatus } from "../shared";

export type LoanAction = "edit" | "submit" | "cancel" | "approve" | "reject" | "issue" | "return";
export type PurchaseAction = "edit" | "submit" | "cancel" | "approve" | "reject" | "receive";
export interface Actor {
  id: number;
  role: Role;
}

/** BR-25: Safe > minimum, Low <= minimum and > 0, Out = 0. */
export function stockStatus(stock: number, minimum: number): StockStatus {
  if (stock <= 0) return "Out";
  if (stock <= minimum) return "Low";
  return "Safe";
}

/** BR-07: available for loan = current stock - quantity reserved by Approved loans, never below 0. */
export const availableForLoan = (stock: number, reserved: number) => Math.max(0, stock - reserved);

/** BR-12: Overdue is derived from Borrowed plus an expected return date before today. */
export function loanDisplayStatus(status: LoanStatus, expectedReturnDate: string, today: string): LoanDisplayStatus {
  return status === "Borrowed" && expectedReturnDate < today ? "Overdue" : status;
}

export const daysOverdue = (status: LoanStatus, expectedReturnDate: string, today: string) =>
  status === "Borrowed" ? Math.max(0, dayDiff(expectedReturnDate, today)) : 0;

/** BR-20: a return is not before the loan date; a loan issued early can be returned from its issue day. */
export function returnFloor(loanDate: string, issuedOn: string | null): string {
  return issuedOn && issuedOn < loanDate ? issuedOn : loanDate;
}

/** Merges duplicate item lines so limits are checked per item. */
export function totalsByItem(lines: { itemId: number; quantity: number }[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const l of lines) map.set(l.itemId, (map.get(l.itemId) ?? 0) + l.quantity);
  return map;
}

/**
 * PRD 3.2, 6.2: what this user may do with the loan now. The owner is the borrower (a loan an Admin
 * creates on behalf of a Staff member belongs to that Staff member). Nobody approves their own (BR-13).
 */
export function loanActions(loan: { status: LoanStatus; borrowerId: number }, actor: Actor): LoanAction[] {
  const own = loan.borrowerId === actor.id;
  const admin = actor.role === "Admin";
  const out: LoanAction[] = [];
  if (loan.status === "Draft" && own) out.push("edit", "submit", "cancel");
  if (loan.status === "Pending Approval") {
    if (own) out.push("cancel");
    if (admin && !own) out.push("approve", "reject");
  }
  if (loan.status === "Approved" && admin) out.push("cancel", "issue");
  if (loan.status === "Borrowed" && admin) out.push("return");
  return out;
}

/** PRD 3.2, 6.2A, BR-29: same ownership rule for purchase requests (the owner is the requester). */
export function purchaseActions(p: { status: PurchaseStatus; requesterId: number }, actor: Actor): PurchaseAction[] {
  const own = p.requesterId === actor.id;
  const admin = actor.role === "Admin";
  const out: PurchaseAction[] = [];
  if (p.status === "Draft" && own) out.push("edit", "submit", "cancel");
  if (p.status === "Pending Approval") {
    if (own) out.push("cancel");
    if (admin && !own) out.push("approve", "reject");
  }
  if (p.status === "Approved" && admin) out.push("cancel", "receive");
  return out;
}

/** BR-23: readable numbers such as IN-202610-0001; the counter is per prefix and month. */
export const sequenceKey = (prefix: string, date: string) => `${prefix}-${date.slice(0, 4)}${date.slice(5, 7)}`;
export const formatSequence = (key: string, n: number) => `${key}-${String(n).padStart(4, "0")}`;

/** BR-32: `<category code>-<number>`, 4 digits (more after 9999). */
export const itemCode = (categoryCode: string, n: number) => `${categoryCode}-${String(n).padStart(4, "0")}`;

/**
 * A free 3-letter code for a category or subcategory that a CSV import creates (BR-33): the first letter plus the next
 * two consonants ("Elektronik" -> ELK, "Ibadah" -> IBD), then other letters of the name, then any free code.
 * `taken` holds the codes already used, in upper case.
 */
export function suggestCode(name: string, taken: ReadonlySet<string>): string {
  const letters = name.normalize("NFD").toUpperCase().replace(/[^A-Z]/g, "");
  const free = (c: string) => c.length === 3 && !taken.has(c);
  if (letters) {
    const first = letters[0];
    const consonants = letters.slice(1).replace(/[AEIOU]/g, "");
    const rest = letters.slice(1);
    const tries = [first + consonants.slice(0, 2), letters.slice(0, 3)];
    for (let i = 0; i < rest.length; i++) for (let j = i + 1; j < rest.length; j++) tries.push(first + rest[i] + rest[j]);
    const hit = tries.find(free);
    if (hit) return hit;
  }
  const A = "A".charCodeAt(0);
  const firsts = letters ? [letters.charCodeAt(0) - A] : [];
  for (const a of [...firsts, ...Array.from({ length: 26 }, (_, i) => i)]) {
    for (let b = 0; b < 26; b++) for (let c = 0; c < 26; c++) {
      const code = String.fromCharCode(A + a, A + b, A + c);
      if (free(code)) return code;
    }
  }
  throw new Error("No free 3-letter code"); // 17,576 codes; a real office never gets here
}

/** "2026-01" .. "2026-03" -> ["2026-01", "2026-02", "2026-03"]. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

/** PRD 7.5: a cell starting with = + - @ is written as text so a spreadsheet never runs it as a formula. */
export const safeCell = (v: unknown) => (typeof v === "string" && /^[=+\-@]/.test(v) ? `'${v}` : v);
