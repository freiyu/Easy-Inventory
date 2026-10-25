// Display only: which step of the progress card a status belongs to. The rules themselves live on the server.
import type { Loan, PurchaseRequest } from "./types";

/** Loan step shown on the detail progress card (0-based), or -1 when terminal. */
export function loanStep(status: Loan["status"]): number {
  switch (status) {
    case "Draft":
    case "Pending Approval":
      return 0;
    case "Approved":
      return 1;
    case "Borrowed":
      return 2;
    case "Completed":
      return 3;
    default:
      return -1;
  }
}

/** Purchase request step on the detail progress card (0-based), or -1 when terminal. */
export function purchaseStep(status: PurchaseRequest["status"]): number {
  switch (status) {
    case "Draft":
    case "Pending Approval":
      return 0;
    case "Approved":
      return 1;
    case "Received":
      return 2;
    default:
      return -1;
  }
}
