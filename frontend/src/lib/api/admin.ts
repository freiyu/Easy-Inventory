// Dashboard, expenses, reports, users, activity log and backup (PRD 4.1, 4.7 to 4.12, 6.6).
import type { UserInput } from "../schemas";
import type { ActivityEntry, BackupFile, LoanDisplayStatus, StockStatus, StockTxType, User } from "../types";
import { clean, get, post, put } from "./client";
import type { ItemDto } from "./master";
import type { Query } from "./types";

/** Sidebar badges for Admin (PRD 5.7): items needing attention, overdue loans, purchase requests waiting for this Admin. */
export interface Badges {
  items: number;
  loans: number;
  purchases: number;
}

// ---------------------------------------------------------------- dashboard

export interface AttentionItem {
  id: number;
  name: string;
  categoryName: string;
  currentStock: number;
  minimumStock: number;
  stockStatus: StockStatus;
}

export interface LoanBrief {
  id: number;
  number: string;
  /** "Item xQty, Item xQty" */
  summary: string;
  expectedReturnDate: string;
  status: LoanDisplayStatus;
  daysOverdue: number;
}

export interface AdminDashboard {
  itemTypes: number;
  totalStock: number;
  stock: Record<StockStatus, number>;
  /** Low plus Out. */
  attention: number;
  loans: { pending: number; approved: number; borrowed: number; overdue: number; active: number };
  needsAttention: AttentionItem[];
  overdueLoans: LoanBrief[];
}

/** Staff see only their own loans and counts: no stock numbers and no money (PRD 3.2). */
export interface StaffDashboard {
  activeLoans: LoanBrief[];
  overdueCount: number;
  /** The first overdue loan, for the alert banner. */
  overdueFirst: LoanBrief | null;
  /** Active items that can be requested right now, and how many active items exist. */
  requestable: number;
  activeItems: number;
}

export interface DashboardSummary {
  /** Admin only. */
  badges?: Badges;
  admin?: AdminDashboard;
  staff?: StaffDashboard;
}

// ----------------------------------------------------------------- expenses

export interface ExpenseSummary {
  total: number;
  count: number;
  months: { month: string; count: number; value: number }[];
}

// ------------------------------------------------------------------ reports

/** The stock report reuses the item row (Admin shape). */
export type StockReportRow = ItemDto;

export interface MovementRow {
  key: string;
  txId: number;
  number: string;
  date: string;
  itemName: string;
  type: StockTxType;
  quantityChange: number;
  balanceAfter: number;
  userName: string;
}

export interface LoanReportRow {
  id: number;
  number: string;
  borrowerName: string;
  summary: string;
  loanDate: string;
  expectedReturnDate: string;
  returnedAt: string | null;
  status: LoanDisplayStatus;
}

// ------------------------------------------------------------ activity log

export interface ActivityRow extends ActivityEntry {
  /** Null for system entries. */
  userName: string | null;
}

export interface BackupDownload {
  fileName: string;
  /** Mock only: the real endpoint streams the file (Stage 3). */
  stub: true;
}

export const dashboard = {
  summary: () => get<DashboardSummary>("/dashboard/summary"),
};

export const expenses = {
  summary: (from: string, to: string) => get<ExpenseSummary>("/expenses/summary", { from, to }),
};

export const reports = {
  stock: (q: Query) => get<StockReportRow[]>("/reports/stock", clean(q)),
  movements: (q: Query) => get<MovementRow[]>("/reports/movements", clean(q)),
  loans: (q: Query) => get<LoanReportRow[]>("/reports/loans", clean(q)),
};

export const users = {
  list: (q: Query) => get<User[]>("/users", clean(q)),
  one: (id: number) => get<User>(`/users/${id}`),
  create: (v: UserInput) => post<{ user: User; tempPassword: string }>("/users", v),
  update: (id: number, v: UserInput) => put<User>(`/users/${id}`, v),
  setStatus: (id: number, kind: "deactivate" | "activate") => post<User>(`/users/${id}/${kind}`),
  resetPassword: (id: number) => post<{ tempPassword: string }>(`/users/${id}/reset-password`),
};

export const activity = {
  list: (q: Query) => get<ActivityRow[]>("/activity-log", clean(q)),
  modules: () => get<string[]>("/activity-log/modules"),
};

export const backup = {
  list: (q: Query) => get<BackupFile[]>("/backup/database", clean(q)),
  create: () => post<BackupFile>("/backup/database"),
  download: (id: number) => get<BackupDownload>(`/backup/database/${id}/download`),
};
