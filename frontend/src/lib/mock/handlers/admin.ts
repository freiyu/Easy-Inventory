import { loanDisplayStatus, stockStatus } from "../../rules";
import { ok } from "../ops";
import type { Route } from "./types";

// Owner of the admin module replaces/extends this file (dashboard, expenses, reports, users, log, backup).
export const adminRoutes: Route[] = [
  {
    method: "GET",
    path: "/dashboard/summary",
    run: ({ c }) => {
      const { db, actor } = c;
      return ok({
        badges: {
          items: db.items.filter((i) => i.status === "Active" && stockStatus(i.currentStock, i.minimumStock) !== "Safe").length,
          loans: db.loans.filter((l) => loanDisplayStatus(l) === "Overdue").length,
          purchases: db.purchaseRequests.filter((p) => p.status === "Pending Approval" && p.requesterId !== actor.id).length,
        },
      });
    },
  },
];
