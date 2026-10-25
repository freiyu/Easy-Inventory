// Loans (PRD 4.6, 6.2, 6.6). The server joins names, computes the display status (Overdue, BR-12) and
// tells the current user which actions are allowed; the client only shows them.
import type { LoanInput, ReturnInput } from "../schemas";
import type { Loan, LoanDisplayStatus } from "../types";
import { clean, get, post, put } from "./client";
import type { Query } from "./types";

export type LoanAction = "edit" | "submit" | "cancel" | "approve" | "reject" | "issue" | "return";

export interface LoanLineDto {
  itemId: number;
  itemName: string;
  unit: string;
  quantity: number;
  /** Admin only: stock on hand and what can still be lent (BR-07). */
  currentStock?: number;
  availableForLoan?: number;
}

export interface LoanDto extends Omit<Loan, "lines"> {
  borrowerName: string;
  approvedByName: string;
  issuedByName: string;
  receivedByName: string;
  /** Status with Overdue applied. */
  displayStatus: LoanDisplayStatus;
  daysOverdue: number;
  /** Earliest allowed return date (BR-20). */
  returnFloor: string;
  /** "Item xQty, Item xQty" for lists. */
  itemsSummary: string;
  lines: LoanLineDto[];
  /** What the current user may do with this loan right now. */
  allowedActions: LoanAction[];
}

export const loans = {
  list: (q: Query) => get<LoanDto[]>("/loans", clean(q)),
  one: (id: number) => get<LoanDto>(`/loans/${id}`),
  create: (v: LoanInput, submit: boolean, clientRequestId: string) => post<LoanDto>("/loans", { ...v, submit, clientRequestId }),
  update: (id: number, v: LoanInput, submit: boolean) => put<LoanDto>(`/loans/${id}`, { ...v, submit }),
  submit: (id: number) => post<LoanDto>(`/loans/${id}/submit`),
  cancel: (id: number) => post<LoanDto>(`/loans/${id}/cancel`),
  approve: (id: number) => post<LoanDto>(`/loans/${id}/approve`),
  reject: (id: number, reason: string) => post<LoanDto>(`/loans/${id}/reject`, { reason }),
  issue: (id: number) => post<LoanDto>(`/loans/${id}/issue`),
  return: (id: number, v: ReturnInput) => post<LoanDto>(`/loans/${id}/return`, v),
};
