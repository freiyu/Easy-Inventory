// The one typed API client (PRD 6.6). Endpoint groups live in the sibling files and are
// collected in index.ts. A write that succeeds invalidates every query, so lists stay fresh.
import { invalidate, setSessionUser } from "./store";
import { download, send } from "./transport";
import type { ApiRequest, Envelope, Query } from "./types";

export async function call<T>(req: ApiRequest): Promise<Envelope<T>> {
  const r = (await send(req)) as Envelope<T>;
  if (r.success && req.method !== "GET") invalidate();
  // An expired or missing session sends the shell back to the login page.
  if (!r.success && r.status === 401 && !req.path.startsWith("/auth/") && !req.path.startsWith("/setup/")) setSessionUser(null);
  return r;
}

/** Downloads a file (Excel export, backup); the result says only whether it worked. */
export async function getFile(path: string, query?: Query): Promise<Envelope<null>> {
  const r = await download(path, query);
  if (!r.success && r.status === 401) setSessionUser(null);
  return r;
}

export const get = <T>(path: string, query?: Query) => call<T>({ method: "GET", path, query });
export const post = <T>(path: string, body?: unknown) => call<T>({ method: "POST", path, body });
export const put = <T>(path: string, body?: unknown) => call<T>({ method: "PUT", path, body });
export const del = <T>(path: string) => call<T>({ method: "DELETE", path });

/** Drops empty values so "all" filters are not sent. */
export const clean = (q: Query): Query =>
  Object.fromEntries(Object.entries(q).filter(([, v]) => v !== undefined && v !== "" && v !== "all"));
