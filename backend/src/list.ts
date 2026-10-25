// List query parameters (PRD 6.6): page, pageSize (default 25, max 500), search, sort "field:asc|desc", filters.
import type { Paged } from "./http";

export type Query = Record<string, unknown>;
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 500;

const posInt = (v: unknown, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};

/** Query value as a string; missing, empty and "all" mean "no filter". */
export const filterValue = (q: Query, key: string): string | undefined => {
  const v = q[key];
  if (Array.isArray(v)) return filterValue({ [key]: v[0] }, key);
  return v === undefined || v === "" || v === "all" ? undefined : String(v);
};
export const filterId = (q: Query, key: string) => {
  const v = filterValue(q, key);
  return v && /^\d+$/.test(v) ? Number(v) : undefined;
};

/** Text match used by every list search. */
export const matches = (query: string, ...fields: (string | number | null | undefined)[]) => {
  const s = query.trim().toLowerCase();
  return !s || fields.some((f) => String(f ?? "").toLowerCase().includes(s));
};

export const searchRows = <T>(rows: T[], q: Query, fields: (row: T) => (string | number | null | undefined)[]) => {
  const s = filterValue(q, "search");
  return s ? rows.filter((r) => matches(s, ...fields(r))) : rows;
};

export function pageParams(q: Query) {
  const pageSize = Math.min(posInt(q.pageSize, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
  return { page: posInt(q.page, 1), pageSize };
}

/** Sort field and direction from a whitelist; unknown fields fall back to the default. */
export function sortParam(q: Query, known: readonly string[], fallback: string): [string, "asc" | "desc"] {
  const [field, dir] = String(q.sort ?? fallback).split(":");
  if (known.includes(field)) return [field, dir === "desc" ? "desc" : "asc"];
  const [f, d] = fallback.split(":");
  return [f, d === "desc" ? "desc" : "asc"];
}

/** Clamps the page so a page past the end shows the last page. */
export function clampPage(page: number, pageSize: number, total: number) {
  return Math.min(page, Math.max(1, Math.ceil(total / pageSize)));
}

type Sorters<T> = Record<string, (row: T) => string | number>;

/**
 * Sorts and pages rows in memory.
 * shortcut: used for lists that stay small at PRD 6.8 sizes (up to 10,000 items, users, loans, requests); the
 * ledger and activity log page in SQL instead. Move a list to SQL paging if it grows past that.
 */
export function paged<T>(rows: T[], q: Query, sorters: Sorters<T>, defaultSort: string): Paged<T> {
  const [field, dir] = sortParam(q, Object.keys(sorters), defaultSort);
  const get = sorters[field];
  const sign = dir === "desc" ? -1 : 1;
  const sorted = [...rows].sort((a, b) => {
    const x = get(a), y = get(b);
    return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * sign;
  });
  const { pageSize, page: want } = pageParams(q);
  const page = clampPage(want, pageSize, sorted.length);
  return { rows: sorted.slice((page - 1) * pageSize, page * pageSize), meta: { page, pageSize, total: sorted.length } };
}
