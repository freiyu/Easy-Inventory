// Form validation (PRD 6.5). Zod parses raw form strings; the backend re-checks
// every business rule (backend/src/schemas.ts and services).
import { z } from "zod";
import { t } from "./strings";
import type { ApiError, PurchaseLine } from "./types";

const v = t.validation;
const f = t.fields;

const text = (label: string) => z.string().trim().min(1, v.required(label));
const optText = z.string().trim();
const idField = (msg: string) =>
  z.string().min(1, msg).transform((s) => Number(s));
const optId = z.string().transform((s) => (s ? Number(s) : null));
const wholeNumber = (label: string, min: number) =>
  z
    .string()
    .trim()
    .min(1, v.required(label))
    .regex(/^\d+$/, v.whole(label))
    .transform(Number)
    .pipe(z.number().min(min, min === 0 ? v.min(label, 0) : v.positive(label)));
const emailField = text(f.email).regex(/^\S+@\S+\.\S+$/, v.email);
const passwordField = () => z.string().min(8, v.passwordLength).max(200, v.passwordLength);
const dateField = (label: string) => z.string().min(1, v.required(label));

export const loginSchema = z.object({
  email: text(f.email),
  password: z.string().min(1, v.required(f.password)),
  keepSignedIn: z.boolean(),
});

export const firstAdminSchema = z
  .object({
    name: text(f.fullName),
    email: emailField,
    password: passwordField(),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { path: ["confirm"], message: v.passwordMatch });

export const changePasswordSchema = z
  .object({
    current: z.string().optional(),
    password: passwordField(),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { path: ["confirm"], message: v.passwordMatch });

export const itemSchema = z.object({
  name: text(f.name),
  categoryId: idField(v.selectCategory),
  subcategoryId: idField(v.selectSubcategory),
  unit: text(f.unit),
  openingStock: wholeNumber(f.openingStock, 0),
  minimumStock: wholeNumber(f.minimumStock, 0),
  lastPurchasePrice: wholeNumber(f.lastPrice, 0),
  supplierId: optId,
  location: optText,
  status: z.enum(["Active", "Inactive"]),
  notes: optText,
});

export const categorySchema = z.object({
  name: text(f.name),
  code: text(f.code).regex(/^[A-Za-z]{3}$/, v.categoryCode),
  description: optText,
  status: z.enum(["Active", "Inactive"]),
});

export const supplierSchema = z.object({
  name: text(f.name),
  contactPerson: optText,
  phone: optText,
  email: optText.refine((s) => !s || /^\S+@\S+\.\S+$/.test(s), v.email),
  address: optText,
  notes: optText,
  status: z.enum(["Active", "Inactive"]),
});

export const userSchema = z.object({
  name: text(f.fullName),
  email: emailField,
  role: z.enum(["Admin", "Staff"]),
  password: z.string().optional(),
});

const incomingLine = z.object({
  itemId: idField(v.selectItem),
  quantity: wholeNumber(f.quantity, 1),
  unitPrice: wholeNumber(f.unitPrice, 0),
});
export const incomingSchema = z.object({
  date: dateField(f.date),
  supplierId: idField(v.selectSupplier),
  lines: z.array(incomingLine).min(1, v.atLeastOneLine),
  notes: optText,
});

const outgoingLine = z.object({
  itemId: idField(v.selectItem),
  quantity: wholeNumber(f.quantity, 1),
});
export const outgoingSchema = z.object({
  date: dateField(f.date),
  destination: text(f.destination),
  lines: z.array(outgoingLine).min(1, v.atLeastOneLine),
  notes: optText,
});

export const adjustmentSchema = z.object({
  date: dateField(f.date),
  itemId: idField(v.selectItem),
  physical: wholeNumber(f.physicalStock, 0),
  reason: text(f.reason),
});

export const reasonSchema = z.object({ reason: text(f.reason) });

export const loanSchema = z
  .object({
    borrowerId: idField(v.selectBorrower),
    lines: z.array(outgoingLine).min(1, v.atLeastOneLine),
    loanDate: dateField(f.loanDate),
    expectedReturnDate: dateField(f.expectedReturn),
    purpose: text(f.purpose),
    notes: optText,
  })
  .refine((d) => d.expectedReturnDate >= d.loanDate, {
    path: ["expectedReturnDate"],
    message: v.expectedAfterLoan,
  });

// A line is an existing item or a new one (BR-31). The form sends strings; the output is typed.
const purchaseLine = z
  .object({
    isNew: z.boolean(),
    itemId: z.string(),
    quantity: wholeNumber(f.quantity, 1),
    name: z.string().trim(),
    categoryId: z.string(),
    subcategoryId: z.string(),
    unit: z.string(),
  })
  .superRefine((l, ctx) => {
    const need = (path: string, ok: boolean, message: string) => {
      if (!ok) ctx.addIssue({ code: "custom", path: [path], message });
    };
    if (!l.isNew) return need("itemId", !!l.itemId, v.selectItem);
    need("name", !!l.name, v.required(f.itemName));
    need("categoryId", !!l.categoryId, v.selectCategory);
    need("subcategoryId", !!l.subcategoryId, v.selectSubcategory);
    need("unit", !!l.unit, v.selectUnit);
  })
  .transform((l): PurchaseLine =>
    l.isNew
      ? { itemId: null, quantity: l.quantity, newItem: { name: l.name, categoryId: Number(l.categoryId), subcategoryId: Number(l.subcategoryId), unit: l.unit } }
      : { itemId: Number(l.itemId), quantity: l.quantity },
  );

export const purchaseSchema = z.object({
  requesterId: idField(v.selectRequester),
  lines: z.array(purchaseLine).min(1, v.atLeastOneLine),
  neededBy: dateField(f.neededBy),
  reason: text(f.reason),
  notes: optText,
});

// Quantities come from the request (full receipt only). Lines line up with the request's lines.
// Admin enters the real price per line, plus a minimum stock for each new item (BR-31). The item code is generated (BR-32).
const receiveLine = z
  .object({
    isNew: z.boolean(),
    unitPrice: wholeNumber(f.unitPrice, 0),
    minimumStock: z.string().trim(),
  })
  .superRefine((l, ctx) => {
    if (!l.isNew) return;
    if (!/^\d+$/.test(l.minimumStock)) ctx.addIssue({ code: "custom", path: ["minimumStock"], message: l.minimumStock ? v.whole(f.minimumStock) : v.required(f.minimumStock) });
  })
  .transform((l) => ({ unitPrice: l.unitPrice, minimumStock: l.isNew ? Number(l.minimumStock) : 0 }));
export const receiveSchema = z.object({
  date: dateField(f.receivedDate),
  supplierId: idField(v.selectSupplier),
  lines: z.array(receiveLine).min(1),
  notes: optText,
});

export const returnSchema = z.object({
  returnDate: dateField(f.returnDate),
  notes: optText,
});

export type LoginInput = z.output<typeof loginSchema>;
export type FirstAdminInput = z.output<typeof firstAdminSchema>;
export type ItemInput = z.output<typeof itemSchema>;
export type CategoryInput = z.output<typeof categorySchema>;
export type SupplierInput = z.output<typeof supplierSchema>;
export type UserInput = z.output<typeof userSchema>;
export type IncomingInput = z.output<typeof incomingSchema>;
export type OutgoingInput = z.output<typeof outgoingSchema>;
export type AdjustmentInput = z.output<typeof adjustmentSchema>;
export type LoanInput = z.output<typeof loanSchema>;
export type PurchaseInput = z.output<typeof purchaseSchema>;
export type ReceiveInput = z.output<typeof receiveSchema>;
export type ReturnInput = z.output<typeof returnSchema>;

export type FieldErrors = Record<string, string>;

/** Runs a schema and returns the first message per field path ("lines.0.quantity"). */
/** A server refusal as form errors. Use only where every field the server can name is shown in the form:
 *  the general message is dropped when it repeats a field message, so it does not appear twice. */
export function serverErrors(error: ApiError): FieldErrors {
  const fields = error.fields ?? {};
  return Object.values(fields).includes(error.message) ? fields : { ...fields, _form: error.message };
}

export function validate<S extends z.ZodType>(
  schema: S,
  raw: unknown,
): { ok: true; data: z.output<S> } | { ok: false; errors: FieldErrors } {
  const r = schema.safeParse(raw);
  if (r.success) return { ok: true, data: r.data };
  const errors: FieldErrors = {};
  for (const issue of r.error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!errors[key]) errors[key] = issue.message;
  }
  return { ok: false, errors };
}
