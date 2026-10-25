// The one entry point for pages: `import { api } from "@/lib/api"`.
import { auth } from "./auth";
import { categories, items, suppliers } from "./master";

export const api = { auth, categories, suppliers, items };

export { tableProps, useCurrentUser, useGet, useListParams, useRequestId, useSession, type LoadStatus } from "./hooks";
export type { ApiError, Envelope, ListMeta, Query } from "./types";
