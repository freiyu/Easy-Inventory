// The one entry point for pages: `import { api } from "@/lib/api"`.
import { activity, backup, dashboard, expenses, reports, users } from "./admin";
import { auth } from "./auth";
import { loans } from "./loans";
import { categories, items, suppliers } from "./master";
import { purchases } from "./purchases";
import { stock } from "./stock";

export const api = { auth, categories, suppliers, items, stock, loans, purchases, dashboard, expenses, reports, users, activity, backup };

export { tableProps, useCurrentUser, useGet, useListParams, useRequestId, useSession, type LoadStatus } from "./hooks";
export type { ApiError, Envelope, ListMeta, Query } from "./types";
