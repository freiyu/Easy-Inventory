// Mock API adapter (Stage 2, development only). Implements the contract of PRD 6.6 in the browser:
// routing, session check, role check, idempotency (BR-19), envelopes, error codes, paging.
// The business rules are in ops.ts; the response shaping is in handlers/. Removed in Stage 4.
import type { ApiRequest, Envelope } from "../api/types";
import { today } from "../format";
import { t } from "../strings";
import type { ApiError, Result } from "../types";
import { authRoutes } from "./handlers/auth";
import { adminRoutes } from "./handlers/admin";
import { loanRoutes } from "./handlers/loans";
import { masterRoutes } from "./handlers/master";
import { purchaseRoutes } from "./handlers/purchases";
import { stockRoutes } from "./handlers/stock";
import type { H, Out, Route } from "./handlers/types";
import { fail } from "./ops";
import { mock, sessionUser } from "./state";

let latencyMs = 250;
/** Tests turn the simulated network delay off. */
export const setLatency = (ms: number) => { latencyMs = ms; };

const STATUS: Record<ApiError["code"], number> = {
  VALIDATION_ERROR: 422,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INSUFFICIENT_STOCK: 422,
  BUSINESS_RULE_VIOLATION: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

const routes: Route[] = [...authRoutes, ...masterRoutes, ...stockRoutes, ...loanRoutes, ...purchaseRoutes, ...adminRoutes];

const compiled = routes.map((r) => {
  const names: string[] = [];
  const re = new RegExp("^" + r.path.replace(/:(\w+)/g, (_, n) => (names.push(n), "([^/]+)")) + "$");
  return { route: r, re, names };
});

function match(method: string, path: string) {
  for (const c of compiled) {
    if (c.route.method !== method) continue;
    const m = c.re.exec(path);
    if (m) return { route: c.route, params: Object.fromEntries(c.names.map((n, i) => [n, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}

const err = <T>(r: Result<never> | Result<T>): Envelope<T> => {
  const e = (r as { ok: false; error: ApiError }).error;
  return { success: false, status: STATUS[e.code], error: e };
};
const envelope = (out: Out): Envelope<unknown> =>
  out.ok ? { success: true, data: out.data, ...(out.meta ? { meta: out.meta } : {}) } : err(out);

const wait = () => new Promise((r) => setTimeout(r, latencyMs));

export async function handle(req: ApiRequest): Promise<Envelope<unknown>> {
  await wait();
  try {
    const hit = match(req.method, req.path);
    if (!hit) return envelope(fail("NOT_FOUND", t.errors.notFound));
    const { route, params } = hit;

    const user = sessionUser();
    if (!user && !route.public) return envelope(fail("UNAUTHENTICATED", t.errors.forbidden));
    if (route.admin && user?.role !== "Admin") return envelope(fail("FORBIDDEN", t.errors.forbidden));

    const write = req.method !== "GET";
    const body = { ...((req.body as Record<string, unknown>) ?? {}) };
    const requestId = route.idempotent ? String(body.clientRequestId ?? "") : "";
    delete body.clientRequestId;
    const idemKey = requestId && user ? `${user.id}:${req.path}:${requestId}` : "";
    const seen = idemKey ? mock.idem.get(idemKey) : undefined;
    if (seen) return seen;

    // Writes run on a copy and are committed only on success, so a failed request changes nothing.
    const db = write ? structuredClone(mock.db) : mock.db;
    const actor = user ? (db.users.find((u) => u.id === user.id) ?? user) : (null as never);
    const h: H = { c: { db, actor, now: new Date().toISOString(), today: today() }, params, query: req.query ?? {}, body };
    const out = route.run(h);
    if (write && out.ok) mock.db = db;
    const env = envelope(out);
    if (idemKey && env.success) mock.idem.set(idemKey, env);
    return env;
  } catch {
    return envelope(fail("INTERNAL_ERROR", t.errors.server));
  }
}
