// Shared service plumbing: the request context, write transactions, row locks, readable numbers,
// the activity log and the single function that changes stock (BR-02, BR-03, PRD 7.4).
import { prisma, Prisma, type Tx } from "../db";
import { formatSequence, sequenceKey } from "../domain/rules";
import { fail, isWriteConflict, notFound } from "../http";
import { t, today, type Role, type StockTxType } from "../shared";

export interface SessionUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  status: "Active" | "Inactive";
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface Ctx {
  tx: Tx;
  actor: SessionUser;
  now: Date;
  /** Calendar date in the application time zone, "YYYY-MM-DD" (PRD 2.7). */
  today: string;
}

export const isAdmin = (c: { actor: SessionUser }) => c.actor.role === "Admin";

/** Read-only context on the shared client. */
export const reader = (actor: SessionUser): Ctx => ({ tx: prisma, actor, now: new Date(), today: today() });

/**
 * Runs a write in one transaction (PRD 7.2, 7.4). READ COMMITTED so every read after a row lock sees the
 * latest committed data; with MySQL's default REPEATABLE READ a snapshot taken before the lock could be stale.
 * A deadlock rolls the whole transaction back, so it is safe to run it again; `run` must not have
 * side effects outside the transaction.
 */
export async function write<T>(actor: SessionUser, run: (c: Ctx) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction((tx) => run({ tx, actor, now: new Date(), today: today() }), {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 10_000,
        timeout: 30_000,
      });
    } catch (err) {
      if (!isWriteConflict(err) || attempt >= WRITE_ATTEMPTS) throw err;
    }
  }
}
const WRITE_ATTEMPTS = 3;

// ------------------------------------------------------------------ dates and numbers

export const toDate = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
export const ymd = (d: Date) => d.toISOString().slice(0, 10);
export const ymdOrNull = (d: Date | null) => (d ? ymd(d) : null);
export const iso = (d: Date) => d.toISOString();
export const isoOrNull = (d: Date | null) => (d ? d.toISOString() : null);
export const num = (d: Prisma.Decimal | number | null) => (d === null ? null : Number(d));
const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" });
/** The calendar day of a timestamp in the application time zone (PRD 2.7), "YYYY-MM-DD". */
export const localDay = (d: Date) => dayFormat.format(d);

/** BR-23: the counter row stays locked until commit, so two requests never get the same number. Returns 1, 2, 3, ... */
export async function counter(tx: Tx, key: string): Promise<number> {
  await tx.$executeRaw`INSERT INTO number_sequences (\`key\`, value) VALUES (${key}, 1) ON DUPLICATE KEY UPDATE value = value + 1`;
  const [row] = await tx.$queryRaw<{ value: number }[]>`SELECT value FROM number_sequences WHERE \`key\` = ${key}`;
  return Number(row.value);
}

export async function nextNumber(tx: Tx, prefix: string, date: string): Promise<string> {
  const key = sequenceKey(prefix, date);
  return formatSequence(key, await counter(tx, key));
}

// ------------------------------------------------------------------------ locks

/**
 * Serializes writers that check new item names (purchase receive BR-31, CSV import BR-33): a sentinel counter row
 * stays locked until commit, so two of them cannot both pass the name check. Take it before locking categories.
 */
export async function lockItemNames(tx: Tx): Promise<void> {
  await tx.$executeRaw`INSERT INTO number_sequences (\`key\`, value) VALUES ('lock:item-names', 0) ON DUPLICATE KEY UPDATE value = value`;
}

type Lockable = "loans" | "purchase_requests" | "stock_transactions" | "users";

/** Locks one document row until commit, so two Admins cannot move the same loan or request at once. */
export async function lockRow(tx: Tx, table: Lockable, id: number): Promise<void> {
  const rows = await tx.$queryRawUnsafe<{ id: number }[]>(`SELECT id FROM \`${table}\` WHERE id = ? FOR UPDATE`, id);
  if (rows.length === 0) throw notFound();
}

/** Locks item rows in id order (PRD 7.4: consistent order avoids deadlocks) and returns them fresh. */
export async function lockItems(tx: Tx, ids: number[]) {
  const sorted = [...new Set(ids)].sort((a, b) => a - b);
  if (sorted.length === 0) return new Map<number, Prisma.ItemGetPayload<object>>();
  await tx.$queryRaw`SELECT id FROM items WHERE id IN (${Prisma.join(sorted)}) ORDER BY id FOR UPDATE`;
  const items = await tx.item.findMany({ where: { id: { in: sorted } } });
  const map = new Map(items.map((i) => [i.id, i]));
  if (map.size !== sorted.length) throw notFound();
  return map;
}

/** BR-24: inactive items cannot be used in new transactions, loans or requests. */
export function assertActive(items: Iterable<{ name: string; status: string }>) {
  for (const i of items) if (i.status !== "Active") throw fail("BUSINESS_RULE_VIOLATION", t.errors.itemInactive(i.name));
}

/** BR-07: quantity held by Approved loans, per item, optionally leaving one loan out. */
export async function reservedByItem(tx: Tx, itemIds?: number[], excludeLoanId?: number): Promise<Map<number, number>> {
  const rows = await tx.loanItem.groupBy({
    by: ["itemId"],
    where: {
      loan: { status: "Approved", ...(excludeLoanId ? { id: { not: excludeLoanId } } : {}) },
      ...(itemIds ? { itemId: { in: itemIds } } : {}),
    },
    _sum: { quantity: true },
  });
  return new Map(rows.map((r) => [r.itemId, r._sum.quantity ?? 0]));
}

// ---------------------------------------------------------------- activity log

export async function log(c: Ctx, action: string, module: string, reference = "", metadata = "") {
  await c.tx.activityLog.create({
    data: { userId: c.actor.id, action, module, reference: reference.slice(0, 200), ...(metadata ? { metadata } : {}) },
  });
}

// ------------------------------------------------------------------ stock core

const TX_PREFIX: Record<StockTxType, string> = {
  IN: "IN",
  OUT: "OUT",
  ADJUSTMENT: "ADJ",
  LOAN_ISSUE: "LIS",
  LOAN_RETURN: "LRT",
  REVERSAL: "REV",
};

export interface PostInput {
  type: StockTxType;
  date: string;
  supplierId?: number | null;
  destination?: string;
  reason?: string;
  notes?: string;
  reversalOfId?: number | null;
  loanId?: number | null;
  clientRequestId?: string;
  lines: { itemId: number; change: number; unitPrice?: number }[];
}

/**
 * The only place that changes stock (BR-02). Locks the items, re-checks the balance inside the transaction,
 * never lets stock go below zero (BR-03), writes the ledger with balance after (BR-18). Returns the transaction id.
 */
export async function postTransaction(c: Ctx, input: PostInput): Promise<number> {
  const items = await lockItems(c.tx, input.lines.map((l) => l.itemId));
  const balance = new Map([...items].map(([id, i]) => [id, i.currentStock]));
  const delta = new Map<number, number>();
  for (const l of input.lines) delta.set(l.itemId, (delta.get(l.itemId) ?? 0) + l.change);
  for (const [itemId, change] of delta) {
    const item = items.get(itemId)!;
    if (item.currentStock + change < 0) {
      throw fail("INSUFFICIENT_STOCK", t.errors.insufficient(item.currentStock), { itemId: item.name });
    }
  }
  const isIn = input.type === "IN";
  const lastPrice = new Map<number, number>();
  const lines = input.lines.map((l) => {
    const after = balance.get(l.itemId)! + l.change;
    balance.set(l.itemId, after);
    const price = isIn ? (l.unitPrice ?? 0) : null;
    if (price !== null) lastPrice.set(l.itemId, price);
    return { itemId: l.itemId, quantityChange: l.change, balanceAfter: after, unitPrice: price, total: price === null ? null : price * l.change };
  });
  const created = await c.tx.stockTransaction.create({
    data: {
      number: await nextNumber(c.tx, TX_PREFIX[input.type], input.date),
      type: input.type,
      date: toDate(input.date),
      userId: c.actor.id,
      supplierId: input.supplierId ?? null,
      destination: input.destination ?? "",
      reason: input.reason ?? "",
      notes: input.notes ?? "",
      reversalOfId: input.reversalOfId ?? null,
      loanId: input.loanId ?? null,
      clientRequestId: requestKey(c.actor, input.clientRequestId),
      lines: { create: lines },
    },
    select: { id: true },
  });
  for (const [itemId, after] of balance) {
    const price = lastPrice.get(itemId);
    await c.tx.item.update({
      where: { id: itemId },
      data: { currentStock: after, ...(price !== undefined ? { lastPurchasePrice: price } : {}) },
    });
  }
  return created.id;
}

/** BR-19 keys are per user: the stored key carries the user id, so two users can never collide. */
export const requestKey = (actor: { id: number }, key?: string) => (key ? `${actor.id}:${key}` : null);

/**
 * BR-19: a repeated clientRequestId returns the first result instead of creating a second record.
 */
export async function once<T>(key: string | undefined, find: (key: string) => Promise<T | null>, create: () => Promise<T>): Promise<T> {
  if (!key) return create();
  const prior = await find(key);
  if (prior) return prior;
  try {
    return await create();
  } catch (err) {
    // Two identical requests raced: the unique client_request_id stopped the second one.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const again = await find(key);
      if (again) return again;
    }
    throw err;
  }
}
