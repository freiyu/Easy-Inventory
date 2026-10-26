// The only place that knows how a request reaches the server: fetch to /api on the same origin, with the
// session cookie (PRD 0.2, 3.4). In development Next forwards /api to the backend (next.config.ts).
import { t } from "../strings";
import type { ApiRequest, Envelope, Query } from "./types";

export function apiUrl(path: string, query?: Query) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) qs.set(k, String(v));
  const s = qs.toString();
  return `/api${path}${s ? `?${s}` : ""}`;
}

const failure = (status: number, message: string): Envelope<never> => ({ success: false, status, error: { code: "INTERNAL_ERROR", message } });

/** Turns a non-2xx response into the error envelope; a body that is not ours (proxy error page) becomes a generic error. */
async function errorOf(res: Response): Promise<Envelope<never>> {
  const json = await res.json().catch(() => null);
  return json?.success === false && json.error ? { success: false, status: res.status, error: json.error } : failure(res.status, t.errors.server);
}

export async function send(req: ApiRequest): Promise<Envelope<unknown>> {
  const hasBody = req.body !== undefined;
  const res = await fetch(apiUrl(req.path, req.query), {
    method: req.method,
    credentials: "same-origin",
    headers: hasBody ? { "Content-Type": "application/json" } : undefined,
    body: hasBody ? JSON.stringify(req.body) : undefined,
  }).catch(() => null);
  if (!res) return failure(0, t.errors.network);
  if (!res.ok) return errorOf(res);
  const json = await res.json().catch(() => null);
  return json?.success === true ? json : failure(res.status, t.errors.server);
}

/** GET a file (Excel export, backup) and hand it to the browser as a download. */
export async function download(path: string, query?: Query): Promise<Envelope<null>> {
  const res = await fetch(apiUrl(path, query), { credentials: "same-origin" }).catch(() => null);
  if (!res) return failure(0, t.errors.network);
  if (!res.ok) return errorOf(res);
  // Express quotes the name for attachment() but not for download(), so accept both.
  const name = /filename="?([^";]+)"?/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "download";
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0); // revoking at once can cancel the download in some browsers
  return { success: true, data: null };
}
