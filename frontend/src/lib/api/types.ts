// API contract shapes (PRD 6.6). Pages and components import these.
import type { ApiError } from "../types";

export type { ApiError };

export interface ListMeta {
  page: number;
  pageSize: number;
  total: number;
}

export type Envelope<T> =
  | { success: true; data: T; meta?: ListMeta }
  | { success: false; status: number; error: ApiError };

/** Query parameters of a list endpoint: paging, search, sort ("field:asc|desc") and module filters. */
export type Query = Record<string, string | number | undefined>;

export interface ApiRequest {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  query?: Query;
  body?: unknown;
  /** An image upload: sent as the raw body with the file's own type, instead of JSON. */
  file?: Blob;
}

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 500;
