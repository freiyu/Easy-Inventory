// Shapes shared by the mock route handlers. Handlers are the mock "server": they apply the business
// rules from ops.ts, shape the response (names joined in, derived fields, Staff field filtering) and page lists.
import type { ListMeta, Query } from "../../api/types";
import type { Result } from "../../types";
import type { Ctx } from "../ops";

export type Out = Result<unknown> & { meta?: ListMeta };

export interface H {
  /** For GET routes `c.db` is the live database (read only). Write routes get a copy that is committed on success. */
  c: Ctx;
  params: Record<string, string>;
  query: Query;
  body: Record<string, unknown>;
}

export interface Route {
  method: "GET" | "POST" | "PUT" | "DELETE";
  /** For example "/items/:id/deactivate". */
  path: string;
  /** Not logged in is allowed (login, setup). */
  public?: boolean;
  /** Admin only: Staff get 403 before the handler runs. */
  admin?: boolean;
  /** Create endpoints that honour clientRequestId (BR-19). */
  idempotent?: boolean;
  run: (h: H) => Out;
}
