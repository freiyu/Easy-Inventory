// Categories, suppliers and items (PRD 4.2 to 4.4, 6.6).
import type { CategoryInput, ItemInput, SupplierInput } from "../schemas";
import type { ActiveStatus, Category, StockStatus, Supplier } from "../types";
import { clean, del, get, post, put } from "./client";
import type { Query } from "./types";

/** Admin sees every field; Staff get only id and name of active categories (PRD 3.2). */
export interface CategoryDto extends Category {
  itemCount: number;
}
export type CategoryOption = Pick<Category, "id" | "name">;

export interface SupplierDto extends Supplier {
  itemCount: number;
}

export interface Movement {
  id: number;
  number: string;
  type: import("../types").StockTxType;
  date: string;
  quantityChange: number;
  balanceAfter: number;
  userName: string;
}

/**
 * What every role may see. `stockStatus` is computed by the server (BR-25) and `availableForLoan`
 * is stock minus loan reservations (BR-07); the client only displays them.
 */
export interface ItemDto {
  id: number;
  name: string;
  categoryId: number;
  categoryName: string;
  unit: string;
  status: ActiveStatus;
  stockStatus: StockStatus;
  availableForLoan: number;
  // Admin only (the server leaves these out for Staff, PRD 3.2):
  code?: string;
  currentStock?: number;
  minimumStock?: number;
  lastPurchasePrice?: number;
  supplierId?: number | null;
  supplierName?: string;
  location?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
  /** Detail only: units held back by approved loans, and the last 10 stock movements (Admin). */
  reserved?: number;
  movements?: Movement[];
}

export const categories = {
  list: (q: Query) => get<CategoryDto[]>("/categories", clean(q)),
  /** Active categories for pickers (Admin and Staff). */
  options: () => get<CategoryOption[]>("/categories", { status: "Active", pageSize: 500, sort: "name:asc" }),
  create: (v: CategoryInput) => post<CategoryDto>("/categories", v),
  update: (id: number, v: CategoryInput) => put<CategoryDto>(`/categories/${id}`, v),
  remove: (id: number) => del<null>(`/categories/${id}`),
  setStatus: (id: number, kind: "deactivate" | "activate") => post<null>(`/categories/${id}/${kind}`),
};

export const suppliers = {
  list: (q: Query) => get<SupplierDto[]>("/suppliers", clean(q)),
  create: (v: SupplierInput) => post<SupplierDto>("/suppliers", v),
  update: (id: number, v: SupplierInput) => put<SupplierDto>(`/suppliers/${id}`, v),
  remove: (id: number) => del<null>(`/suppliers/${id}`),
  setStatus: (id: number, kind: "deactivate" | "activate") => post<null>(`/suppliers/${id}/${kind}`),
};

/** One row of the import preview (PRD 4.10). */
export interface ImportRowDto {
  line: number;
  status: "ready" | "skipped" | "error" | "imported";
  message: string;
  name: string;
  category: string;
  unit: string;
  openingStock: number;
  minimumStock: number;
  price: number;
  supplier: string;
  location: string;
  notes: string;
}
export interface ImportReportDto {
  rows: ImportRowDto[];
  total: number;
  ready: number;
  skipped: number;
  errors: number;
  /** Items created by a confirmed import; 0 in a preview. */
  created: number;
}

export const items = {
  /** Validates a CSV file and returns one result per row. Saves nothing. */
  importPreview: (csv: string) => post<ImportReportDto>("/items/import/preview", { csv }),
  /** Confirms the import: re-validates, takes a backup, creates the ready rows in one transaction. */
  importConfirm: (csv: string) => post<ImportReportDto>("/items/import", { csv }),
  list: (q: Query) => get<ItemDto[]>("/items", clean(q)),
  one: (id: number) => get<ItemDto>(`/items/${id}`),
  locations: () => get<string[]>("/items/locations"),
  create: (v: ItemInput) => post<ItemDto>("/items", v),
  update: (id: number, v: ItemInput) => put<ItemDto>(`/items/${id}`, v),
  remove: (id: number) => del<null>(`/items/${id}`),
  setStatus: (id: number, kind: "deactivate" | "activate") => post<null>(`/items/${id}/${kind}`),
};
