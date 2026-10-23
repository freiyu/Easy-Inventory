// Form validation (PRD 6.5). Zod parses raw form strings; the mock store re-checks
// business rules, the same split the real frontend and backend will have.
import { z } from "zod";
import { t } from "./strings";

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
  code: text(f.code),
  name: text(f.name),
  categoryId: idField(v.selectCategory),
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
  code: optText,
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
export type ReturnInput = z.output<typeof returnSchema>;

export type FieldErrors = Record<string, string>;

/** Runs a schema and returns the first message per field path ("lines.0.quantity"). */
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
