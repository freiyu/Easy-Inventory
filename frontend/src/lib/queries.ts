// Small read helpers over the prototype DB. Pages call these instead of repeating lookups.
import { loanDisplayStatus, stockStatus } from "./rules";
import type { DB } from "./mock/ops";
import type { Category, Item, Loan, StockTransaction, Supplier, User } from "./types";

export const byId = <T extends { id: number }>(list: T[], id: number | null | undefined): T | undefined =>
  id == null ? undefined : list.find((x) => x.id === id);

export const categoryName = (db: DB, id: number) => byId<Category>(db.categories, id)?.name ?? "-";
export const supplierName = (db: DB, id: number | null) => byId<Supplier>(db.suppliers, id)?.name ?? "-";
export const userName = (db: DB, id: number | null) => byId<User>(db.users, id)?.name ?? "-";
export const itemName = (db: DB, id: number) => byId<Item>(db.items, id)?.name ?? "-";

export function stockCounts(db: DB) {
  const counts = { Safe: 0, Low: 0, Out: 0 };
  for (const i of db.items) if (i.status === "Active") counts[stockStatus(i.currentStock, i.minimumStock)]++;
  return { ...counts, attention: counts.Low + counts.Out };
}

export function loanCounts(db: DB) {
  let pending = 0, approved = 0, borrowed = 0, overdue = 0;
  for (const l of db.loans) {
    const s = loanDisplayStatus(l);
    if (s === "Pending Approval") pending++;
    else if (s === "Approved") approved++;
    else if (s === "Borrowed") borrowed++;
    else if (s === "Overdue") { borrowed++; overdue++; }
  }
  return { pending, approved, borrowed, overdue, active: pending + approved + borrowed };
}

/** Staff only see their own loans (PRD 3.2); Admin sees all. */
export const visibleLoans = (db: DB, user: User): Loan[] =>
  user.role === "Admin" ? db.loans : db.loans.filter((l) => l.borrowerId === user.id);

export const loanSummary = (db: DB, loan: Loan) =>
  loan.lines.map((l) => `${itemName(db, l.itemId)} x${l.quantity}`).join(", ");

/** Text match used by every list search box. */
export const matches = (query: string, ...fields: (string | number | null | undefined)[]) => {
  const q = query.trim().toLowerCase();
  return !q || fields.some((f) => String(f ?? "").toLowerCase().includes(q));
};

/** Void applies only to posted IN, OUT and ADJUSTMENT transactions (BR-05). */
export const canVoid = (x: StockTransaction) => x.status === "Posted" && ["IN", "OUT", "ADJUSTMENT"].includes(x.type);

/** The "supplier / destination / reason" text shown for a transaction. */
export function party(db: DB, x: StockTransaction): string {
  if (x.type === "IN") return supplierName(db, x.supplierId);
  if (x.type === "OUT") return x.destination;
  if (x.type === "ADJUSTMENT" || x.type === "REVERSAL") return x.reason;
  return x.notes || "-";
}
