// Purchase requests: rules in ops.ts, response shaping here (names, allowedActions, Staff field filtering).
import type { PurchaseAction, PurchaseDto, PurchaseLineDto } from "../../api/purchases";
import type { PurchaseInput, ReceiveInput } from "../../schemas";
import { t } from "../../strings";
import type { PurchaseRequest } from "../../types";
import {
  approvePurchase, cancelPurchase, createPurchase, fail, ok, receivePurchase, rejectPurchase, submitPurchase,
  updatePurchaseDraft, type Ctx,
} from "../ops";
import { filterValue, paged } from "./list";
import { matches } from "../queries";
import type { H, Out, Route } from "./types";

const id = (h: H) => Number(h.params.id);
const isAdmin = (c: Ctx) => c.actor.role === "Admin";
const nameOf = (c: Ctx, userId: number | null) => c.db.users.find((u) => u.id === userId)?.name ?? "-";

/** BR-27..BR-31 as buttons: who may do what to this request now. */
function allowedActions(c: Ctx, p: PurchaseRequest): PurchaseAction[] {
  const admin = isAdmin(c);
  const own = p.requesterId === c.actor.id;
  if (!admin && !own) return [];
  const out: PurchaseAction[] = [];
  if (p.status === "Draft") out.push("edit", "submit", "cancel");
  if (p.status === "Pending Approval") {
    out.push("cancel");
    if (admin && !own) out.push("approve", "reject"); // BR-29: never your own request
  }
  if (p.status === "Approved" && admin) out.push("cancel", "receive");
  return out;
}

const lineDto = (c: Ctx, l: PurchaseRequest["lines"][number]): PurchaseLineDto => {
  const item = c.db.items.find((x) => x.id === l.itemId);
  const ni = l.newItem;
  const base: PurchaseLineDto = {
    itemId: l.itemId,
    itemName: item?.name ?? ni?.name ?? "-",
    unit: item?.unit ?? ni?.unit ?? "",
    quantity: l.quantity,
    ...(ni ? { newItem: { ...ni, categoryName: c.db.categories.find((x) => x.id === ni.categoryId)?.name ?? "-" } } : {}),
  };
  // Staff never get stock numbers, prices or suppliers (BR-16, PRD 6.6).
  if (!isAdmin(c) || !item) return base;
  return { ...base, currentStock: item.currentStock, minimumStock: item.minimumStock, lastPurchasePrice: item.lastPurchasePrice, preferredSupplierId: item.supplierId };
};

export function purchaseDto(c: Ctx, p: PurchaseRequest): PurchaseDto {
  const lines = p.lines.map((l) => lineDto(c, l));
  const dto: PurchaseDto = {
    id: p.id, number: p.number, requesterId: p.requesterId, requesterName: nameOf(c, p.requesterId), status: p.status,
    neededBy: p.neededBy, reason: p.reason, notes: p.notes, rejectReason: p.rejectReason,
    approvedBy: p.approvedBy, approvedByName: nameOf(c, p.approvedBy), approvedAt: p.approvedAt,
    receivedBy: p.receivedBy, receivedByName: nameOf(c, p.receivedBy), receivedAt: p.receivedAt,
    lineSummary: lines.map((l) => `${l.itemName} x${l.quantity}`).join(", "),
    lines, allowedActions: allowedActions(c, p), createdAt: p.createdAt, updatedAt: p.updatedAt,
  };
  if (!isAdmin(c)) return dto;
  const tx = c.db.transactions.find((x) => x.id === p.transactionId);
  return { ...dto, transactionId: p.transactionId, transactionNumber: tx?.number ?? "", receiptVoided: tx?.status === "Voided" };
}

/** Staff see only their own requests (PRD 3.2); anything else looks like it does not exist. */
const visible = (c: Ctx, p: PurchaseRequest | undefined) => (p && (isAdmin(c) || p.requesterId === c.actor.id) ? p : undefined);

function list({ c, query }: H): Out {
  let rows = c.db.purchaseRequests.filter((p) => visible(c, p));
  const status = filterValue(query, "status");
  if (status) rows = rows.filter((p) => status.split(",").includes(p.status));
  const requester = filterValue(query, "requesterId");
  if (requester && isAdmin(c)) rows = rows.filter((p) => String(p.requesterId) === requester);
  const from = filterValue(query, "from");
  const to = filterValue(query, "to");
  if (from) rows = rows.filter((p) => p.createdAt.slice(0, 10) >= from);
  if (to) rows = rows.filter((p) => p.createdAt.slice(0, 10) <= to);
  const dtos = rows.map((p) => purchaseDto(c, p));
  const search = filterValue(query, "search");
  const found = search ? dtos.filter((p) => matches(search, p.number, p.requesterName, p.lineSummary, p.reason)) : dtos;
  return paged(found, query, {
    number: (r) => r.number, requester: (r) => r.requesterName, neededBy: (r) => r.neededBy, status: (r) => r.status,
  }, "number:desc");
}

function one(h: H): Out {
  const p = visible(h.c, h.c.db.purchaseRequests.find((x) => x.id === id(h)));
  return p ? ok(purchaseDto(h.c, p)) : fail("NOT_FOUND", t.errors.notFound);
}

/** Runs an ops call on a request the user can see and returns the shaped request. */
const act = (h: H, run: (c: Ctx, id: number) => ReturnType<typeof submitPurchase>): Out => {
  if (!visible(h.c, h.c.db.purchaseRequests.find((x) => x.id === id(h)))) return fail("NOT_FOUND", t.errors.notFound);
  const r = run(h.c, id(h));
  return r.ok ? ok(purchaseDto(h.c, r.data)) : r;
};

const split = (h: H) => {
  const { submit, ...input } = h.body;
  return { input: input as unknown as PurchaseInput, submit: submit === true };
};

export const purchaseRoutes: Route[] = [
  { method: "GET", path: "/purchase-requests", run: list },
  { method: "GET", path: "/purchase-requests/:id", run: one },
  {
    method: "POST", path: "/purchase-requests", idempotent: true,
    run: (h) => { const { input, submit } = split(h); const r = createPurchase(h.c, input, submit); return r.ok ? ok(purchaseDto(h.c, r.data)) : r; },
  },
  {
    method: "PUT", path: "/purchase-requests/:id",
    run: (h) => { const { input, submit } = split(h); return act(h, (c, i) => updatePurchaseDraft(c, i, input, submit)); },
  },
  { method: "POST", path: "/purchase-requests/:id/submit", run: (h) => act(h, submitPurchase) },
  { method: "POST", path: "/purchase-requests/:id/cancel", run: (h) => act(h, cancelPurchase) },
  { method: "POST", path: "/purchase-requests/:id/approve", admin: true, run: (h) => act(h, approvePurchase) },
  { method: "POST", path: "/purchase-requests/:id/reject", admin: true, run: (h) => act(h, (c, i) => rejectPurchase(c, i, String(h.body.reason ?? ""))) },
  { method: "POST", path: "/purchase-requests/:id/receive", admin: true, run: (h) => act(h, (c, i) => receivePurchase(c, i, h.body as unknown as ReceiveInput)) },
];
