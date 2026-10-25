// Domain rules (PRD 4.5, 4.6, 6.4) used by the MOCK server only. The real backend owns them (Stage 3);
// the frontend never imports this file, it receives the results as API fields.
import { dayDiff, today } from "../format";
import type {
  Item,
  Loan,
  LoanDisplayStatus,
  LoanLine,
  StockStatus,
} from "../types";

/** BR-25: Safe > minimum, Low <= minimum and > 0, Out = 0. */
export function stockStatus(stock: number, minimum: number): StockStatus {
  if (stock <= 0) return "Out";
  if (stock <= minimum) return "Low";
  return "Safe";
}

/** BR-12: Overdue is derived from Borrowed plus the expected return date. */
export function loanDisplayStatus(loan: Loan): LoanDisplayStatus {
  if (loan.status === "Borrowed" && loan.expectedReturnDate < today()) return "Overdue";
  return loan.status;
}

export const daysOverdue = (loan: Loan): number =>
  Math.max(0, dayDiff(loan.expectedReturnDate, today()));

/** Quantity reserved by Approved loans, optionally excluding one loan (BR-07). */
export function reservedQuantity(loans: Loan[], itemId: number, excludeLoanId?: number): number {
  let total = 0;
  for (const l of loans) {
    if (l.status !== "Approved" || l.id === excludeLoanId) continue;
    for (const line of l.lines) if (line.itemId === itemId) total += line.quantity;
  }
  return total;
}

/** BR-07: available for loan = current stock - reserved by Approved loans. */
export function availableForLoan(item: Item, loans: Loan[], excludeLoanId?: number): number {
  return Math.max(0, item.currentStock - reservedQuantity(loans, item.id, excludeLoanId));
}

/** Merge duplicate item lines so limits are checked per item. */
export function totalsByItem(lines: LoanLine[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const l of lines) map.set(l.itemId, (map.get(l.itemId) ?? 0) + l.quantity);
  return map;
}

/**
 * Earliest allowed return date (BR-20: not before the loan date). A loan handed over
 * before its planned date can be returned from the day it was actually issued.
 */
export function returnFloor(loan: Loan): string {
  const issued = loan.issuedAt?.slice(0, 10);
  return issued && issued < loan.loanDate ? issued : loan.loanDate;
}
