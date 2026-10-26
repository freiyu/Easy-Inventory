// Entity types follow PRD 6.1. Dates are "YYYY-MM-DD", timestamps are ISO strings in UTC (BR-17).

export type Role = "Admin" | "Staff";
export type ActiveStatus = "Active" | "Inactive";

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  status: ActiveStatus;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface Category {
  id: number;
  name: string;
  code: string;
  description: string;
  status: ActiveStatus;
  createdAt: string;
}

export interface Supplier {
  id: number;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  status: ActiveStatus;
  createdAt: string;
}

export interface Item {
  id: number;
  code: string;
  name: string;
  categoryId: number;
  unit: string;
  currentStock: number;
  minimumStock: number;
  lastPurchasePrice: number;
  supplierId: number | null;
  location: string;
  status: ActiveStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type StockStatus = "Safe" | "Low" | "Out";

export type StockTxType =
  | "IN"
  | "OUT"
  | "ADJUSTMENT"
  | "LOAN_ISSUE"
  | "LOAN_RETURN"
  | "REVERSAL";

export interface StockLine {
  itemId: number;
  quantityChange: number;
  balanceAfter: number;
  unitPrice: number | null;
  total: number | null;
}

export interface StockTransaction {
  id: number;
  number: string;
  type: StockTxType;
  status: "Posted" | "Voided";
  date: string;
  userId: number;
  supplierId: number | null;
  destination: string;
  reason: string;
  notes: string;
  reversalOfId: number | null;
  loanId: number | null;
  lines: StockLine[];
  createdAt: string;
}

export type LoanStatus =
  | "Draft"
  | "Pending Approval"
  | "Approved"
  | "Rejected"
  | "Borrowed"
  | "Completed"
  | "Cancelled";

// Overdue is derived (BR-12), never stored.
export type LoanDisplayStatus = LoanStatus | "Overdue";

export interface LoanLine {
  itemId: number;
  quantity: number;
}

export interface Loan {
  id: number;
  number: string;
  borrowerId: number;
  status: LoanStatus;
  loanDate: string;
  expectedReturnDate: string;
  purpose: string;
  notes: string;
  rejectReason: string;
  approvedBy: number | null;
  approvedAt: string | null;
  issuedBy: number | null;
  issuedAt: string | null;
  returnedAt: string | null;
  receivedBy: number | null;
  returnNotes: string;
  lines: LoanLine[];
  createdAt: string;
  updatedAt: string;
}

export type PurchaseStatus =
  | "Draft"
  | "Pending Approval"
  | "Approved"
  | "Rejected"
  | "Received"
  | "Cancelled";

export interface PurchaseLine {
  /** Null while the line is a new item; set to the created item when the request is received (BR-31). */
  itemId: number | null;
  quantity: number;
  newItem?: { name: string; categoryId: number; unit: string };
}

export interface PurchaseRequest {
  id: number;
  number: string;
  requesterId: number;
  status: PurchaseStatus;
  neededBy: string;
  reason: string;
  notes: string;
  rejectReason: string;
  approvedBy: number | null;
  approvedAt: string | null;
  receivedBy: number | null;
  receivedAt: string | null;
  /** The IN transaction created when the request was received (BR-28). */
  transactionId: number | null;
  lines: PurchaseLine[];
  createdAt: string;
  updatedAt: string;
}

export interface ActivityEntry {
  id: number;
  userId: number | null;
  action: string;
  module: string;
  reference: string;
  metadata: string;
  createdAt: string;
}

export interface BackupFile {
  id: number;
  fileName: string;
  createdAt: string;
  kind: "Automatic" | "Manual" | "Before update" | "Before import";
  sizeKb: number;
}

export interface ApiError {
  code:
    | "VALIDATION_ERROR"
    | "UNAUTHENTICATED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INSUFFICIENT_STOCK"
    | "BUSINESS_RULE_VIOLATION"
    | "RATE_LIMITED"
    | "INTERNAL_ERROR";
  message: string;
  fields?: Record<string, string>;
}

