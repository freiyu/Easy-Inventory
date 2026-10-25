// Stock transactions. Rules are in ops.ts (BR-02..BR-05); this file shapes responses and lists (PRD 6.6).
import type { StockLineDto, StockMovementDto, StockTxDto } from "../../api/stock";
import { t } from "../../strings";
import type { StockTransaction } from "../../types";
import { fail, ok, stockAdjustment, stockIn, stockOut, voidTransaction, type DB } from "../ops";
import { filterValue, paged, searchRows } from "./list";
import type { H, Out, Route } from "./types";

const id = (h: H) => Number(h.params.id);

/** Void applies only to posted IN, OUT and ADJUSTMENT transactions (BR-05). */
const canVoid = (x: StockTransaction) => x.status === "Posted" && ["IN", "OUT", "ADJUSTMENT"].includes(x.type);
const nameOf = <T extends { id: number; name: string }>(list: T[], key: number | null) => list.find((x) => x.id === key)?.name ?? "-";

function toDto(db: DB, x: StockTransaction): StockTxDto {
  const supplierName = nameOf(db.suppliers, x.supplierId);
  const original = db.transactions.find((y) => y.id === x.reversalOfId);
  const reversal = db.transactions.find((y) => y.reversalOfId === x.id);
  const loan = db.loans.find((l) => l.id === x.loanId);
  const lines: StockLineDto[] = x.lines.map((l) => {
    const item = db.items.find((i) => i.id === l.itemId);
    return { ...l, itemName: item?.name ?? "-", itemCode: item?.code ?? "", unit: item?.unit ?? "" };
  });
  const party = x.type === "IN" ? supplierName : x.type === "OUT" ? x.destination : x.type === "ADJUSTMENT" || x.type === "REVERSAL" ? x.reason : x.notes;
  return {
    id: x.id, number: x.number, type: x.type, status: x.status, date: x.date,
    userId: x.userId, userName: nameOf(db.users, x.userId),
    supplierId: x.supplierId, supplierName, destination: x.destination, reason: x.reason, notes: x.notes,
    party: party || "", total: lines.reduce((n, l) => n + (l.total ?? 0), 0),
    reversalOfId: x.reversalOfId, reversalOfNumber: original?.number ?? null,
    voidedById: reversal?.id ?? null, voidedByNumber: reversal?.number ?? null,
    loanId: x.loanId, loanNumber: loan?.number ?? null,
    lines, createdAt: x.createdAt, allowedActions: canVoid(x) ? ["void"] : [],
  };
}

/** Date range and item filters shared by the list and the history. */
function inRange(q: H["query"], date: string) {
  const from = filterValue(q, "from"), to = filterValue(q, "to");
  return (!from || date >= from) && (!to || date <= to);
}

function listTransactions({ c, query }: H): Out {
  const type = filterValue(query, "type"), status = filterValue(query, "status"), itemId = filterValue(query, "itemId");
  let rows = c.db.transactions
    .filter((x) => (!type || x.type === type) && (!status || x.status === status) && inRange(query, x.date))
    .filter((x) => !itemId || x.lines.some((l) => String(l.itemId) === itemId))
    .map((x) => toDto(c.db, x));
  rows = searchRows(rows, query, (r) => [r.number, r.party, ...r.lines.map((l) => l.itemName)]);
  return paged(rows, query, {
    number: (r) => r.number, date: (r) => `${r.date}${String(r.id).padStart(6, "0")}`, type: (r) => r.type,
    party: (r) => r.party, total: (r) => r.total, user: (r) => r.userName, status: (r) => r.status,
  }, "date:desc");
}

function oneTransaction(h: H): Out {
  const tx = h.c.db.transactions.find((x) => x.id === id(h));
  return tx ? ok(toDto(h.c.db, tx)) : fail("NOT_FOUND", t.errors.notFound);
}

function history({ c, query }: H): Out {
  const itemId = filterValue(query, "itemId");
  const rows: StockMovementDto[] = c.db.transactions
    .filter((x) => inRange(query, x.date))
    .flatMap((x) => x.lines
      .filter((l) => !itemId || String(l.itemId) === itemId)
      .map((l) => ({
        transactionId: x.id, number: x.number, type: x.type, date: x.date, itemId: l.itemId,
        itemName: c.db.items.find((i) => i.id === l.itemId)?.name ?? "-",
        quantityChange: l.quantityChange, balanceAfter: l.balanceAfter, userName: nameOf(c.db.users, x.userId),
      })));
  return paged(searchRows(rows, query, (r) => [r.number, r.itemName]), query, {
    date: (r) => `${r.date}${String(r.transactionId).padStart(6, "0")}`, item: (r) => r.itemName,
    quantityChange: (r) => r.quantityChange, balanceAfter: (r) => r.balanceAfter,
  }, "date:desc");
}

// Bodies are validated by Zod on the client; ops.ts repeats the rules that matter.
const post = (run: (h: H) => ReturnType<typeof stockIn>): Route["run"] => (h) => {
  const r = run(h);
  return r.ok ? ok(toDto(h.c.db, r.data)) : r;
};

export const stockRoutes: Route[] = [
  { method: "GET", path: "/stock/transactions", admin: true, run: listTransactions },
  { method: "GET", path: "/stock/transactions/:id", admin: true, run: oneTransaction },
  { method: "GET", path: "/stock/history", admin: true, run: history },
  { method: "POST", path: "/stock/in", admin: true, idempotent: true, run: post((h) => stockIn(h.c, h.body as never)) },
  { method: "POST", path: "/stock/out", admin: true, idempotent: true, run: post((h) => stockOut(h.c, h.body as never)) },
  { method: "POST", path: "/stock/adjustment", admin: true, idempotent: true, run: post((h) => stockAdjustment(h.c, h.body as never)) },
  { method: "POST", path: "/stock/transactions/:id/void", admin: true, run: post((h) => voidTransaction(h.c, id(h), String(h.body.reason ?? ""))) },
];
