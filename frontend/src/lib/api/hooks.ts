"use client";
// Data hooks over the API client: useGet (read), useListParams (URL-backed list state),
// useCurrentUser (session), useRequestId (idempotency key for create forms, BR-19).
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { User } from "../types";
import { ensureSession } from "./auth";
import { get } from "./client";
import { useSessionState, useVersion } from "./store";
import { DEFAULT_PAGE_SIZE, type ApiError, type Envelope, type ListMeta, type Query } from "./types";

export type LoadStatus = "loading" | "error" | "ready";

/**
 * GET with loading / error / ready. Refetches after any successful write. While a new page or filter
 * loads, the previous rows stay on screen (`refreshing`). Pass `null` as path to wait (for example for an id).
 */
export function useGet<T>(path: string | null, query?: Query) {
  const version = useVersion();
  const key = path === null ? null : JSON.stringify([path, query ?? {}]);
  const [res, setRes] = useState<{ key: string; env: Envelope<T> } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (key === null) return;
    const [p, q] = JSON.parse(key) as [string, Query];
    let live = true;
    void get<T>(p, q).then((env) => live && setRes({ key, env }));
    return () => { live = false; };
  }, [key, version, attempt]);

  const retry = useCallback(() => { setRes(null); setAttempt((n) => n + 1); }, []);
  const env = res?.env;
  let status: LoadStatus = "loading";
  if (env?.success) status = "ready";
  else if (env && res.key === key) status = "error";
  return {
    status,
    retry,
    data: env?.success ? env.data : undefined,
    meta: env?.success ? (env.meta as ListMeta | undefined) : undefined,
    error: env && !env.success ? (env.error as ApiError) : undefined,
    /** True when the shown data belongs to an earlier query. */
    refreshing: res !== null && res.key !== key,
    /** HTTP-like status of a failed read, for 404 handling. */
    errorStatus: env && !env.success ? env.status : undefined,
  };
}

/** The logged-in user, or null (also while the first answer is pending, see `useSession`). */
export function useSession(): { user: User | null; loaded: boolean } {
  const s = useSessionState();
  useEffect(() => { void ensureSession(); }, []);
  return s;
}
export const useCurrentUser = (): User | null => useSession().user;

const rid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

/** A key for one create attempt: reuse it while the form is open, call renew() after a success. */
export function useRequestId() {
  const [id, setId] = useState(rid);
  return { id, renew: () => setId(rid()) };
}

type Patch = Record<string, string | number | undefined>;

/**
 * List state kept in the URL (back button and links work): page, pageSize, search, sort and filters.
 * A missing filter means its default; "all" is an explicit value that the client drops from the request.
 */
export function useListParams(defaults: { sort: string; pageSize?: number; filters?: Record<string, string> }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const read = (k: string) => sp.get(k) ?? "";
  const filterDefaults = defaults.filters ?? {};

  const filters: Record<string, string> = {};
  for (const [k, d] of Object.entries(filterDefaults)) filters[k] = read(k) || d;

  const set = useCallback((patch: Patch) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === "") next.delete(k);
      else next.set(k, String(v));
    }
    if (!("page" in patch)) next.delete("page");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [sp, router, pathname]);

  // The box types freely; the URL (and the request) follows 300 ms later.
  const urlSearch = read("search");
  const [text, setText] = useState(urlSearch);
  useEffect(() => {
    const id = setTimeout(() => { if (text !== urlSearch) set({ search: text }); }, 300);
    return () => clearTimeout(id);
  }, [text, urlSearch, set]);

  const params: Query = {
    page: Number(read("page")) || 1,
    pageSize: Number(read("pageSize")) || defaults.pageSize || DEFAULT_PAGE_SIZE,
    sort: read("sort") || defaults.sort,
    search: urlSearch || undefined,
    ...filters,
  };
  const dirty = !!urlSearch || text !== "" || Object.entries(filterDefaults).some(([k, d]) => filters[k] !== d);
  const clear = () => {
    setText("");
    router.replace(pathname, { scroll: false });
  };
  return { params, filters, search: text, setSearch: setText, set, clear, dirty };
}

/** Wires a list query and its URL state into the props DataTable needs. */
export function tableProps<T>(list: ReturnType<typeof useGet<T[]>>, lp: ReturnType<typeof useListParams>) {
  const rows = list.data ?? [];
  return {
    rows,
    meta: list.meta ?? { page: 1, pageSize: Number(lp.params.pageSize), total: rows.length },
    sort: String(lp.params.sort),
    onSortChange: (sort: string) => lp.set({ sort }),
    onPageChange: (page: number) => lp.set({ page }),
    onPageSizeChange: (pageSize: number) => lp.set({ pageSize }),
    busy: list.refreshing,
  };
}
