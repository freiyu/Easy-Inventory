// Categories, suppliers and items. Business rules are in ops.ts; this file shapes the responses (PRD 6.6).
import type { CategoryDto, ItemDto, SupplierDto } from "../../api/master";
import { availableForLoan, reservedQuantity, stockStatus } from "../rules";
import { t } from "../../strings";
import type { Category, Item, Supplier } from "../../types";
import {
  deleteCategory, deleteItem, deleteSupplier, fail, itemHasReferences, ok, saveCategory, saveSupplier, setCategoryStatus,
  setItemStatus, setSupplierStatus, updateItem, createItem, type Ctx, type DB,
} from "../ops";
import { filterValue, paged, searchRows } from "./list";
import type { H, Out, Route } from "./types";

const id = (h: H) => Number(h.params.id);
const isAdmin = (c: Ctx) => c.actor.role === "Admin";
const STOCK_ORDER = { Out: 0, Low: 1, Safe: 2 };

// ---------------------------------------------------------------- categories

const categoryDto = (db: DB, c: Category): CategoryDto => ({ ...c, itemCount: db.items.filter((i) => i.categoryId === c.id).length });

function listCategories({ c, query }: H): Out {
  if (!isAdmin(c)) {
    // Staff: names of active categories only, for the new-item picker (PRD 3.2).
    const rows = c.db.categories.filter((x) => x.status === "Active").map(({ id, name }) => ({ id, name }));
    return paged(rows, query, { name: (r) => r.name }, "name:asc");
  }
  let rows = c.db.categories.map((x) => categoryDto(c.db, x));
  const status = filterValue(query, "status");
  if (status) rows = rows.filter((r) => r.status === status);
  rows = searchRows(rows, query, (r) => [r.name, r.code, r.description]);
  return paged(rows, query, {
    name: (r) => r.name, code: (r) => r.code, items: (r) => r.itemCount, status: (r) => r.status,
  }, "name:asc");
}

// ----------------------------------------------------------------- suppliers

const supplierDto = (db: DB, s: Supplier): SupplierDto => ({ ...s, itemCount: db.items.filter((i) => i.supplierId === s.id).length });

function listSuppliers({ c, query }: H): Out {
  let rows = c.db.suppliers.map((x) => supplierDto(c.db, x));
  const status = filterValue(query, "status");
  if (status) rows = rows.filter((r) => r.status === status);
  rows = searchRows(rows, query, (r) => [r.name, r.contactPerson, r.phone, r.email]);
  return paged(rows, query, {
    name: (r) => r.name, contact: (r) => r.contactPerson, phone: (r) => r.phone, email: (r) => r.email,
    items: (r) => r.itemCount, status: (r) => r.status,
  }, "name:asc");
}

// --------------------------------------------------------------------- items

export function itemDto(c: Ctx, i: Item, detail = false): ItemDto {
  const { db } = c;
  const base: ItemDto = {
    id: i.id,
    name: i.name,
    categoryId: i.categoryId,
    categoryName: db.categories.find((x) => x.id === i.categoryId)?.name ?? "-",
    unit: i.unit,
    status: i.status,
    stockStatus: stockStatus(i.currentStock, i.minimumStock),
    availableForLoan: availableForLoan(i, db.loans),
  };
  if (!isAdmin(c)) return base; // no code, stock numbers, price, supplier or location for Staff (PRD 3.2)
  const full: ItemDto = {
    ...base,
    code: i.code,
    currentStock: i.currentStock,
    minimumStock: i.minimumStock,
    lastPurchasePrice: i.lastPurchasePrice,
    supplierId: i.supplierId,
    supplierName: db.suppliers.find((x) => x.id === i.supplierId)?.name ?? "-",
    location: i.location,
    notes: i.notes,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
  };
  if (!detail) return full;
  return {
    ...full,
    reserved: reservedQuantity(db.loans, i.id),
    movements: db.transactions
      .filter((x) => x.lines.some((l) => l.itemId === i.id))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 10)
      .map((x) => {
        const l = x.lines.find((y) => y.itemId === i.id)!;
        return {
          id: x.id, number: x.number, type: x.type, date: x.date, quantityChange: l.quantityChange,
          balanceAfter: l.balanceAfter, userName: db.users.find((u) => u.id === x.userId)?.name ?? "-",
        };
      }),
  };
}

function listItems({ c, query }: H): Out {
  const admin = isAdmin(c);
  let rows = c.db.items.filter((i) => admin || i.status === "Active"); // inactive items are never shown to Staff
  const status = filterValue(query, "status");
  if (admin && status) rows = rows.filter((i) => i.status === status);
  const category = filterValue(query, "categoryId");
  if (category) rows = rows.filter((i) => String(i.categoryId) === category);
  const stock = filterValue(query, "stockStatus");
  if (stock) rows = rows.filter((i) => stockStatus(i.currentStock, i.minimumStock) === stock);
  const supplier = filterValue(query, "supplierId");
  if (admin && supplier) rows = rows.filter((i) => String(i.supplierId ?? "") === supplier);
  const location = filterValue(query, "location");
  if (admin && location) rows = rows.filter((i) => i.location === location);
  rows = searchRows(rows, query, (i) => (admin ? [i.name, i.code, i.location] : [i.name]));
  const dtos = rows.map((i) => itemDto(c, i));
  return paged(dtos, query, {
    code: (r) => r.code ?? "", name: (r) => r.name, category: (r) => r.categoryName, unit: (r) => r.unit,
    stock: (r) => r.currentStock ?? 0, minimum: (r) => r.minimumStock ?? 0, supplier: (r) => r.supplierName ?? "",
    location: (r) => r.location ?? "", status: (r) => STOCK_ORDER[r.stockStatus], availability: (r) => STOCK_ORDER[r.stockStatus],
  }, "name:asc");
}

function oneItem(h: H): Out {
  const item = h.c.db.items.find((i) => i.id === id(h));
  if (!item || (!isAdmin(h.c) && item.status !== "Active")) return fail("NOT_FOUND", t.errors.notFound);
  return ok(itemDto(h.c, item, true));
}

// Bodies are validated by Zod on the client (friendliness); ops.ts repeats the rules that matter (truth).
const input = <T,>(h: H) => h.body as unknown as T;

export const masterRoutes: Route[] = [
  { method: "GET", path: "/categories", run: listCategories },
  { method: "POST", path: "/categories", admin: true, run: (h) => { const r = saveCategory(h.c, null, input(h)); return r.ok ? ok(categoryDto(h.c.db, r.data)) : r; } },
  { method: "PUT", path: "/categories/:id", admin: true, run: (h) => { const r = saveCategory(h.c, id(h), input(h)); return r.ok ? ok(categoryDto(h.c.db, r.data)) : r; } },
  { method: "DELETE", path: "/categories/:id", admin: true, run: (h) => deleteCategory(h.c, id(h)) },
  { method: "POST", path: "/categories/:id/deactivate", admin: true, run: (h) => setCategoryStatus(h.c, id(h), "Inactive") },
  { method: "POST", path: "/categories/:id/activate", admin: true, run: (h) => setCategoryStatus(h.c, id(h), "Active") },

  { method: "GET", path: "/suppliers", admin: true, run: listSuppliers },
  { method: "POST", path: "/suppliers", admin: true, run: (h) => { const r = saveSupplier(h.c, null, input(h)); return r.ok ? ok(supplierDto(h.c.db, r.data)) : r; } },
  { method: "PUT", path: "/suppliers/:id", admin: true, run: (h) => { const r = saveSupplier(h.c, id(h), input(h)); return r.ok ? ok(supplierDto(h.c.db, r.data)) : r; } },
  { method: "DELETE", path: "/suppliers/:id", admin: true, run: (h) => deleteSupplier(h.c, id(h)) },
  { method: "POST", path: "/suppliers/:id/deactivate", admin: true, run: (h) => setSupplierStatus(h.c, id(h), "Inactive") },
  { method: "POST", path: "/suppliers/:id/activate", admin: true, run: (h) => setSupplierStatus(h.c, id(h), "Active") },

  { method: "GET", path: "/items", run: listItems },
  { method: "GET", path: "/items/locations", admin: true, run: ({ c }) => ok([...new Set(c.db.items.map((i) => i.location).filter(Boolean))].sort()) },
  { method: "GET", path: "/items/:id", run: oneItem },
  { method: "POST", path: "/items", admin: true, run: (h) => { const r = createItem(h.c, input(h)); return r.ok ? ok(itemDto(h.c, r.data, true)) : r; } },
  { method: "PUT", path: "/items/:id", admin: true, run: (h) => { const r = updateItem(h.c, id(h), input(h)); return r.ok ? ok(itemDto(h.c, r.data, true)) : r; } },
  { method: "DELETE", path: "/items/:id", admin: true, run: (h) => deleteItem(h.c, id(h)) },
  { method: "POST", path: "/items/:id/deactivate", admin: true, run: (h) => setItemStatus(h.c, id(h), "Inactive") },
  { method: "POST", path: "/items/:id/activate", admin: true, run: (h) => setItemStatus(h.c, id(h), "Active") },
];

// Kept for the other handler modules (loans, stock, dashboard).
export { itemHasReferences };
