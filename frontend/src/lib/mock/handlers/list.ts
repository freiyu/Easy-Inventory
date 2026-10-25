import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, type Query } from "../../api/types";
import { matches } from "../queries";
import { ok } from "../ops";
import type { Out } from "./types";

type Sorters<T> = Record<string, (row: T) => string | number>;

const num = (v: unknown, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};

/** Query value as a string; undefined, empty and "all" mean "no filter". */
export const filterValue = (q: Query, key: string): string | undefined => {
  const v = q[key];
  return v === undefined || v === "" || v === "all" ? undefined : String(v);
};

export const searchRows = <T>(rows: T[], q: Query, fields: (row: T) => (string | number | null | undefined)[]) => {
  const s = filterValue(q, "search");
  return s ? rows.filter((r) => matches(s, ...fields(r))) : rows;
};

/** Sorts by `sort=field:asc|desc` (unknown fields fall back to defaultSort), then slices the page (PRD 6.6). */
export function paged<T>(rows: T[], q: Query, sorters: Sorters<T>, defaultSort: string): Out {
  const [wantField, wantDir] = String(q.sort ?? defaultSort).split(":");
  const known = Object.hasOwn(sorters, wantField);
  const [field, dir] = known ? [wantField, wantDir] : defaultSort.split(":");
  const get = sorters[field];
  const sign = dir === "desc" ? -1 : 1;
  const sorted = [...rows].sort((a, b) => {
    const x = get(a), y = get(b);
    return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * sign;
  });
  const pageSize = Math.min(num(q.pageSize, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
  const page = Math.min(num(q.page, 1), Math.max(1, Math.ceil(sorted.length / pageSize)));
  const data = sorted.slice((page - 1) * pageSize, page * pageSize);
  return { ...ok(data), meta: { page, pageSize, total: sorted.length } };
}
