// Categories, subcategories, suppliers and items (PRD 4.2 to 4.4, 4.10, BR-01, BR-14, BR-24, BR-32 to BR-34).
import { prisma, Prisma, type Tx } from "../db";
import { parseCsv, UNCLOSED_QUOTE } from "../domain/csv";
import { availableForLoan, itemCode, stockStatus, suggestCode } from "../domain/rules";
import { fail, notFound, type Paged } from "../http";
import { filterId, filterValue, paged, searchRows, type Query } from "../list";
import type { ItemInput } from "../schemas";
import { t, UNITS, type StockStatus, type StockTxType } from "../shared";
import { createBackup } from "./backup";
import { counter, iso, isAdmin, lockItemNames, log, num, postTransaction, reservedByItem, write, ymd, type Ctx, type SessionUser } from "./core";

const e = t.errors;
const STOCK_ORDER = { Out: 0, Low: 1, Safe: 2 };

// -------------------------------------------------- categories and subcategories
// Categories (areas, PRD 4.3) and subcategories (kinds of item, 4.3A, BR-34) have the same columns and rules.

export type Group = "category" | "subcategory";
const GROUP = {
  category: { module: "Categories", label: "Category", codeTaken: e.categoryCodeTaken, inUse: e.categoryInUse },
  subcategory: { module: "Subcategories", label: "Subcategory", codeTaken: e.subcategoryCodeTaken, inUse: e.subcategoryInUse },
} as const;
const table = (tx: Tx, g: Group) => tx[g] as unknown as Tx["category"]; // same columns, so one delegate type serves both

export async function listCategories(c: Ctx, q: Query, g: Group = "category"): Promise<Paged<unknown>> {
  if (!isAdmin(c)) {
    // Staff: names of active entries only, for the new-item lines of a purchase request (PRD 3.2).
    const rows = await table(c.tx, g).findMany({ where: { status: "Active" }, select: { id: true, name: true } });
    return paged(rows, q, { name: (r) => r.name }, "name:asc");
  }
  const status = filterValue(q, "status");
  const cats = await table(c.tx, g).findMany({ where: status ? { status } : {}, include: { _count: { select: { items: true } } } });
  const rows = searchRows(cats.map(categoryDto), q, (r) => [r.name, r.code, r.description]);
  return paged(rows, q, { name: (r) => r.name, code: (r) => r.code, items: (r) => r.itemCount, status: (r) => r.status }, "name:asc");
}

type CategoryRow = { id: number; name: string; code: string; description: string; status: string; createdAt: Date; _count: { items: number } };
const categoryDto = (x: CategoryRow) => ({
  id: x.id, name: x.name, code: x.code, description: x.description, status: x.status, createdAt: iso(x.createdAt), itemCount: x._count.items,
});

export function saveCategory(actor: SessionUser, id: number | null, input: { name: string; code: string; description: string; status: string }, g: Group = "category") {
  return write(actor, async (c) => {
    const tbl = table(c.tx, g);
    const current = id === null ? null : await tbl.findUnique({ where: { id } });
    if (id !== null && !current) throw notFound();
    // Names and codes are unique without regard to case (BR-01); the database collation compares that way too.
    if (await tbl.findFirst({ where: { name: input.name, ...(id ? { NOT: { id } } : {}) } })) {
      throw fail("CONFLICT", e.nameTaken, { name: e.nameTaken });
    }
    if (await tbl.findFirst({ where: { code: input.code, ...(id ? { NOT: { id } } : {}) } })) {
      throw fail("CONFLICT", GROUP[g].codeTaken, { code: GROUP[g].codeTaken });
    }
    // BR-32, BR-34: once an item code was made with it, its code is fixed.
    if (current && current.code !== input.code && current.nextItemNumber > 1) {
      throw fail("BUSINESS_RULE_VIOLATION", e.categoryCodeLocked, { code: e.categoryCodeLocked });
    }
    const data = { name: input.name, code: input.code, description: input.description, status: input.status };
    const saved = current
      ? await tbl.update({ where: { id: current.id }, data, include: { _count: { select: { items: true } } } })
      : await tbl.create({ data, include: { _count: { select: { items: true } } } });
    await log(c, `${GROUP[g].label} ${current ? "updated" : "created"}`, GROUP[g].module, saved.name);
    return categoryDto(saved);
  });
}

export function setCategoryStatus(actor: SessionUser, id: number, status: "Active" | "Inactive", g: Group = "category") {
  return write(actor, async (c) => {
    const cat = await table(c.tx, g).findUnique({ where: { id } });
    if (!cat) throw notFound();
    await table(c.tx, g).update({ where: { id }, data: { status } });
    await log(c, `${GROUP[g].label} ${status === "Active" ? "activated" : "deactivated"}`, GROUP[g].module, cat.name);
    return null;
  });
}

/** BR-14: only an unused entry can be deleted. One that ever issued item codes is kept so its numbers are never reused (BR-32). */
export function deleteCategory(actor: SessionUser, id: number, g: Group = "category") {
  return write(actor, async (c) => {
    const cat = await table(c.tx, g).findUnique({ where: { id }, include: { _count: { select: { items: true, purchaseLines: true } } } });
    if (!cat) throw notFound();
    if (cat._count.items > 0 || cat._count.purchaseLines > 0 || cat.nextItemNumber > 1) throw fail("CONFLICT", GROUP[g].inUse);
    await table(c.tx, g).delete({ where: { id } });
    await log(c, `${GROUP[g].label} deleted`, GROUP[g].module, cat.name);
    return null;
  });
}

// ----------------------------------------------------------------- suppliers

type SupplierRow = { id: number; name: string; contactPerson: string; phone: string; email: string; address: string; notes: string; status: string; createdAt: Date; _count: { items: number } };
const supplierDto = ({ _count, createdAt, updatedAt: _u, ...s }: SupplierRow & { updatedAt?: Date }) => ({ ...s, createdAt: iso(createdAt), itemCount: _count.items });

export async function listSuppliers(c: Ctx, q: Query) {
  const status = filterValue(q, "status");
  const sups = await c.tx.supplier.findMany({ where: status ? { status } : {}, include: { _count: { select: { items: true } } } });
  const rows = searchRows(sups.map(supplierDto), q, (r) => [r.name, r.contactPerson, r.phone, r.email]);
  return paged(rows, q, {
    name: (r) => r.name, contact: (r) => r.contactPerson, phone: (r) => r.phone, email: (r) => r.email, items: (r) => r.itemCount, status: (r) => r.status,
  }, "name:asc");
}

export function saveSupplier(actor: SessionUser, id: number | null, input: Omit<SupplierRow, "id" | "createdAt" | "_count">) {
  return write(actor, async (c) => {
    if (id !== null && !(await c.tx.supplier.findUnique({ where: { id } }))) throw notFound();
    const include = { _count: { select: { items: true } } };
    const saved = id === null ? await c.tx.supplier.create({ data: input, include }) : await c.tx.supplier.update({ where: { id }, data: input, include });
    await log(c, id === null ? "Supplier created" : "Supplier updated", "Suppliers", saved.name);
    return supplierDto(saved);
  });
}

export function setSupplierStatus(actor: SessionUser, id: number, status: "Active" | "Inactive") {
  return write(actor, async (c) => {
    const s = await c.tx.supplier.findUnique({ where: { id } });
    if (!s) throw notFound();
    await c.tx.supplier.update({ where: { id }, data: { status } });
    await log(c, status === "Active" ? "Supplier activated" : "Supplier deactivated", "Suppliers", s.name);
    return null;
  });
}

export function deleteSupplier(actor: SessionUser, id: number) {
  return write(actor, async (c) => {
    const s = await c.tx.supplier.findUnique({ where: { id }, include: { _count: { select: { items: true, transactions: true } } } });
    if (!s) throw notFound();
    if (s._count.items > 0 || s._count.transactions > 0) throw fail("CONFLICT", e.supplierInUse);
    await c.tx.supplier.delete({ where: { id } });
    await log(c, "Supplier deleted", "Suppliers", s.name);
    return null;
  });
}

// --------------------------------------------------------------------- items

type ItemRow = {
  id: number; code: string; name: string; categoryId: number; subcategoryId: number | null; unit: string; currentStock: number; minimumStock: number;
  lastPurchasePrice: unknown; supplierId: number | null; location: string; status: string; notes: string; createdAt: Date; updatedAt: Date;
  category: { name: string }; subcategory: { name: string } | null; supplier: { name: string } | null;
};
const itemInclude = { category: { select: { name: true } }, subcategory: { select: { name: true } }, supplier: { select: { name: true } } } as const;

/** Every role gets status and availability (BR-07, BR-25); only Admin gets codes, stock numbers, price and supplier (PRD 3.2, 6.6). */
export function itemDto(admin: boolean, i: ItemRow, reserved: number) {
  const base = {
    id: i.id, name: i.name, categoryId: i.categoryId, categoryName: i.category.name,
    subcategoryId: i.subcategoryId, subcategoryName: i.subcategory?.name ?? "-", unit: i.unit, status: i.status,
    stockStatus: stockStatus(i.currentStock, i.minimumStock) as StockStatus,
    availableForLoan: availableForLoan(i.currentStock, reserved),
  };
  if (!admin) return base;
  return {
    ...base, code: i.code, currentStock: i.currentStock, minimumStock: i.minimumStock, lastPurchasePrice: num(i.lastPurchasePrice as never) ?? 0,
    supplierId: i.supplierId, supplierName: i.supplier?.name ?? "-", location: i.location, notes: i.notes,
    createdAt: iso(i.createdAt), updatedAt: iso(i.updatedAt),
  };
}
export type ItemDto = ReturnType<typeof itemDto> & Partial<{ code: string; currentStock: number; minimumStock: number; lastPurchasePrice: number; supplierId: number | null; supplierName: string; location: string }>;

export async function itemRows(tx: Tx, where: object, admin: boolean) {
  const [items, reserved] = await Promise.all([tx.item.findMany({ where, include: itemInclude }), reservedByItem(tx)]);
  return items.map((i) => itemDto(admin, i, reserved.get(i.id) ?? 0) as ItemDto);
}

export async function listItems(c: Ctx, q: Query) {
  const admin = isAdmin(c);
  const where: Record<string, unknown> = admin ? {} : { status: "Active" }; // Staff never see inactive items
  const status = filterValue(q, "status");
  if (admin && status) where.status = status;
  const categoryId = filterId(q, "categoryId");
  if (categoryId) where.categoryId = categoryId;
  const subcategoryId = filterId(q, "subcategoryId");
  if (subcategoryId) where.subcategoryId = subcategoryId;
  const supplierId = filterId(q, "supplierId");
  if (admin && supplierId) where.supplierId = supplierId;
  const location = filterValue(q, "location");
  if (admin && location) where.location = location;
  let rows = await itemRows(c.tx, where, admin);
  const stock = filterValue(q, "stockStatus");
  if (stock) rows = rows.filter((r) => r.stockStatus === stock);
  rows = searchRows(rows, q, (i) => (admin ? [i.name, i.code, i.location] : [i.name]));
  return paged(rows, q, {
    code: (r) => r.code ?? "", name: (r) => r.name, category: (r) => r.categoryName, subcategory: (r) => r.subcategoryName, unit: (r) => r.unit,
    stock: (r) => r.currentStock ?? 0, minimum: (r) => r.minimumStock ?? 0, supplier: (r) => r.supplierName ?? "",
    location: (r) => r.location ?? "", status: (r) => STOCK_ORDER[r.stockStatus], availability: (r) => STOCK_ORDER[r.stockStatus],
  }, "name:asc");
}

export async function oneItem(c: Ctx, id: number) {
  const admin = isAdmin(c);
  const item = await c.tx.item.findUnique({ where: { id }, include: itemInclude });
  if (!item || (!admin && item.status !== "Active")) throw notFound();
  const reserved = (await reservedByItem(c.tx, [id])).get(id) ?? 0;
  const dto = itemDto(admin, item, reserved);
  if (!admin) return dto;
  const ledger = await c.tx.stockTransactionItem.findMany({
    where: { itemId: id }, orderBy: { id: "desc" }, take: 10, include: { transaction: { include: { user: { select: { name: true } } } } },
  });
  return {
    ...dto,
    reserved,
    movements: ledger.map((l) => ({
      id: l.transaction.id, number: l.transaction.number, type: l.transaction.type as StockTxType, date: ymd(l.transaction.date),
      quantityChange: l.quantityChange, balanceAfter: l.balanceAfter, userName: l.transaction.user.name,
    })),
  };
}

export async function itemLocations(c: Ctx) {
  const rows = await c.tx.item.findMany({ where: { location: { not: "" } }, distinct: ["location"], select: { location: true }, orderBy: { location: "asc" } });
  return rows.map((r) => r.location);
}

type Refs = { categoryId: number; subcategoryId: number | null; supplierId: number | null };

/** The category, subcategory and supplier must exist and be active (PRD 4.3, 4.3A, 4.4); an item may keep the ones it already has. */
async function checkItemRefs(tx: Tx, input: Refs, current?: Refs) {
  const cat = await tx.category.findUnique({ where: { id: input.categoryId } });
  if (!cat) throw fail("VALIDATION_ERROR", e.fix, { categoryId: t.validation.selectCategory });
  if (cat.status !== "Active" && cat.id !== current?.categoryId) throw fail("BUSINESS_RULE_VIOLATION", e.fix, { categoryId: e.categoryInactive(cat.name) });
  const sub = input.subcategoryId === null ? null : await tx.subcategory.findUnique({ where: { id: input.subcategoryId } });
  if (!sub) throw fail("VALIDATION_ERROR", e.fix, { subcategoryId: t.validation.selectSubcategory });
  if (sub.status !== "Active" && sub.id !== current?.subcategoryId) throw fail("BUSINESS_RULE_VIOLATION", e.fix, { subcategoryId: e.subcategoryInactive(sub.name) });
  if (input.supplierId === null) return;
  const sup = await tx.supplier.findUnique({ where: { id: input.supplierId } });
  if (!sup) throw fail("VALIDATION_ERROR", e.fix, { supplierId: t.validation.selectSupplier });
  if (sup.status !== "Active" && sup.id !== current?.supplierId) throw fail("BUSINESS_RULE_VIOLATION", e.fix, { supplierId: e.supplierInactive(sup.name) });
}

/**
 * Locks categories, then subcategories, each in id order, before items are created or moved, so two writers never wait on
 * each other in a circle (PRD 7.4). Every writer that creates or edits items takes them in this order.
 */
export async function lockCategories(tx: Tx, ids: number[], subIds: number[] = []) {
  const order = (xs: number[]) => [...new Set(xs)].sort((a, b) => a - b);
  const cats = order(ids), subs = order(subIds);
  if (cats.length) await tx.$queryRaw`SELECT id FROM categories WHERE id IN (${Prisma.join(cats)}) ORDER BY id FOR UPDATE`;
  if (subs.length) await tx.$queryRaw`SELECT id FROM subcategories WHERE id IN (${Prisma.join(subs)}) ORDER BY id FOR UPDATE`;
}

/** BR-32: `<category>-<subcategory>-<number>`, the number from the pair's own counter (locked until commit). */
export async function insertItem(c: Ctx, input: ItemInput) {
  // The issued counts mark both codes as used (they lock the codes, BR-32, BR-34).
  const cat = await c.tx.category.update({ where: { id: input.categoryId }, data: { nextItemNumber: { increment: 1 } }, select: { code: true } });
  const sub = await c.tx.subcategory.update({ where: { id: input.subcategoryId }, data: { nextItemNumber: { increment: 1 } }, select: { code: true } });
  const prefix = `${cat.code}-${sub.code}`;
  const item = await c.tx.item.create({
    data: {
      code: itemCode(prefix, await counter(c.tx, `item:${prefix}`)), name: input.name, categoryId: input.categoryId, subcategoryId: input.subcategoryId, unit: input.unit,
      minimumStock: input.minimumStock, lastPurchasePrice: input.lastPurchasePrice, supplierId: input.supplierId,
      location: input.location, status: input.status, notes: input.notes,
    },
  });
  if (input.openingStock > 0) {
    // Opening stock is an ADJUSTMENT so the ledger stays complete (PRD 4.2).
    await postTransaction(c, { type: "ADJUSTMENT", date: c.today, reason: e.openingStockReason, lines: [{ itemId: item.id, change: input.openingStock }] });
  }
  await log(c, "Item created", "Items", item.code);
  return item.id;
}

export function createItem(actor: SessionUser, input: ItemInput) {
  return write(actor, async (c) => {
    await checkItemRefs(c.tx, input);
    return oneItem(c, await insertItem(c, input));
  });
}

/** BR-32: the code never changes, even when the category or subcategory does. Stock is changed only by transactions (BR-02). */
export function updateItem(actor: SessionUser, id: number, input: ItemInput) {
  return write(actor, async (c) => {
    // Category and subcategory before item, the same order as purchase receive and import (PRD 7.4: no deadlock).
    await lockCategories(c.tx, [input.categoryId], [input.subcategoryId]);
    const item = await c.tx.item.findUnique({ where: { id } });
    if (!item) throw notFound();
    await checkItemRefs(c.tx, input, item);
    await c.tx.item.update({
      where: { id },
      data: {
        name: input.name, categoryId: input.categoryId, subcategoryId: input.subcategoryId, unit: input.unit, minimumStock: input.minimumStock, lastPurchasePrice: input.lastPurchasePrice,
        supplierId: input.supplierId, location: input.location, status: input.status, notes: input.notes,
      },
    });
    await log(c, "Item updated", "Items", item.code);
    return oneItem(c, id);
  });
}

export function setItemStatus(actor: SessionUser, id: number, status: "Active" | "Inactive") {
  return write(actor, async (c) => {
    const item = await c.tx.item.findUnique({ where: { id } });
    if (!item) throw notFound();
    await c.tx.item.update({ where: { id }, data: { status } });
    await log(c, status === "Active" ? "Item activated" : "Item deactivated", "Items", item.code);
    return null;
  });
}

/** BR-14: an item with any history (ledger, loan, purchase request) is deactivated, never deleted. */
export function deleteItem(actor: SessionUser, id: number) {
  return write(actor, async (c) => {
    const item = await c.tx.item.findUnique({ where: { id }, include: { _count: { select: { ledger: true, loanLines: true, purchaseLines: true } } } });
    if (!item) throw notFound();
    if (item._count.ledger + item._count.loanLines + item._count.purchaseLines > 0) throw fail("CONFLICT", e.itemHasHistory);
    await c.tx.item.delete({ where: { id } });
    await log(c, "Item deleted", "Items", item.code);
    return null;
  });
}

// ------------------------------------------------------------- item CSV import
// PRD 4.10, BR-33: Admin only, insert-only, validated per row, previewed, then one transaction after a backup.
// A category or subcategory that does not exist yet is created by the import (v13), with a generated code.

export const IMPORT_MAX_ROWS = 500;
export const IMPORT_MAX_BYTES = 1_000_000;
const IMPORT_REQUIRED = ["name", "category", "subcategory", "unit"] as const;
type ImportColumn = "name" | "category" | "subcategory" | "unit" | "opening_stock" | "minimum_stock" | "price" | "supplier" | "location" | "notes";
// Case- and accent-insensitive, as the database collation compares names ("Cafe" = "Café").
const lc = (s: string) => s.trim().normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const wholeOrNull = (v: string): number | null => (v.trim() === "" ? 0 : /^\d+$/.test(v.trim()) && Number(v) <= 1_000_000_000 ? Number(v.trim()) : null);

export interface ImportRow {
  line: number;
  status: "ready" | "skipped" | "error" | "imported";
  message: string;
  name: string;
  category: string;
  subcategory: string;
  unit: string;
  openingStock: number;
  minimumStock: number;
  price: number;
  supplier: string;
  location: string;
  notes: string;
  /** Resolved ids for a ready row, or the key of a category or subcategory the import creates (not sent to the client). */
  categoryId?: number;
  subcategoryId?: number;
  supplierId?: number | null;
  newCategory?: string;
  newSubcategory?: string;
}

/** A category or subcategory that a confirmed import creates. */
export interface NewGroupEntry { name: string; code: string; key?: string }

/** Validates the file and every row against the current data. Saves nothing. */
export async function previewImport(tx: Tx, csv: string) {
  const bad = (message: string) => fail("VALIDATION_ERROR", message, { csv: message });
  if (Buffer.byteLength(csv) > IMPORT_MAX_BYTES) throw bad(e.importTooBig);
  let table: string[][];
  try {
    table = parseCsv(csv);
  } catch (err) {
    if (err instanceof Error && err.message === UNCLOSED_QUOTE) throw bad(e.importUnclosedQuote);
    throw err;
  }
  if (table.length === 0) throw bad(e.importEmpty);
  const header = table[0].map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, "_"));
  const missing = IMPORT_REQUIRED.filter((h) => !header.includes(h));
  if (missing.length) throw bad(e.importMissingColumns(missing.join(", ")));
  const data = table.slice(1);
  if (data.length === 0) throw bad(e.importNoRows);
  if (data.length > IMPORT_MAX_ROWS) throw bad(e.importTooManyRows(IMPORT_MAX_ROWS));

  const [cats, subs, sups, names] = await Promise.all([
    tx.category.findMany({ select: { id: true, name: true, code: true, status: true } }),
    tx.subcategory.findMany({ select: { id: true, name: true, code: true, status: true } }),
    tx.supplier.findMany({ select: { id: true, name: true, status: true } }),
    tx.item.findMany({ select: { name: true, categoryId: true } }),
  ]);
  const col = (cells: string[], name: ImportColumn) => {
    const i = header.indexOf(name);
    return i < 0 ? "" : (cells[i] ?? "").trim();
  };
  // v12 (BR-33): a name is a duplicate only within the same category.
  const nameKey = (category: number | string, name: string) => `${category}:${lc(name)}`;
  const seen = new Set(names.map((i) => nameKey(i.categoryId, i.name)));
  // Entries this file adds (v13), planned in file order when their first ready row is reached. A later row may name
  // one by the code planned for it, so "GDN" after "Gedung Serba Guna" is the same new area, not a second one.
  const planner = (existing: { code: string }[]) => ({
    taken: new Set(existing.map((x) => x.code.toUpperCase())),
    byKey: new Map<string, NewGroupEntry>(),
    byCode: new Map<string, string>(),
  });
  const newCats = planner(cats);
  const newSubs = planner(subs);
  const pendingKey = (p: ReturnType<typeof planner>, value: string) => p.byCode.get(value.toUpperCase()) ?? lc(value);
  const addPending = (p: ReturnType<typeof planner>, key: string, name: string) => {
    if (p.byKey.has(key)) return;
    const code = /^[A-Za-z]{3}$/.test(name) && !p.taken.has(name.toUpperCase()) ? name.toUpperCase() : suggestCode(name, p.taken);
    p.taken.add(code);
    p.byKey.set(key, { name, code, key });
    p.byCode.set(code, key);
  };
  const rows: ImportRow[] = data.map((cells, idx) => {
    const row: ImportRow = {
      line: idx + 2, status: "ready", message: "",
      name: col(cells, "name"), category: col(cells, "category"), subcategory: col(cells, "subcategory"), unit: col(cells, "unit"),
      openingStock: 0, minimumStock: 0, price: 0, supplier: col(cells, "supplier"), location: col(cells, "location"), notes: col(cells, "notes"),
    };
    const problem = (message: string) => { row.status = "error"; row.message = message; return row; };
    if (!row.name) return problem(t.validation.required(t.fields.name));
    if (row.name.length > 150) return problem(t.validation.tooLong(t.fields.name, 150));
    if (!row.category) return problem(t.validation.required(t.fields.category));
    // Code first, then name, the same as the subcategory below (v13: so "GSG" never creates a second area).
    const cat = cats.find((x) => lc(x.code) === lc(row.category)) ?? cats.find((x) => lc(x.name) === lc(row.category));
    if (!cat && row.category.length > 100) return problem(t.validation.tooLong(t.fields.category, 100));
    if (cat && cat.status !== "Active") return problem(e.categoryInactive(cat.name));
    if (!row.subcategory) return problem(t.validation.required(t.fields.subcategory));
    // Code first, then name, so a name that looks like another entry's code can never pick the wrong one.
    const sub = subs.find((x) => lc(x.code) === lc(row.subcategory)) ?? subs.find((x) => lc(x.name) === lc(row.subcategory));
    if (!sub && row.subcategory.length > 100) return problem(t.validation.tooLong(t.fields.subcategory, 100));
    if (sub && sub.status !== "Active") return problem(e.subcategoryInactive(sub.name));
    if (!row.unit) return problem(t.validation.required(t.fields.unit));
    const unit = UNITS.find((u) => lc(u) === lc(row.unit));
    if (!unit) return problem(e.importUnknownUnit(row.unit));
    row.unit = unit;
    for (const [key, label, raw] of [
      ["openingStock", t.fields.openingStock, col(cells, "opening_stock")],
      ["minimumStock", t.fields.minimumStock, col(cells, "minimum_stock")],
      ["price", t.fields.lastPrice, col(cells, "price")],
    ] as const) {
      const n = wholeOrNull(raw);
      if (n === null) return problem(t.validation.whole(label));
      row[key] = n;
    }
    let supplierId: number | null = null;
    if (row.supplier) {
      const sup = sups.find((x) => lc(x.name) === lc(row.supplier));
      if (!sup) return problem(e.importUnknownSupplier(row.supplier));
      if (sup.status !== "Active") return problem(e.supplierInactive(sup.name));
      supplierId = sup.id;
    }
    if (row.location.length > 100) return problem(t.validation.tooLong(t.fields.location, 100));
    const newCat = cat ? undefined : pendingKey(newCats, row.category);
    const catKey = cat ? cat.id : `new:${newCat}`;
    if (seen.has(nameKey(catKey, row.name))) { row.status = "skipped"; row.message = e.importDuplicate; return row; }
    seen.add(nameKey(catKey, row.name));
    // Only a ready row adds an entry, so a row with errors never creates a category or subcategory.
    if (cat) row.categoryId = cat.id; else addPending(newCats, (row.newCategory = newCat!), row.category);
    if (sub) row.subcategoryId = sub.id; else addPending(newSubs, (row.newSubcategory = pendingKey(newSubs, row.subcategory)), row.subcategory);
    row.supplierId = supplierId;
    return row;
  });

  for (const row of rows) {
    const c = row.newCategory ? newCats.byKey.get(row.newCategory)! : null;
    const sc = row.newSubcategory ? newSubs.byKey.get(row.newSubcategory)! : null;
    const notes = [row.message, c && e.importNewCategory(c.name, c.code), sc && e.importNewSubcategory(sc.name, sc.code)].filter(Boolean);
    row.message = notes.join(" ");
  }
  const count = (s: ImportRow["status"]) => rows.filter((r) => r.status === s).length;
  return {
    rows, total: rows.length, ready: count("ready"), skipped: count("skipped"), errors: count("error"), created: 0,
    newCategories: [...newCats.byKey.values()], newSubcategories: [...newSubs.byKey.values()],
  };
}

const publicReport = (r: Awaited<ReturnType<typeof previewImport>>) => ({
  ...r, rows: r.rows.map(({ categoryId: _c, subcategoryId: _sc, supplierId: _s, newCategory: _nc, newSubcategory: _ns, ...row }) => row),
  newCategories: r.newCategories.map(({ key: _k, ...g }) => g), newSubcategories: r.newSubcategories.map(({ key: _k, ...g }) => g),
});

export async function importPreview(c: Ctx, csv: string) {
  return publicReport(await previewImport(c.tx, csv));
}

/** Confirmed import: validates again, takes a "Before import" backup, then creates the ready rows in one transaction. */
export async function importConfirm(actor: SessionUser, csv: string) {
  const check = await previewImport(prisma, csv);
  if (check.ready === 0) throw fail("BUSINESS_RULE_VIOLATION", e.importNothing);
  await createBackup(actor, "Before import");
  const report = await write(actor, async (c) => {
    await lockItemNames(c.tx);
    const pre = await previewImport(c.tx, csv); // the data may have changed since the check above
    if (pre.ready === 0) throw fail("BUSINESS_RULE_VIOLATION", e.importNothing);
    const ready = pre.rows.filter((r) => r.status === "ready");
    // Create the missing categories and subcategories first. shortcut: a category created by hand at the same moment
    // fails the whole import on its unique name or code; the Admin simply imports again.
    const madeIds = { category: new Map<string, number>(), subcategory: new Map<string, number>() };
    for (const [g, list] of [["category", pre.newCategories], ["subcategory", pre.newSubcategories]] as const) {
      for (const n of list) {
        const made = await table(c.tx, g).create({ data: { name: n.name, code: n.code, description: "", status: "Active" } }).catch((err) => {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw fail("CONFLICT", e.importGroupClash(n.name, n.code));
          throw err;
        });
        madeIds[g].set(n.key!, made.id);
        await log(c, `${GROUP[g].label} created`, GROUP[g].module, made.name);
      }
    }
    for (const r of ready) {
      r.categoryId ??= madeIds.category.get(r.newCategory!);
      r.subcategoryId ??= madeIds.subcategory.get(r.newSubcategory!);
    }
    await lockCategories(c.tx, ready.map((r) => r.categoryId!), ready.map((r) => r.subcategoryId!));
    for (const row of pre.rows) {
      if (row.status !== "ready") continue;
      await insertItem(c, {
        name: row.name, categoryId: row.categoryId!, subcategoryId: row.subcategoryId!, unit: row.unit, openingStock: row.openingStock, minimumStock: row.minimumStock,
        lastPurchasePrice: row.price, supplierId: row.supplierId ?? null, location: row.location, status: "Active", notes: row.notes,
      });
      row.status = "imported";
    }
    const [nc, ns] = [pre.newCategories.length, pre.newSubcategories.length];
    const groups = nc + ns ? `, ${nc} ${nc === 1 ? "category" : "categories"} and ${ns} ${ns === 1 ? "subcategory" : "subcategories"} added` : "";
    await log(c, "Items imported", "Items", `${pre.ready} created, ${pre.skipped} skipped, ${pre.errors} rejected${groups}`);
    return { ...pre, created: pre.ready, ready: 0 };
  });
  return publicReport(report);
}
