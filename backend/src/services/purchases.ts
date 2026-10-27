// Purchase requests (PRD 4.6A, 6.2A, BR-27 to BR-31). Approval reserves nothing; receiving posts one IN
// through the normal incoming rules, after creating any new items, all in one transaction.
import type { Prisma } from "../db";
import { purchaseActions, type PurchaseAction } from "../domain/rules";
import { fail, forbidden, notFound } from "../http";
import { filterId, filterValue, matches, paged, type Query } from "../list";
import { isUnit, type PurchaseInput } from "../schemas";
import { dayDiff, t, type PurchaseStatus } from "../shared";
import { iso, isAdmin, isoOrNull, lockItemNames, lockRow, log, nextNumber, num, once, reader, requestKey, toDate, write, ymd, ymdOrNull, type Ctx, type SessionUser } from "./core";
import { insertItem, lockCategories } from "./master";
import { postIncoming } from "./stock";

const e = t.errors;
const name = { select: { name: true } } as const;
const prInclude = {
  requester: name, approvedBy: name, receivedBy: name,
  transaction: { select: { number: true, status: true } },
  lines: {
    orderBy: { id: "asc" },
    include: {
      item: { select: { name: true, unit: true, currentStock: true, minimumStock: true, lastPurchasePrice: true, supplierId: true } },
      newItemCategory: name,
      newItemSubcategory: name,
    },
  },
} satisfies Prisma.PurchaseRequestInclude;
type PrRow = Prisma.PurchaseRequestGetPayload<{ include: typeof prInclude }>;

function purchaseDto(c: Ctx, p: PrRow) {
  const admin = isAdmin(c);
  const lines = p.lines.map((l) => {
    const ni = l.newItemName ? {
      name: l.newItemName, categoryId: l.newItemCategoryId!, categoryName: l.newItemCategory?.name ?? "-",
      subcategoryId: l.newItemSubcategoryId, subcategoryName: l.newItemSubcategory?.name ?? "-", unit: l.newItemUnit ?? "",
    } : undefined;
    const base = {
      itemId: l.itemId, itemName: l.item?.name ?? ni?.name ?? "-", unit: l.item?.unit ?? ni?.unit ?? "", quantity: l.quantity, ...(ni ? { newItem: ni } : {}),
    };
    // Staff never get stock numbers, prices or suppliers (BR-16, PRD 6.6).
    if (!admin || !l.item) return base;
    return { ...base, currentStock: l.item.currentStock, minimumStock: l.item.minimumStock, lastPurchasePrice: num(l.item.lastPurchasePrice) ?? 0, preferredSupplierId: l.item.supplierId };
  });
  const status = p.status as PurchaseStatus;
  const dto = {
    id: p.id, number: p.number, requesterId: p.requesterId, requesterName: p.requester.name, status,
    neededBy: ymd(p.neededBy), reason: p.reason, notes: p.notes, rejectReason: p.rejectReason,
    approvedBy: p.approvedById, approvedByName: p.approvedBy?.name ?? "-", approvedAt: isoOrNull(p.approvedAt),
    receivedBy: p.receivedById, receivedByName: p.receivedBy?.name ?? "-", receivedAt: ymdOrNull(p.receivedAt),
    lineSummary: lines.map((l) => `${l.itemName} x${l.quantity}`).join(", "),
    lines, allowedActions: purchaseActions({ status, requesterId: p.requesterId }, c.actor), createdAt: iso(p.createdAt), updatedAt: iso(p.updatedAt),
  };
  if (!admin) return dto;
  return { ...dto, transactionId: p.transactionId, transactionNumber: p.transaction?.number ?? "", receiptVoided: p.transaction?.status === "Voided" };
}

/** Staff see only their own requests (PRD 3.2); anything else looks like it does not exist. */
const visibleWhere = (c: Ctx): Prisma.PurchaseRequestWhereInput => (isAdmin(c) ? {} : { requesterId: c.actor.id });

export async function listPurchases(c: Ctx, q: Query) {
  const where: Prisma.PurchaseRequestWhereInput = visibleWhere(c);
  const status = filterValue(q, "status");
  if (status) where.status = { in: status.split(",") };
  const requesterId = filterId(q, "requesterId");
  if (requesterId && isAdmin(c)) where.requesterId = requesterId;
  const from = filterValue(q, "from"), to = filterValue(q, "to");
  // Created date in the application day: from 00:00 of `from` to the end of `to` (Asia/Jakarta, UTC+7).
  if (from || to) where.createdAt = { gte: from ? new Date(`${from}T00:00:00+07:00`) : undefined, lt: to ? new Date(Date.parse(`${to}T00:00:00+07:00`) + 86_400_000) : undefined };
  const dtos = (await c.tx.purchaseRequest.findMany({ where, include: prInclude })).map((p) => purchaseDto(c, p));
  const search = filterValue(q, "search");
  const found = search ? dtos.filter((p) => matches(search, p.number, p.requesterName, p.lineSummary, p.reason)) : dtos;
  return paged(found, q, { number: (r) => r.number, requester: (r) => r.requesterName, neededBy: (r) => r.neededBy, status: (r) => r.status }, "number:desc");
}

export async function onePurchase(c: Ctx, id: number) {
  const p = await c.tx.purchaseRequest.findFirst({ where: { id, ...visibleWhere(c) }, include: prInclude });
  if (!p) throw notFound();
  return purchaseDto(c, p);
}

// ---------------------------------------------------------------------- checks

type Line = { itemId: number | null; quantity: number; newItem?: { name: string; categoryId: number; subcategoryId: number | null; unit: string } };
const lc = (s: string) => s.trim().toLowerCase();

/** BR-24, BR-31, BR-34: existing lines need an active item; new lines a name unique in their category, an active category and subcategory, and a known unit. */
async function checkLines(c: Ctx, lines: Line[]) {
  const seen = new Set<string>();
  for (const [i, l] of lines.entries()) {
    const ni = l.newItem;
    if (l.itemId !== null && ni) throw fail("VALIDATION_ERROR", e.fix, { [`lines.${i}.itemId`]: t.validation.selectItem });
    if (l.itemId === null && (!ni || !ni.name.trim())) throw fail("VALIDATION_ERROR", e.fix, { [`lines.${i}.name`]: t.validation.required(t.fields.itemName) });
    const key = l.itemId !== null ? `item:${l.itemId}` : `new:${ni!.categoryId}:${lc(ni!.name)}`;
    if (seen.has(key)) throw fail("VALIDATION_ERROR", e.fix, { lines: e.duplicateItem });
    seen.add(key);
    if (l.itemId !== null) {
      const item = await c.tx.item.findUnique({ where: { id: l.itemId } });
      if (!item) throw notFound();
      if (item.status !== "Active") throw fail("BUSINESS_RULE_VIOLATION", e.itemInactive(item.name));
      continue;
    }
    const cat = await c.tx.category.findUnique({ where: { id: ni!.categoryId } });
    if (!cat) throw fail("VALIDATION_ERROR", e.fix, { [`lines.${i}.categoryId`]: t.validation.selectCategory });
    if (cat.status !== "Active") throw fail("BUSINESS_RULE_VIOLATION", e.fix, { [`lines.${i}.categoryId`]: e.categoryInactive(cat.name) });
    // Only lines saved before v12 have none (the input schema requires it): say so instead of pointing at a field the receive form lacks.
    if (ni!.subcategoryId === null) throw fail("BUSINESS_RULE_VIOLATION", e.newItemNoSubcategory);
    const sub = await c.tx.subcategory.findUnique({ where: { id: ni!.subcategoryId } });
    if (!sub) throw fail("VALIDATION_ERROR", e.fix, { [`lines.${i}.subcategoryId`]: t.validation.selectSubcategory });
    if (sub.status !== "Active") throw fail("BUSINESS_RULE_VIOLATION", e.fix, { [`lines.${i}.subcategoryId`]: e.subcategoryInactive(sub.name) });
    if (!isUnit(ni!.unit)) throw fail("VALIDATION_ERROR", e.fix, { [`lines.${i}.unit`]: t.validation.selectUnit });
    // Case-insensitive (the database collation compares names that way), within the category (v12).
    if (await c.tx.item.findFirst({ where: { name: ni!.name.trim(), categoryId: ni!.categoryId } })) throw fail("CONFLICT", e.fix, { [`lines.${i}.name`]: e.itemNameTaken });
  }
}

async function checkRequest(c: Ctx, input: PurchaseInput) {
  const requester = await c.tx.user.findUnique({ where: { id: input.requesterId } });
  if (!requester || requester.status !== "Active") throw fail("VALIDATION_ERROR", e.fix, { requesterId: t.validation.selectRequester });
  if (!isAdmin(c) && requester.id !== c.actor.id) throw forbidden();
  if (input.neededBy < c.today) throw fail("VALIDATION_ERROR", e.fix, { neededBy: t.validation.neededPast });
  await checkLines(c, input.lines);
}

const lineData = (lines: Line[]) =>
  lines.map((l) => (l.newItem
    ? { itemId: null, quantity: l.quantity, newItemName: l.newItem.name.trim(), newItemCategoryId: l.newItem.categoryId, newItemSubcategoryId: l.newItem.subcategoryId, newItemUnit: l.newItem.unit }
    : { itemId: l.itemId, quantity: l.quantity }));

type StoredLine = { itemId: number | null; quantity: number; newItemName: string | null; newItemCategoryId: number | null; newItemSubcategoryId: number | null; newItemUnit: string | null };
const storedLines = (rows: StoredLine[]): Line[] =>
  rows.map((l) => (l.itemId === null && l.newItemName
    ? { itemId: null, quantity: l.quantity, newItem: { name: l.newItemName, categoryId: l.newItemCategoryId!, subcategoryId: l.newItemSubcategoryId, unit: l.newItemUnit ?? "" } }
    : { itemId: l.itemId, quantity: l.quantity }));

const VERB: Record<PurchaseAction, [string, PurchaseStatus]> = {
  edit: ["edited", "Draft"], submit: ["submitted", "Draft"], cancel: ["cancelled", "Pending Approval"],
  approve: ["approved", "Pending Approval"], reject: ["rejected", "Pending Approval"], receive: ["received", "Approved"],
};

async function load(c: Ctx, id: number, action: PurchaseAction) {
  await lockRow(c.tx, "purchase_requests", id);
  const p = await c.tx.purchaseRequest.findFirst({ where: { id, ...visibleWhere(c) }, include: { lines: { orderBy: { id: "asc" } } } });
  if (!p) throw notFound();
  const status = p.status as PurchaseStatus;
  if (!purchaseActions({ status, requesterId: p.requesterId }, c.actor).includes(action)) {
    if ((action === "approve" || action === "reject") && p.requesterId === c.actor.id) throw fail("BUSINESS_RULE_VIOLATION", e.selfApprovePurchase);
    if (action === "cancel" && status === "Received") throw fail("BUSINESS_RULE_VIOLATION", e.cancelReceived);
    const [verb, need] = VERB[action];
    const stateOk = action === "cancel" ? ["Draft", "Pending Approval", "Approved"].includes(status) : status === need;
    throw stateOk ? forbidden() : fail("BUSINESS_RULE_VIOLATION", e.purchaseState(verb, need));
  }
  return p;
}

// ---------------------------------------------------------------------- writes

export function createPurchase(actor: SessionUser, input: PurchaseInput) {
  const find = async (k: string) => {
    const p = await reader(actor).tx.purchaseRequest.findUnique({ where: { clientRequestId: requestKey(actor, k)! }, select: { id: true } });
    return p?.id ?? null;
  };
  const create = () => write(actor, async (c) => {
    await checkRequest(c, input);
    const p = await c.tx.purchaseRequest.create({
      data: {
        number: await nextNumber(c.tx, "PR", c.today), requesterId: input.requesterId, status: input.submit ? "Pending Approval" : "Draft",
        neededBy: toDate(input.neededBy), reason: input.reason, notes: input.notes, rejectReason: "",
        clientRequestId: requestKey(actor, input.clientRequestId), lines: { create: lineData(input.lines) },
      },
    });
    await log(c, input.submit ? "Purchase request submitted" : "Purchase request draft saved", "Purchases", p.number);
    return p.id;
  });
  return once(input.clientRequestId, find, create).then((id) => onePurchase(reader(actor), id));
}

export function updatePurchaseDraft(actor: SessionUser, id: number, input: PurchaseInput) {
  return write(actor, async (c) => {
    const p = await load(c, id, "edit");
    await checkRequest(c, input);
    await c.tx.purchaseRequestItem.deleteMany({ where: { purchaseRequestId: id } });
    await c.tx.purchaseRequest.update({
      where: { id },
      data: {
        requesterId: input.requesterId, neededBy: toDate(input.neededBy), reason: input.reason, notes: input.notes,
        status: input.submit ? "Pending Approval" : "Draft", lines: { create: lineData(input.lines) },
      },
    });
    await log(c, input.submit ? "Purchase request submitted" : "Purchase request draft saved", "Purchases", p.number);
    return onePurchase(c, id);
  });
}

export function submitPurchase(actor: SessionUser, id: number) {
  return write(actor, async (c) => {
    const p = await load(c, id, "submit");
    if (ymd(p.neededBy) < c.today) throw fail("VALIDATION_ERROR", e.fix, { neededBy: t.validation.neededPast });
    await checkLines(c, storedLines(p.lines));
    await c.tx.purchaseRequest.update({ where: { id }, data: { status: "Pending Approval" } });
    await log(c, "Purchase request submitted", "Purchases", p.number);
    return onePurchase(c, id);
  });
}

export function cancelPurchase(actor: SessionUser, id: number) {
  return write(actor, async (c) => {
    const p = await load(c, id, "cancel");
    await c.tx.purchaseRequest.update({ where: { id }, data: { status: "Cancelled" } });
    await log(c, "Purchase request cancelled", "Purchases", p.number);
    return onePurchase(c, id);
  });
}

/** BR-27, BR-29: never your own; approving reserves nothing. */
export function approvePurchase(actor: SessionUser, id: number) {
  return write(actor, async (c) => {
    const p = await load(c, id, "approve");
    await c.tx.purchaseRequest.update({ where: { id }, data: { status: "Approved", approvedById: actor.id, approvedAt: c.now } });
    await log(c, "Purchase request approved", "Purchases", p.number);
    return onePurchase(c, id);
  });
}

export function rejectPurchase(actor: SessionUser, id: number, reason: string) {
  return write(actor, async (c) => {
    const p = await load(c, id, "reject");
    await c.tx.purchaseRequest.update({ where: { id }, data: { status: "Rejected", rejectReason: reason, approvedById: actor.id, approvedAt: c.now } });
    await log(c, "Purchase request rejected", "Purchases", p.number, reason);
    return onePurchase(c, id);
  });
}

/**
 * BR-28, BR-31: full receipt, once. New-item lines become items (stock 0, generated code), then one IN posts the
 * requested quantities. All checks run first and everything is one transaction, so a failure leaves nothing behind.
 */
export function receivePurchase(actor: SessionUser, id: number, input: { date: string; supplierId: number; lines: { unitPrice: number; minimumStock: number }[]; notes: string }) {
  return write(actor, async (c) => {
    const p = await load(c, id, "receive");
    if (dayDiff(c.today, input.date) > 0) throw fail("VALIDATION_ERROR", e.fix, { date: e.receiveFuture });
    if (input.lines.length !== p.lines.length) throw fail("VALIDATION_ERROR", e.fix, { lines: t.validation.atLeastOneLine });
    const supplier = await c.tx.supplier.findUnique({ where: { id: input.supplierId } });
    if (!supplier) throw fail("VALIDATION_ERROR", e.fix, { supplierId: t.validation.selectSupplier });
    if (supplier.status !== "Active") throw fail("BUSINESS_RULE_VIOLATION", e.supplierInactive(supplier.name));
    const lines = storedLines(p.lines);
    if (lines.some((l) => l.newItem)) await lockItemNames(c.tx);
    await checkLines(c, lines);

    const news = lines.flatMap((l) => (l.newItem ? [l.newItem] : []));
    await lockCategories(c.tx, news.map((n) => n.categoryId), news.map((n) => n.subcategoryId!));
    const itemIds: number[] = [];
    for (const [i, l] of lines.entries()) {
      if (l.itemId !== null) { itemIds.push(l.itemId); continue; }
      const ni = l.newItem!;
      itemIds.push(await insertItem(c, {
        name: ni.name, categoryId: ni.categoryId, subcategoryId: ni.subcategoryId!, unit: ni.unit, openingStock: 0, minimumStock: input.lines[i].minimumStock,
        lastPurchasePrice: input.lines[i].unitPrice, supplierId: supplier.id, location: "", status: "Active", notes: "",
      }));
    }
    const transactionId = await postIncoming(c, {
      date: input.date, supplierId: supplier.id, notes: input.notes ? `${p.number}. ${input.notes}` : p.number,
      lines: lines.map((l, i) => ({ itemId: itemIds[i], quantity: l.quantity, unitPrice: input.lines[i].unitPrice })),
    });
    for (const [i, row] of p.lines.entries()) {
      if (row.itemId === null) await c.tx.purchaseRequestItem.update({ where: { id: row.id }, data: { itemId: itemIds[i] } });
    }
    await c.tx.purchaseRequest.update({
      where: { id }, data: { status: "Received", receivedById: actor.id, receivedAt: toDate(input.date), transactionId },
    });
    await log(c, "Purchase request received", "Purchases", p.number);
    return onePurchase(c, id);
  });
}
