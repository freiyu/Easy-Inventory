// Stock transactions and the ledger (PRD 4.5, BR-02 to BR-05, BR-18, BR-19). Admin only.
// The ledger can be large (PRD 6.8), so these lists page in SQL.
import type { Prisma } from "../db";
import { totalsByItem } from "../domain/rules";
import { fail, notFound } from "../http";
import { clampPage, filterId, filterValue, pageParams, sortParam, type Query } from "../list";
import { t, type StockTxType } from "../shared";
import {
  assertActive, iso, lockItems, lockRow, log, num, once, postTransaction, reader, requestKey, reservedByItem, toDate, write, ymd, type Ctx, type SessionUser,
} from "./core";

const e = t.errors;
const VOIDABLE = ["IN", "OUT", "ADJUSTMENT"];

const txInclude = {
  user: { select: { name: true } },
  supplier: { select: { name: true } },
  reversalOf: { select: { number: true } },
  reversedBy: { select: { id: true, number: true } },
  loan: { select: { number: true } },
  lines: { orderBy: { id: "asc" }, include: { item: { select: { name: true, code: true, unit: true } } } },
} satisfies Prisma.StockTransactionInclude;
type TxRow = Prisma.StockTransactionGetPayload<{ include: typeof txInclude }>;

function txDto(x: TxRow) {
  const lines = x.lines.map((l) => ({
    itemId: l.itemId, itemName: l.item.name, itemCode: l.item.code, unit: l.item.unit,
    quantityChange: l.quantityChange, balanceAfter: l.balanceAfter, unitPrice: num(l.unitPrice), total: num(l.total),
  }));
  const supplierName = x.supplier?.name ?? "-";
  const party = x.type === "IN" ? supplierName : x.type === "OUT" ? x.destination : x.type === "ADJUSTMENT" || x.type === "REVERSAL" ? x.reason : x.notes;
  return {
    id: x.id, number: x.number, type: x.type as StockTxType, status: x.status as "Posted" | "Voided", date: ymd(x.date),
    userId: x.userId, userName: x.user.name, supplierId: x.supplierId, supplierName, destination: x.destination, reason: x.reason, notes: x.notes,
    party: party || "", total: lines.reduce((n, l) => n + (l.total ?? 0), 0),
    reversalOfId: x.reversalOfId, reversalOfNumber: x.reversalOf?.number ?? null,
    voidedById: x.reversedBy?.id ?? null, voidedByNumber: x.reversedBy?.number ?? null,
    loanId: x.loanId, loanNumber: x.loan?.number ?? null,
    lines, createdAt: iso(x.createdAt), allowedActions: (x.status === "Posted" && VOIDABLE.includes(x.type) ? ["void"] : []) as "void"[],
  };
}

const dateRange = (q: Query) => {
  const from = filterValue(q, "from"), to = filterValue(q, "to");
  return from || to ? { gte: from ? toDate(from) : undefined, lte: to ? toDate(to) : undefined } : undefined;
};

export async function listTransactions(c: Ctx, q: Query) {
  const where: Prisma.StockTransactionWhereInput = {};
  const type = filterValue(q, "type"), status = filterValue(q, "status"), itemId = filterId(q, "itemId"), search = filterValue(q, "search");
  if (type) where.type = type;
  if (status) where.status = status;
  const date = dateRange(q);
  if (date) where.date = date;
  if (itemId) where.lines = { some: { itemId } };
  if (search) {
    // The database collation compares without regard to case.
    where.OR = [
      { number: { contains: search } }, { destination: { contains: search } }, { reason: { contains: search } }, { notes: { contains: search } },
      { supplier: { name: { contains: search } } }, { lines: { some: { item: { name: { contains: search } } } } },
    ];
  }
  const [field, dir] = sortParam(q, ["number", "date", "type", "party", "total", "user", "status"], "date:desc");
  const { page: want, pageSize } = pageParams(q);
  const total = await c.tx.stockTransaction.count({ where });
  const page = clampPage(want, pageSize, total);
  const skip = (page - 1) * pageSize;
  let rows: TxRow[];
  if (field === "total") {
    // Totals are not stored (BR-15), so page over the summed lines.
    const ids = await c.tx.stockTransactionItem.groupBy({
      by: ["transactionId"], where: { transaction: where }, _sum: { total: true },
      orderBy: [{ _sum: { total: dir } }, { transactionId: "desc" }], skip, take: pageSize,
    });
    const found = await c.tx.stockTransaction.findMany({ where: { id: { in: ids.map((r) => r.transactionId) } }, include: txInclude });
    rows = ids.map((r) => found.find((x) => x.id === r.transactionId)!);
  } else {
    const orderBy: Prisma.StockTransactionOrderByWithRelationInput[] = {
      number: [{ number: dir }],
      date: [{ date: dir }, { id: dir }],
      type: [{ type: dir }, { id: "desc" as const }],
      party: [{ supplier: { name: dir } }, { destination: dir }, { reason: dir }, { notes: dir }],
      user: [{ user: { name: dir } }, { id: "desc" as const }],
      status: [{ status: dir }, { id: "desc" as const }],
    }[field]!;
    rows = await c.tx.stockTransaction.findMany({ where, include: txInclude, orderBy, skip, take: pageSize });
  }
  return { rows: rows.map(txDto), meta: { page, pageSize, total } };
}

export async function oneTransaction(c: Ctx, id: number) {
  const x = await c.tx.stockTransaction.findUnique({ where: { id }, include: txInclude });
  if (!x) throw notFound();
  return txDto(x);
}

/** Ledger lines (GET /stock/history and the movements report). */
export async function ledger(c: Ctx, q: Query, opts: { report: boolean }) {
  const tw: Prisma.StockTransactionWhereInput = {};
  const date = dateRange(q);
  if (date) tw.date = date;
  const type = filterValue(q, "type");
  if (opts.report && type) tw.type = type;
  const where: Prisma.StockTransactionItemWhereInput = { transaction: tw };
  const itemId = filterId(q, "itemId");
  if (itemId) where.itemId = itemId;
  const search = filterValue(q, "search");
  if (search) {
    where.OR = [
      { transaction: { number: { contains: search } } }, { item: { name: { contains: search } } },
      ...(opts.report ? [{ transaction: { user: { name: { contains: search } } } }] : []),
    ];
  }
  const known = opts.report ? ["date", "item", "type", "change", "balance", "user", "ref"] : ["date", "item", "quantityChange", "balanceAfter"];
  const [field, dir] = sortParam(q, known, "date:desc");
  const orderBy: Prisma.StockTransactionItemOrderByWithRelationInput[] = {
    date: [{ transaction: { date: dir } }, { transactionId: dir }, { id: dir }],
    item: [{ item: { name: dir } }, { id: "desc" as const }],
    type: [{ transaction: { type: dir } }, { id: "desc" as const }],
    change: [{ quantityChange: dir }, { id: "desc" as const }],
    quantityChange: [{ quantityChange: dir }, { id: "desc" as const }],
    balance: [{ balanceAfter: dir }, { id: "desc" as const }],
    balanceAfter: [{ balanceAfter: dir }, { id: "desc" as const }],
    user: [{ transaction: { user: { name: dir } } }, { id: "desc" as const }],
    ref: [{ transaction: { number: dir } }, { id: "desc" as const }],
  }[field]!;
  const { page: want, pageSize } = pageParams(q);
  const total = await c.tx.stockTransactionItem.count({ where });
  const page = clampPage(want, pageSize, total);
  const lines = await c.tx.stockTransactionItem.findMany({
    where, orderBy, skip: (page - 1) * pageSize, take: pageSize,
    include: { item: { select: { name: true } }, transaction: { select: { id: true, number: true, type: true, date: true, user: { select: { name: true } } } } },
  });
  const rows = lines.map((l) => {
    const base = {
      number: l.transaction.number, type: l.transaction.type as StockTxType, date: ymd(l.transaction.date), itemName: l.item.name,
      quantityChange: l.quantityChange, balanceAfter: l.balanceAfter, userName: l.transaction.user.name,
    };
    return opts.report
      ? { key: `${l.transaction.id}-${l.id}`, txId: l.transaction.id, ...base }
      : { transactionId: l.transaction.id, itemId: l.itemId, ...base };
  });
  return { rows, meta: { page, pageSize, total } };
}

// ---------------------------------------------------------------------- writes

/** BR-19: the same clientRequestId from the same user returns the first transaction. */
function idempotent(actor: SessionUser, key: string | undefined, create: () => Promise<number>) {
  const find = async (k: string) => {
    const x = await reader(actor).tx.stockTransaction.findUnique({ where: { clientRequestId: requestKey(actor, k)! }, select: { id: true } });
    return x?.id ?? null;
  };
  return once(key, find, create).then((id) => oneTransaction(reader(actor), id));
}

export interface IncomingInput {
  date: string;
  supplierId: number;
  lines: { itemId: number; quantity: number; unitPrice: number }[];
  notes: string;
  clientRequestId?: string;
}

/** Incoming stock. Also used when a purchase request is received (BR-28). Returns the transaction id. */
export async function postIncoming(c: Ctx, input: IncomingInput): Promise<number> {
  const supplier = await c.tx.supplier.findUnique({ where: { id: input.supplierId } });
  if (!supplier) throw fail("VALIDATION_ERROR", e.fix, { supplierId: t.validation.selectSupplier });
  if (supplier.status !== "Active") throw fail("BUSINESS_RULE_VIOLATION", e.supplierInactive(supplier.name));
  assertActive((await lockItems(c.tx, input.lines.map((l) => l.itemId))).values());
  const id = await postTransaction(c, {
    type: "IN", date: input.date, supplierId: supplier.id, notes: input.notes, clientRequestId: input.clientRequestId,
    lines: input.lines.map((l) => ({ itemId: l.itemId, change: l.quantity, unitPrice: l.unitPrice })),
  });
  await log(c, "Incoming stock posted", "Stock", await numberOf(c, id));
  return id;
}

export function stockIn(actor: SessionUser, input: IncomingInput) {
  return idempotent(actor, input.clientRequestId, () => write(actor, (c) => postIncoming(c, input)));
}

/** Outgoing stock must not use units reserved by approved loans (PRD 4.5, BR-07). */
export function stockOut(actor: SessionUser, input: { date: string; destination: string; lines: { itemId: number; quantity: number }[]; notes: string; clientRequestId?: string }) {
  return idempotent(actor, input.clientRequestId, () => write(actor, async (c) => {
    const items = await lockItems(c.tx, input.lines.map((l) => l.itemId));
    assertActive(items.values());
    const reserved = await reservedByItem(c.tx, [...items.keys()]);
    for (const [itemId, qty] of totalsByItem(input.lines)) {
      const free = items.get(itemId)!.currentStock - (reserved.get(itemId) ?? 0);
      if (qty > free) {
        const msg = e.insufficient(Math.max(0, free));
        throw fail("INSUFFICIENT_STOCK", msg, { [`lines.${input.lines.findIndex((l) => l.itemId === itemId)}.quantity`]: msg });
      }
    }
    const id = await postTransaction(c, {
      type: "OUT", date: input.date, destination: input.destination, notes: input.notes, clientRequestId: input.clientRequestId,
      lines: input.lines.map((l) => ({ itemId: l.itemId, change: -l.quantity })),
    });
    await log(c, "Outgoing stock posted", "Stock", await numberOf(c, id));
    return id;
  }));
}

export function stockAdjustment(actor: SessionUser, input: { date: string; itemId: number; physical: number; reason: string; clientRequestId?: string }) {
  return idempotent(actor, input.clientRequestId, () => write(actor, async (c) => {
    const item = (await lockItems(c.tx, [input.itemId])).get(input.itemId)!;
    assertActive([item]);
    const diff = input.physical - item.currentStock;
    if (diff === 0) throw fail("VALIDATION_ERROR", e.fix, { physical: t.validation.differenceZero });
    const id = await postTransaction(c, {
      type: "ADJUSTMENT", date: input.date, reason: input.reason, clientRequestId: input.clientRequestId, lines: [{ itemId: item.id, change: diff }],
    });
    await log(c, "Stock adjusted", "Stock", await numberOf(c, id), input.reason);
    return id;
  }));
}

const numberOf = async (c: Ctx, id: number) => (await c.tx.stockTransaction.findUniqueOrThrow({ where: { id }, select: { number: true } })).number;

/** BR-04, BR-05: a void posts a linked reversal, once, and never makes stock negative. */
export function voidTransaction(actor: SessionUser, id: number, reason: string) {
  return write(actor, async (c) => {
    await lockRow(c.tx, "stock_transactions", id);
    const x = await c.tx.stockTransaction.findUniqueOrThrow({ where: { id }, include: { lines: true } });
    if (!VOIDABLE.includes(x.type)) throw fail("BUSINESS_RULE_VIOLATION", e.voidLoanMovement);
    if (x.status === "Voided") throw fail("BUSINESS_RULE_VIOLATION", e.voidAlready);
    try {
      await postTransaction(c, { type: "REVERSAL", date: c.today, reason, reversalOfId: x.id, lines: x.lines.map((l) => ({ itemId: l.itemId, change: -l.quantityChange })) });
    } catch (err) {
      throw (err as { code?: string }).code === "INSUFFICIENT_STOCK" ? fail("BUSINESS_RULE_VIOLATION", e.voidNegative) : err;
    }
    await c.tx.stockTransaction.update({ where: { id }, data: { status: "Voided" } });
    if (x.type === "IN") {
      // The last purchase price follows the latest remaining posted incoming line of each item.
      for (const l of x.lines) {
        const latest = await c.tx.stockTransactionItem.findFirst({
          where: { itemId: l.itemId, transaction: { type: "IN", status: "Posted" } },
          orderBy: [{ transaction: { date: "desc" } }, { transactionId: "desc" }],
          select: { unitPrice: true },
        });
        await c.tx.item.update({ where: { id: l.itemId }, data: { lastPurchasePrice: latest?.unitPrice ?? 0 } });
      }
    }
    await log(c, "Transaction voided", "Stock", x.number, reason);
    return oneTransaction(c, id);
  });
}
