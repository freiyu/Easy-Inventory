// Server-side validation of JSON bodies (PRD 6.5, 7.2: never trust frontend validation).
// The frontend schemas parse raw form strings; these parse the typed JSON the API client sends.
// Lengths match the database columns so an over-long value is a friendly error, not a database error.
import { z } from "zod";
import { currentLang, LANGS, UNITS, type Strings } from "./shared";

const MAX_QTY = 1_000_000_000;
const MAX_MONEY = 999_999_999_999; // DECIMAL(14,2)

// 48 leaves room for the user id prefix in the 64-character column (services/core.ts requestKey).
export const clientRequestId = z.string().max(48).optional();

// Zod keeps its messages inside each schema, so the schemas are built once per language (PRD 4.13 v14).
function build(t: Strings) {
  const v = t.validation;
  const f = t.fields;

  const text = (label: string, max: number) =>
    z.string({ error: v.required(label) }).trim().min(1, v.required(label)).max(max, v.tooLong(label, max));
  const optText = (label: string, max = 2000) => z.string().trim().max(max, v.tooLong(label, max)).default("");
  const id = (msg: string) => z.number({ error: msg }).int(msg).positive(msg);
  const whole = (label: string, min: number, max = MAX_QTY) =>
    z.number({ error: v.whole(label) }).int(v.whole(label)).min(min, min === 0 ? v.min(label, 0) : v.positive(label)).max(max, v.tooLarge(label));
  const money = (label: string) => whole(label, 0, MAX_MONEY);
  const date = (label: string) =>
    z.string({ error: v.required(label) })
      .regex(/^\d{4}-\d{2}-\d{2}$/, v.date(label))
      .refine((s) => !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().startsWith(s), v.date(label));
  const email = text(f.email, 191).regex(/^\S+@\S+\.\S+$/, v.email);
  const password = z.string({ error: v.passwordLength }).min(8, v.passwordLength).max(200, v.passwordLength);
  const status = z.enum(["Active", "Inactive"]);
  const lines = <T extends z.ZodType>(line: T) => z.array(line, { error: v.atLeastOneLine }).min(1, v.atLeastOneLine).max(200, v.tooLarge(f.item));

  const loginSchema = z.object({
    email: z.string().trim().default(""),
    password: z.string().default(""),
    keepSignedIn: z.boolean().default(false),
  });
  const firstAdminSchema = z.object({ name: text(f.fullName, 100), email, password });
  const changePasswordSchema = z.object({ current: z.string().optional(), password });

  const categorySchema = z.object({
    name: text(f.name, 100),
    code: z.string({ error: v.categoryCode }).trim().regex(/^[A-Za-z]{3}$/, v.categoryCode).transform((s) => s.toUpperCase()),
    description: optText(f.description),
    status: status.default("Active"),
  });

  const supplierSchema = z.object({
    name: text(f.name, 150),
    contactPerson: optText(f.contactPerson, 100),
    phone: optText(f.phone, 50),
    email: optText(f.email, 191).refine((s) => !s || /^\S+@\S+\.\S+$/.test(s), v.email),
    address: optText(f.address),
    notes: optText(t.common.optional),
    status: status.default("Active"),
  });

  const itemSchema = z.object({
    name: text(f.name, 150),
    categoryId: id(v.selectCategory),
    subcategoryId: id(v.selectSubcategory),
    unit: text(f.unit, 20).refine((u) => UNITS.includes(u), v.selectUnit),
    openingStock: whole(f.openingStock, 0).default(0),
    minimumStock: whole(f.minimumStock, 0),
    lastPurchasePrice: money(f.lastPrice),
    supplierId: id(v.selectSupplier).nullable().default(null),
    location: optText(f.location, 100),
    status: status.default("Active"),
    notes: optText(t.common.optional),
  });

  const userSchema = z.object({ name: text(f.fullName, 100), email, role: z.enum(["Admin", "Staff"]) });

  const qtyLine = z.object({ itemId: id(v.selectItem), quantity: whole(f.quantity, 1) });

  const incomingSchema = z.object({
    date: date(f.date),
    supplierId: id(v.selectSupplier),
    lines: lines(qtyLine.extend({ unitPrice: money(f.unitPrice) })),
    notes: optText(t.common.optional),
    clientRequestId,
  });
  const outgoingSchema = z.object({
    date: date(f.date),
    destination: text(f.destination, 200),
    lines: lines(qtyLine),
    notes: optText(t.common.optional),
    clientRequestId,
  });
  const adjustmentSchema = z.object({
    date: date(f.date),
    itemId: id(v.selectItem),
    physical: whole(f.physicalStock, 0),
    reason: text(f.reason, 2000),
    clientRequestId,
  });
  const reasonSchema = z.object({ reason: text(f.reason, 2000) });

  const loanSchema = z
    .object({
      borrowerId: id(v.selectBorrower),
      lines: lines(qtyLine),
      loanDate: date(f.loanDate),
      expectedReturnDate: date(f.expectedReturn),
      purpose: text(f.purpose, 2000),
      notes: optText(t.common.optional),
      submit: z.boolean().default(false),
      clientRequestId,
    })
    .refine((d) => d.expectedReturnDate >= d.loanDate, { path: ["expectedReturnDate"], message: v.expectedAfterLoan });
  const returnSchema = z.object({ returnDate: date(f.returnDate), notes: optText(f.returnNote) });

  // A line is an existing item or a new item, never both (BR-31). The service checks names, categories and units.
  const purchaseLine = z.object({
    itemId: id(v.selectItem).nullable().default(null),
    quantity: whole(f.quantity, 1),
    newItem: z.object({ name: text(f.itemName, 150), categoryId: id(v.selectCategory), subcategoryId: id(v.selectSubcategory), unit: z.string() }).optional(),
  });
  const purchaseSchema = z.object({
    requesterId: id(v.selectRequester),
    lines: lines(purchaseLine),
    neededBy: date(f.neededBy),
    reason: text(f.reason, 2000),
    notes: optText(t.common.optional),
    submit: z.boolean().default(false),
    clientRequestId,
  });
  const receiveSchema = z.object({
    date: date(f.receivedDate),
    supplierId: id(v.selectSupplier),
    lines: z.array(z.object({ unitPrice: money(f.unitPrice), minimumStock: whole(f.minimumStock, 0).default(0) })).min(1, v.atLeastOneLine),
    notes: optText(t.common.optional),
  });

  const csvSchema = z.object({ csv: z.string().default("") });

  return {
    loginSchema, firstAdminSchema, changePasswordSchema, categorySchema, supplierSchema, itemSchema, userSchema, incomingSchema,
    outgoingSchema, adjustmentSchema, reasonSchema, loanSchema, returnSchema, purchaseSchema, receiveSchema, csvSchema,
  };
}

const sets = { en: build(LANGS.en.t), id: build(LANGS.id.t) };
/** The schemas in the request's language: `parse(s.itemSchema, body)`. */
export const s = new Proxy(sets.en, { get: (_, key) => sets[currentLang()][key as keyof typeof sets.en] });
// English-only named exports for unit tests; services and routes use `s` so messages follow the request.
export const {
  loginSchema, firstAdminSchema, changePasswordSchema, categorySchema, supplierSchema, itemSchema, userSchema, incomingSchema,
  outgoingSchema, adjustmentSchema, reasonSchema, loanSchema, returnSchema, purchaseSchema, receiveSchema, csvSchema,
} = sets.en;

export const isUnit = (u: string) => UNITS.includes(u);

export type ItemInput = z.output<typeof itemSchema>;
export type LoanInput = z.output<typeof loanSchema>;
export type PurchaseInput = z.output<typeof purchaseSchema>;
