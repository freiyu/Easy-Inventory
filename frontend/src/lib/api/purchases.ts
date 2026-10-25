// Purchase requests (PRD 4.6A, 6.6: /purchase-requests).
import type { PurchaseInput, ReceiveInput } from "../schemas";
import type { PurchaseStatus } from "../types";
import { clean, get, post, put } from "./client";
import type { Query } from "./types";

/** What the current user may do right now (BR-27..BR-31). Computed by the server; the page only renders it. */
export type PurchaseAction = "edit" | "submit" | "cancel" | "approve" | "reject" | "receive";

export interface PurchaseLineDto {
  /** Null while the line is a new item; set to the created item once received (BR-31). */
  itemId: number | null;
  /** The item's name, or the proposed name while it is still a new item. */
  itemName: string;
  unit: string;
  quantity: number;
  newItem?: { name: string; categoryId: number; categoryName: string; unit: string };
  // Admin only (the server leaves these out for Staff, BR-16):
  currentStock?: number;
  minimumStock?: number;
  lastPurchasePrice?: number;
  preferredSupplierId?: number | null;
}

export interface PurchaseDto {
  id: number;
  number: string;
  requesterId: number;
  requesterName: string;
  status: PurchaseStatus;
  neededBy: string;
  reason: string;
  notes: string;
  rejectReason: string;
  approvedBy: number | null;
  approvedByName: string;
  approvedAt: string | null;
  receivedBy: number | null;
  receivedByName: string;
  receivedAt: string | null;
  /** "Item xQty, Item xQty" for lists. */
  lineSummary: string;
  lines: PurchaseLineDto[];
  allowedActions: PurchaseAction[];
  createdAt: string;
  updatedAt: string;
  // Admin only:
  transactionId?: number | null;
  transactionNumber?: string;
  /** The incoming stock posted at receipt was voided afterwards (the request stays Received). */
  receiptVoided?: boolean;
}

/**
 * List filters: `status` is one status or a comma list ("Rejected,Cancelled"), `requesterId` (Admin),
 * `from` / `to` (created date). Search matches number, requester, item names and reason.
 */
export const purchases = {
  list: (q: Query) => get<PurchaseDto[]>("/purchase-requests", clean(q)),
  one: (id: number) => get<PurchaseDto>(`/purchase-requests/${id}`),
  create: (v: PurchaseInput, submit: boolean, clientRequestId: string) =>
    post<PurchaseDto>("/purchase-requests", { ...v, submit, clientRequestId }),
  update: (id: number, v: PurchaseInput, submit: boolean) => put<PurchaseDto>(`/purchase-requests/${id}`, { ...v, submit }),
  submit: (id: number) => post<PurchaseDto>(`/purchase-requests/${id}/submit`),
  cancel: (id: number) => post<PurchaseDto>(`/purchase-requests/${id}/cancel`),
  approve: (id: number) => post<PurchaseDto>(`/purchase-requests/${id}/approve`),
  reject: (id: number, reason: string) => post<PurchaseDto>(`/purchase-requests/${id}/reject`, { reason }),
  receive: (id: number, v: ReceiveInput) => post<PurchaseDto>(`/purchase-requests/${id}/receive`, v),
};
