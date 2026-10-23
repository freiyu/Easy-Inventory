// Mock business operations on an in-memory DB. They mirror the API contract (PRD 6.6)
// and business rules (PRD 6.4). The real backend re-implements them (Stage 3).
import { BACKUP_RETENTION } from "../constants";
import { dayDiff } from "../format";
import { availableForLoan, reservedQuantity, returnFloor, totalsByItem } from "../rules";
import type {
  AdjustmentInput,
  CategoryInput,
  IncomingInput,
  ItemInput,
  LoanInput,
  OutgoingInput,
  ReturnInput,
  SupplierInput,
  UserInput,
} from "../schemas";
import { t } from "../strings";
import type {
  ActivityEntry,
  ApiError,
  BackupFile,
  Category,
  Item,
  Loan,
  Result,
  StockLine,
  StockTransaction,
  StockTxType,
  Supplier,
  User,
} from "../types";

export interface DB {
  users: User[];
  categories: Category[];
  suppliers: Supplier[];
  items: Item[];
  transactions: StockTransaction[];
  loans: Loan[];
  activity: ActivityEntry[];
  backups: BackupFile[];
  seq: Record<string, number>;
  ids: Record<string, number>;
}

export interface Ctx {
  db: DB;
  actor: User;
  /** Timestamp of the action (ISO, UTC). */
  now: string;
  /** Calendar date of the action in the app time zone, "YYYY-MM-DD". */
  today: string;
}

const e = t.errors;
export const ok = <T>(data: T): Result<T> => ({ ok: true, data });
export const fail = (
  code: ApiError["code"],
  message: string,
  fields?: Record<string, string>,
): Result<never> => ({ ok: false, error: { code, message, fields } });

const TX_PREFIX: Record<StockTxType, string> = {
  IN: "IN",
  OUT: "OUT",
  ADJUSTMENT: "ADJ",
  LOAN_ISSUE: "LIS",
  LOAN_RETURN: "LRT",
  REVERSAL: "REV",
};

export function nextId(db: DB, key: string): number {
  db.ids[key] = (db.ids[key] ?? 0) + 1;
  return db.ids[key];
}

/** BR-23: readable, unique numbers such as IN-202610-0001. */
export function nextNumber(db: DB, prefix: string, date: string): string {
  const key = `${prefix}-${date.slice(0, 4)}${date.slice(5, 7)}`;
  db.seq[key] = (db.seq[key] ?? 0) + 1;
  return `${key}-${String(db.seq[key]).padStart(4, "0")}`;
}

export function log(
  { db, actor, now }: Ctx,
  action: string,
  module: string,
  reference = "",
  metadata = "",
) {
  db.activity.unshift({
    id: nextId(db, "activity"),
    userId: actor.id,
    action,
    module,
    reference,
    metadata,
    createdAt: now,
  });
}

const findItem = (db: DB, id: number) => db.items.find((i) => i.id === id);
const badQuantity = (lines: { quantity: number }[]) =>
  lines.some((l) => !Number.isInteger(l.quantity) || l.quantity <= 0)
    ? fail("VALIDATION_ERROR", e.fix, { lines: t.validation.positive(t.fields.quantity) })
    : null;
const needReason = (reason: string) =>
  reason.trim() ? null : fail("VALIDATION_ERROR", e.fix, { reason: t.validation.required(t.fields.reason) });
const lc = (s: string) => s.trim().toLowerCase();
const requireAdmin = (c: Ctx) =>
  c.actor.role === "Admin" ? null : fail("FORBIDDEN", e.forbidden);

// ---------------------------------------------------------------- stock core

interface PostLine {
  itemId: number;
  change: number;
  unitPrice?: number;
}

interface PostInput {
  type: StockTxType;
  date: string;
  supplierId?: number | null;
  destination?: string;
  reason?: string;
  notes?: string;
  reversalOfId?: number | null;
  loanId?: number | null;
  lines: PostLine[];
}

/** Single place that changes stock (BR-02). Never lets stock go below zero (BR-03). */
export function postTransaction(c: Ctx, input: PostInput): Result<StockTransaction> {
  const { db } = c;
  const delta = new Map<number, number>();
  for (const l of input.lines) delta.set(l.itemId, (delta.get(l.itemId) ?? 0) + l.change);
  for (const [itemId, change] of delta) {
    const item = findItem(db, itemId);
    if (!item) return fail("NOT_FOUND", e.notFound);
    if (item.currentStock + change < 0) {
      return fail("INSUFFICIENT_STOCK", e.insufficient(item.currentStock), {
        itemId: item.name,
      });
    }
  }
  const lines: StockLine[] = input.lines.map((l) => {
    const item = findItem(db, l.itemId)!;
    item.currentStock += l.change;
    item.updatedAt = c.now;
    const isIn = input.type === "IN";
    if (isIn && l.unitPrice !== undefined) item.lastPurchasePrice = l.unitPrice;
    return {
      itemId: l.itemId,
      quantityChange: l.change,
      balanceAfter: item.currentStock,
      unitPrice: isIn ? (l.unitPrice ?? 0) : null,
      total: isIn ? l.change * (l.unitPrice ?? 0) : null,
    };
  });
  const tx: StockTransaction = {
    id: nextId(db, "transaction"),
    number: nextNumber(db, TX_PREFIX[input.type], input.date),
    type: input.type,
    status: "Posted",
    date: input.date,
    userId: c.actor.id,
    supplierId: input.supplierId ?? null,
    destination: input.destination ?? "",
    reason: input.reason ?? "",
    notes: input.notes ?? "",
    reversalOfId: input.reversalOfId ?? null,
    loanId: input.loanId ?? null,
    lines,
    createdAt: c.now,
  };
  db.transactions.unshift(tx);
  return ok(tx);
}

function checkActiveItems(db: DB, ids: number[]): Result<never> | null {
  for (const id of ids) {
    const item = findItem(db, id);
    if (!item) return fail("NOT_FOUND", e.notFound);
    if (item.status !== "Active") return fail("BUSINESS_RULE_VIOLATION", e.itemInactive(item.name));
  }
  return null;
}

export function stockIn(c: Ctx, input: IncomingInput): Result<StockTransaction> {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const supplier = c.db.suppliers.find((s) => s.id === input.supplierId);
  if (!supplier) return fail("VALIDATION_ERROR", e.fix, { supplierId: t.validation.selectSupplier });
  if (supplier.status !== "Active") return fail("BUSINESS_RULE_VIOLATION", e.supplierInactive(supplier.name));
  const bad = badQuantity(input.lines) ?? checkActiveItems(c.db, input.lines.map((l) => l.itemId));
  if (bad) return bad;
  const r = postTransaction(c, {
    type: "IN",
    date: input.date,
    supplierId: input.supplierId,
    notes: input.notes,
    lines: input.lines.map((l) => ({ itemId: l.itemId, change: l.quantity, unitPrice: l.unitPrice })),
  });
  if (r.ok) log(c, "Incoming stock posted", "Stock", r.data.number);
  return r;
}

export function stockOut(c: Ctx, input: OutgoingInput): Result<StockTransaction> {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const bad = badQuantity(input.lines) ?? checkActiveItems(c.db, input.lines.map((l) => l.itemId));
  if (bad) return bad;
  // Outgoing must not eat into stock reserved by approved loans (PRD 4.5).
  for (const [itemId, qty] of totalsByItem(input.lines)) {
    const item = findItem(c.db, itemId)!;
    const free = item.currentStock - reservedQuantity(c.db.loans, itemId);
    if (qty > free) {
      const msg = e.insufficient(Math.max(0, free));
      return fail("INSUFFICIENT_STOCK", msg, { [`lines.${input.lines.findIndex((l) => l.itemId === itemId)}.quantity`]: msg });
    }
  }
  const r = postTransaction(c, {
    type: "OUT",
    date: input.date,
    destination: input.destination,
    notes: input.notes,
    lines: input.lines.map((l) => ({ itemId: l.itemId, change: -l.quantity })),
  });
  if (r.ok) log(c, "Outgoing stock posted", "Stock", r.data.number);
  return r;
}

export function stockAdjustment(c: Ctx, input: AdjustmentInput): Result<StockTransaction> {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const item = findItem(c.db, input.itemId);
  if (!item) return fail("NOT_FOUND", e.notFound);
  if (item.status !== "Active") return fail("BUSINESS_RULE_VIOLATION", e.itemInactive(item.name));
  const noReason = needReason(input.reason);
  if (noReason) return noReason;
  const diff = input.physical - item.currentStock;
  if (diff === 0) return fail("VALIDATION_ERROR", e.fix, { physical: t.validation.differenceZero });
  const r = postTransaction(c, {
    type: "ADJUSTMENT",
    date: input.date,
    reason: input.reason,
    lines: [{ itemId: item.id, change: diff }],
  });
  if (r.ok) log(c, "Stock adjusted", "Stock", r.data.number, input.reason);
  return r;
}

/** BR-04, BR-05: posted transactions are never edited; a void creates a linked reversal. */
export function voidTransaction(c: Ctx, id: number, reason: string): Result<StockTransaction> {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const noReason = needReason(reason);
  if (noReason) return noReason;
  const tx = c.db.transactions.find((x) => x.id === id);
  if (!tx) return fail("NOT_FOUND", e.notFound);
  if (!["IN", "OUT", "ADJUSTMENT"].includes(tx.type)) {
    return fail("BUSINESS_RULE_VIOLATION", e.voidLoanMovement);
  }
  if (tx.status === "Voided") return fail("BUSINESS_RULE_VIOLATION", e.voidAlready);
  const r = postTransaction(c, {
    type: "REVERSAL",
    date: c.today,
    reason,
    reversalOfId: tx.id,
    lines: tx.lines.map((l) => ({ itemId: l.itemId, change: -l.quantityChange })),
  });
  if (!r.ok) {
    return r.error.code === "INSUFFICIENT_STOCK"
      ? fail("BUSINESS_RULE_VIOLATION", e.voidNegative)
      : r;
  }
  tx.status = "Voided";
  // Last purchase price follows the latest remaining posted incoming purchase.
  if (tx.type === "IN") {
    for (const l of tx.lines) {
      const latest = c.db.transactions
        .filter((x) => x.type === "IN" && x.status === "Posted" && x.lines.some((y) => y.itemId === l.itemId))
        .sort((a, b) => (a.date === b.date ? b.id - a.id : b.date.localeCompare(a.date)))[0];
      const item = findItem(c.db, l.itemId)!;
      item.lastPurchasePrice = latest?.lines.find((y) => y.itemId === l.itemId)?.unitPrice ?? 0;
    }
  }
  log(c, "Transaction voided", "Stock", tx.number, reason);
  return r;
}

// --------------------------------------------------------------------- items

export function createItem(c: Ctx, input: ItemInput): Result<Item> {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const { db } = c;
  if (db.items.some((i) => lc(i.code) === lc(input.code))) {
    return fail("CONFLICT", e.itemCodeTaken, { code: e.itemCodeTaken });
  }
  const cat = db.categories.find((x) => x.id === input.categoryId);
  if (!cat) return fail("VALIDATION_ERROR", e.fix, { categoryId: t.validation.selectCategory });
  const item: Item = {
    id: nextId(db, "item"),
    code: input.code,
    name: input.name,
    categoryId: input.categoryId,
    unit: input.unit,
    currentStock: 0,
    minimumStock: input.minimumStock,
    lastPurchasePrice: input.lastPurchasePrice,
    supplierId: input.supplierId,
    location: input.location,
    status: input.status,
    notes: input.notes,
    createdAt: c.now,
    updatedAt: c.now,
  };
  db.items.push(item);
  if (input.openingStock > 0) {
    // Opening stock is an ADJUSTMENT so the ledger stays complete (PRD 4.2).
    postTransaction(c, {
      type: "ADJUSTMENT",
      date: c.today,
      reason: e.openingStockReason,
      lines: [{ itemId: item.id, change: input.openingStock }],
    });
  }
  log(c, "Item created", "Items", item.code);
  return ok(item);
}

export function updateItem(c: Ctx, id: number, input: ItemInput): Result<Item> {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const item = findItem(c.db, id);
  if (!item) return fail("NOT_FOUND", e.notFound);
  if (c.db.items.some((i) => i.id !== id && lc(i.code) === lc(input.code))) {
    return fail("CONFLICT", e.itemCodeTaken, { code: e.itemCodeTaken });
  }
  Object.assign(item, {
    code: input.code,
    name: input.name,
    categoryId: input.categoryId,
    unit: input.unit,
    minimumStock: input.minimumStock,
    lastPurchasePrice: input.lastPurchasePrice,
    supplierId: input.supplierId,
    location: input.location,
    status: input.status,
    notes: input.notes,
    updatedAt: c.now,
  });
  log(c, "Item updated", "Items", item.code);
  return ok(item);
}

export function setItemStatus(c: Ctx, id: number, status: "Active" | "Inactive"): Result<Item> {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const item = findItem(c.db, id);
  if (!item) return fail("NOT_FOUND", e.notFound);
  item.status = status;
  item.updatedAt = c.now;
  log(c, status === "Active" ? "Item activated" : "Item deactivated", "Items", item.code);
  return ok(item);
}

export function itemHasReferences(db: DB, id: number): boolean {
  return (
    db.transactions.some((x) => x.lines.some((l) => l.itemId === id)) ||
    db.loans.some((l) => l.lines.some((x) => x.itemId === id))
  );
}

export function deleteItem(c: Ctx, id: number): Result {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const item = findItem(c.db, id);
  if (!item) return fail("NOT_FOUND", e.notFound);
  if (itemHasReferences(c.db, id)) return fail("CONFLICT", e.itemHasHistory);
  c.db.items = c.db.items.filter((i) => i.id !== id);
  log(c, "Item deleted", "Items", item.code);
  return ok(undefined);
}

// ----------------------------------------------------- categories & suppliers

export function saveCategory(c: Ctx, id: number | null, input: CategoryInput): Result<Category> {
  const denied = requireAdmin(c);
  if (denied) return denied;
  if (c.db.categories.some((x) => x.id !== id && lc(x.name) === lc(input.name))) {
    return fail("CONFLICT", e.nameTaken, { name: e.nameTaken });
  }
  if (id === null) {
    const cat: Category = { id: nextId(c.db, "category"), ...input, createdAt: c.now };
    c.db.categories.push(cat);
    log(c, "Category created", "Categories", cat.name);
    return ok(cat);
  }
  const cat = c.db.categories.find((x) => x.id === id);
  if (!cat) return fail("NOT_FOUND", e.notFound);
  Object.assign(cat, input);
  log(c, "Category updated", "Categories", cat.name);
  return ok(cat);
}

export function setCategoryStatus(c: Ctx, id: number, status: "Active" | "Inactive"): Result {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const cat = c.db.categories.find((x) => x.id === id);
  if (!cat) return fail("NOT_FOUND", e.notFound);
  cat.status = status;
  log(c, status === "Active" ? "Category activated" : "Category deactivated", "Categories", cat.name);
  return ok(undefined);
}

export function deleteCategory(c: Ctx, id: number): Result {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const cat = c.db.categories.find((x) => x.id === id);
  if (!cat) return fail("NOT_FOUND", e.notFound);
  if (c.db.items.some((i) => i.categoryId === id)) return fail("CONFLICT", e.categoryInUse);
  c.db.categories = c.db.categories.filter((x) => x.id !== id);
  log(c, "Category deleted", "Categories", cat.name);
  return ok(undefined);
}

export function saveSupplier(c: Ctx, id: number | null, input: SupplierInput): Result<Supplier> {
  const denied = requireAdmin(c);
  if (denied) return denied;
  if (id === null) {
    const s: Supplier = { id: nextId(c.db, "supplier"), ...input, createdAt: c.now };
    c.db.suppliers.push(s);
    log(c, "Supplier created", "Suppliers", s.name);
    return ok(s);
  }
  const s = c.db.suppliers.find((x) => x.id === id);
  if (!s) return fail("NOT_FOUND", e.notFound);
  Object.assign(s, input);
  log(c, "Supplier updated", "Suppliers", s.name);
  return ok(s);
}

export function setSupplierStatus(c: Ctx, id: number, status: "Active" | "Inactive"): Result {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const s = c.db.suppliers.find((x) => x.id === id);
  if (!s) return fail("NOT_FOUND", e.notFound);
  s.status = status;
  log(c, status === "Active" ? "Supplier activated" : "Supplier deactivated", "Suppliers", s.name);
  return ok(undefined);
}

export function deleteSupplier(c: Ctx, id: number): Result {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const s = c.db.suppliers.find((x) => x.id === id);
  if (!s) return fail("NOT_FOUND", e.notFound);
  if (c.db.items.some((i) => i.supplierId === id) || c.db.transactions.some((x) => x.supplierId === id)) {
    return fail("CONFLICT", e.supplierInUse);
  }
  c.db.suppliers = c.db.suppliers.filter((x) => x.id !== id);
  log(c, "Supplier deleted", "Suppliers", s.name);
  return ok(undefined);
}

// --------------------------------------------------------------------- loans

function checkLoanLines(c: Ctx, loan: { lines: { itemId: number; quantity: number }[] }, excludeId?: number): Result<never> | null {
  const bad = checkActiveItems(c.db, loan.lines.map((l) => l.itemId));
  if (bad) return bad;
  for (const [itemId, qty] of totalsByItem(loan.lines)) {
    const item = findItem(c.db, itemId)!;
    const avail = availableForLoan(item, c.db.loans, excludeId);
    if (qty > avail) {
      const msg = e.insufficient(avail);
      return fail("INSUFFICIENT_STOCK", msg, { [`lines.${loan.lines.findIndex((l) => l.itemId === itemId)}.quantity`]: msg });
    }
  }
  return null;
}

function validateLoanBasics(c: Ctx, input: LoanInput): Result<never> | null {
  const borrower = c.db.users.find((u) => u.id === input.borrowerId);
  if (!borrower || borrower.status !== "Active") return fail("VALIDATION_ERROR", e.fix, { borrowerId: t.validation.selectBorrower });
  if (c.actor.role === "Staff" && borrower.id !== c.actor.id) return fail("FORBIDDEN", e.forbidden);
  if (input.expectedReturnDate < input.loanDate) {
    return fail("VALIDATION_ERROR", e.fix, { expectedReturnDate: t.validation.expectedAfterLoan });
  }
  const noQty = badQuantity(input.lines);
  if (noQty) return noQty;
  return checkActiveItems(c.db, input.lines.map((l) => l.itemId));
}

export function createLoan(c: Ctx, input: LoanInput, submit: boolean): Result<Loan> {
  const bad = validateLoanBasics(c, input);
  if (bad) return bad;
  if (submit) {
    const short = checkLoanLines(c, input);
    if (short) return short;
  }
  const loan: Loan = {
    id: nextId(c.db, "loan"),
    number: nextNumber(c.db, "LN", c.today),
    borrowerId: input.borrowerId,
    status: submit ? "Pending Approval" : "Draft",
    loanDate: input.loanDate,
    expectedReturnDate: input.expectedReturnDate,
    purpose: input.purpose,
    notes: input.notes,
    rejectReason: "",
    approvedBy: null,
    approvedAt: null,
    issuedBy: null,
    issuedAt: null,
    returnedAt: null,
    receivedBy: null,
    returnNotes: "",
    lines: input.lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity })),
    createdAt: c.now,
    updatedAt: c.now,
  };
  c.db.loans.unshift(loan);
  log(c, submit ? "Loan submitted" : "Loan draft saved", "Loans", loan.number);
  return ok(loan);
}

const ownsLoan = (c: Ctx, loan: Loan) => c.actor.role === "Admin" || loan.borrowerId === c.actor.id;

export function updateLoanDraft(c: Ctx, id: number, input: LoanInput, submit: boolean): Result<Loan> {
  const loan = c.db.loans.find((l) => l.id === id);
  if (!loan || !ownsLoan(c, loan)) return fail("NOT_FOUND", e.notFound);
  if (loan.status !== "Draft") return fail("BUSINESS_RULE_VIOLATION", e.loanState("edited", "Draft"));
  const bad = validateLoanBasics(c, input);
  if (bad) return bad;
  if (submit) {
    const short = checkLoanLines(c, input);
    if (short) return short;
  }
  Object.assign(loan, {
    borrowerId: input.borrowerId,
    loanDate: input.loanDate,
    expectedReturnDate: input.expectedReturnDate,
    purpose: input.purpose,
    notes: input.notes,
    lines: input.lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity })),
    status: submit ? "Pending Approval" : "Draft",
    updatedAt: c.now,
  });
  log(c, submit ? "Loan submitted" : "Loan draft saved", "Loans", loan.number);
  return ok(loan);
}

export function submitLoan(c: Ctx, id: number): Result<Loan> {
  const loan = c.db.loans.find((l) => l.id === id);
  if (!loan || !ownsLoan(c, loan)) return fail("NOT_FOUND", e.notFound);
  if (loan.status !== "Draft") return fail("BUSINESS_RULE_VIOLATION", e.loanState("submitted", "Draft"));
  const short = checkLoanLines(c, loan);
  if (short) return short;
  loan.status = "Pending Approval";
  loan.updatedAt = c.now;
  log(c, "Loan submitted", "Loans", loan.number);
  return ok(loan);
}

export function cancelLoan(c: Ctx, id: number): Result<Loan> {
  const loan = c.db.loans.find((l) => l.id === id);
  if (!loan || !ownsLoan(c, loan)) return fail("NOT_FOUND", e.notFound);
  const staffCan = loan.status === "Draft" || loan.status === "Pending Approval";
  const adminCan = staffCan || loan.status === "Approved";
  if (!(c.actor.role === "Admin" ? adminCan : staffCan)) {
    return fail("BUSINESS_RULE_VIOLATION", loan.status === "Borrowed" ? e.cancelBorrowed : e.loanState("cancelled", "Pending Approval"));
  }
  loan.status = "Cancelled"; // an Approved loan releases its reservation automatically
  loan.updatedAt = c.now;
  log(c, "Loan cancelled", "Loans", loan.number);
  return ok(loan);
}

export function approveLoan(c: Ctx, id: number): Result<Loan> {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const loan = c.db.loans.find((l) => l.id === id);
  if (!loan) return fail("NOT_FOUND", e.notFound);
  if (loan.borrowerId === c.actor.id) return fail("BUSINESS_RULE_VIOLATION", e.selfApprove);
  if (loan.status !== "Pending Approval") return fail("BUSINESS_RULE_VIOLATION", e.loanState("approved", "Pending Approval"));
  const short = checkLoanLines(c, loan, loan.id);
  if (short) return short;
  loan.status = "Approved";
  loan.approvedBy = c.actor.id;
  loan.approvedAt = c.now;
  loan.updatedAt = c.now;
  log(c, "Loan approved", "Loans", loan.number);
  return ok(loan);
}

export function rejectLoan(c: Ctx, id: number, reason: string): Result<Loan> {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const noReason = needReason(reason);
  if (noReason) return noReason;
  const loan = c.db.loans.find((l) => l.id === id);
  if (!loan) return fail("NOT_FOUND", e.notFound);
  if (loan.borrowerId === c.actor.id) return fail("BUSINESS_RULE_VIOLATION", e.selfApprove);
  if (loan.status !== "Pending Approval") return fail("BUSINESS_RULE_VIOLATION", e.loanState("rejected", "Pending Approval"));
  loan.status = "Rejected";
  loan.rejectReason = reason;
  loan.approvedBy = c.actor.id;
  loan.approvedAt = c.now;
  loan.updatedAt = c.now;
  log(c, "Loan rejected", "Loans", loan.number, reason);
  return ok(loan);
}

/** BR-09: stock decreases at issue, not at approval. */
export function issueLoan(c: Ctx, id: number): Result<Loan> {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const loan = c.db.loans.find((l) => l.id === id);
  if (!loan) return fail("NOT_FOUND", e.notFound);
  if (loan.status !== "Approved") return fail("BUSINESS_RULE_VIOLATION", e.loanState("issued", "Approved"));
  const inactive = checkActiveItems(c.db, loan.lines.map((l) => l.itemId));
  if (inactive) return inactive;
  const r = postTransaction(c, {
    type: "LOAN_ISSUE",
    date: c.today,
    loanId: loan.id,
    notes: loan.number,
    lines: loan.lines.map((l) => ({ itemId: l.itemId, change: -l.quantity })),
  });
  if (!r.ok) return r;
  loan.status = "Borrowed";
  loan.issuedBy = c.actor.id;
  loan.issuedAt = c.now;
  loan.updatedAt = c.now;
  log(c, "Loan issued", "Loans", loan.number);
  return ok(loan);
}

/** BR-10, BR-11, BR-20: full return only; the loan is Completed when recorded. */
export function returnLoan(c: Ctx, id: number, input: ReturnInput): Result<Loan> {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const loan = c.db.loans.find((l) => l.id === id);
  if (!loan) return fail("NOT_FOUND", e.notFound);
  if (loan.status !== "Borrowed") return fail("BUSINESS_RULE_VIOLATION", e.loanState("returned", "Borrowed"));
  if (input.returnDate < returnFloor(loan)) {
    return fail("VALIDATION_ERROR", e.fix, { returnDate: t.validation.returnBeforeLoan });
  }
  if (dayDiff(c.today, input.returnDate) > 0) {
    return fail("VALIDATION_ERROR", e.fix, { returnDate: t.validation.returnInFuture });
  }
  const r = postTransaction(c, {
    type: "LOAN_RETURN",
    date: input.returnDate,
    loanId: loan.id,
    notes: loan.number,
    lines: loan.lines.map((l) => ({ itemId: l.itemId, change: l.quantity })),
  });
  if (!r.ok) return r;
  loan.status = "Completed";
  loan.returnedAt = input.returnDate;
  loan.receivedBy = c.actor.id;
  loan.returnNotes = input.notes;
  loan.updatedAt = c.now;
  log(c, "Loan returned", "Loans", loan.number);
  return ok(loan);
}

// --------------------------------------------------------------------- users

const activeAdmins = (db: DB) => db.users.filter((u) => u.role === "Admin" && u.status === "Active");

export function createUser(c: Ctx, input: UserInput): Result<{ user: User; tempPassword: string }> {
  const denied = requireAdmin(c);
  if (denied) return denied;
  if (c.db.users.some((u) => lc(u.email) === lc(input.email))) {
    return fail("CONFLICT", e.emailTaken, { email: e.emailTaken });
  }
  const user: User = {
    id: nextId(c.db, "user"),
    name: input.name,
    email: input.email,
    role: input.role,
    status: "Active",
    mustChangePassword: true,
    lastLoginAt: null,
    createdAt: c.now,
  };
  c.db.users.push(user);
  log(c, "User created", "Users", user.email);
  return ok({ user, tempPassword: tempPassword() });
}

export function updateUser(c: Ctx, id: number, input: UserInput): Result<User> {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const user = c.db.users.find((u) => u.id === id);
  if (!user) return fail("NOT_FOUND", e.notFound);
  if (c.db.users.some((u) => u.id !== id && lc(u.email) === lc(input.email))) {
    return fail("CONFLICT", e.emailTaken, { email: e.emailTaken });
  }
  // BR-22: the last active Admin cannot be demoted.
  if (user.role === "Admin" && input.role !== "Admin" && user.status === "Active" && activeAdmins(c.db).length <= 1) {
    return fail("BUSINESS_RULE_VIOLATION", e.lastAdmin);
  }
  Object.assign(user, { name: input.name, email: input.email, role: input.role });
  log(c, "User updated", "Users", user.email);
  return ok(user);
}

export function setUserStatus(c: Ctx, id: number, status: "Active" | "Inactive"): Result<User> {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const user = c.db.users.find((u) => u.id === id);
  if (!user) return fail("NOT_FOUND", e.notFound);
  if (status === "Inactive" && user.role === "Admin" && user.status === "Active" && activeAdmins(c.db).length <= 1) {
    return fail("BUSINESS_RULE_VIOLATION", e.lastAdmin);
  }
  user.status = status;
  log(c, status === "Active" ? "User activated" : "User deactivated", "Users", user.email);
  return ok(user);
}

export function resetUserPassword(c: Ctx, id: number): Result<{ tempPassword: string }> {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const user = c.db.users.find((u) => u.id === id);
  if (!user) return fail("NOT_FOUND", e.notFound);
  user.mustChangePassword = true;
  log(c, "Password reset", "Users", user.email);
  return ok({ tempPassword: tempPassword() });
}

function tempPassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

// -------------------------------------------------------------------- backup

export function createBackup(c: Ctx): Result<BackupFile> {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const d = new Date(c.now);
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`;
  const file: BackupFile = {
    id: nextId(c.db, "backup"),
    fileName: `ezi-backup-${stamp}.sql.gz`,
    createdAt: c.now,
    kind: "Manual",
    sizeKb: 2000 + c.db.transactions.length * 3,
  };
  c.db.backups.unshift(file);
  c.db.backups = c.db.backups.slice(0, BACKUP_RETENTION); // fixed retention (PRD 4.13)
  log(c, "Backup created", "Backup", file.fileName);
  return ok(file);
}
