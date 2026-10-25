// Stock transactions (PRD 4.5, 6.6). Admin only.
import type { AdjustmentInput, IncomingInput, OutgoingInput } from "../schemas";
import type { StockTxType } from "../types";
import { clean, get, post } from "./client";
import type { Query } from "./types";

export interface StockLineDto {
  itemId: number;
  itemName: string;
  itemCode: string;
  unit: string;
  quantityChange: number;
  balanceAfter: number;
  unitPrice: number | null;
  total: number | null;
}

/** Joined names and server-computed fields: the client only displays them. */
export interface StockTxDto {
  id: number;
  number: string;
  type: StockTxType;
  status: "Posted" | "Voided";
  date: string;
  userId: number;
  userName: string;
  supplierId: number | null;
  supplierName: string;
  destination: string;
  reason: string;
  notes: string;
  /** Supplier for IN, destination for OUT, reason for ADJUSTMENT and REVERSAL. */
  party: string;
  /** Sum of line totals (IN only, otherwise 0). */
  total: number;
  reversalOfId: number | null;
  reversalOfNumber: string | null;
  /** The reversal that voided this transaction, if any. */
  voidedById: number | null;
  voidedByNumber: string | null;
  loanId: number | null;
  loanNumber: string | null;
  lines: StockLineDto[];
  createdAt: string;
  allowedActions: "void"[];
}

/** One ledger line (GET /stock/history). */
export interface StockMovementDto {
  transactionId: number;
  number: string;
  type: StockTxType;
  date: string;
  itemId: number;
  itemName: string;
  quantityChange: number;
  balanceAfter: number;
  userName: string;
}

export const stock = {
  list: (q: Query) => get<StockTxDto[]>("/stock/transactions", clean(q)),
  one: (id: number) => get<StockTxDto>(`/stock/transactions/${id}`),
  history: (q: Query) => get<StockMovementDto[]>("/stock/history", clean(q)),
  in: (v: IncomingInput, clientRequestId?: string) => post<StockTxDto>("/stock/in", { ...v, clientRequestId }),
  out: (v: OutgoingInput, clientRequestId?: string) => post<StockTxDto>("/stock/out", { ...v, clientRequestId }),
  adjust: (v: AdjustmentInput, clientRequestId?: string) => post<StockTxDto>("/stock/adjustment", { ...v, clientRequestId }),
  void: (id: number, reason: string) => post<StockTxDto>(`/stock/transactions/${id}/void`, { reason }),
};
