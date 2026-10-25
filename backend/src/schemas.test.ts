// Server-side validation (PRD 6.5): the API refuses what the frontend would refuse, with field messages.
import { describe, expect, it } from "vitest";
import { AppError, parse } from "./http";
import { adjustmentSchema, categorySchema, incomingSchema, itemSchema, loanSchema, purchaseSchema, receiveSchema } from "./schemas";

const fields = (schema: Parameters<typeof parse>[0], raw: unknown) => {
  try {
    parse(schema, raw);
    return null;
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    return (err as AppError).fields ?? {};
  }
};

describe("validation (PRD 6.5)", () => {
  it("item: name, category, unit required; numbers whole and not negative", () => {
    const f = fields(itemSchema, { name: " ", categoryId: 0, unit: "", minimumStock: -1, lastPurchasePrice: 1.5 })!;
    expect(Object.keys(f).sort()).toEqual(["categoryId", "lastPurchasePrice", "minimumStock", "name", "unit"]);
    expect(fields(itemSchema, { name: "Pen", categoryId: 1, unit: "pcs", minimumStock: 0, lastPurchasePrice: 0 })).toBeNull();
  });
  it("category: code is exactly 3 letters and is stored in capitals", () => {
    expect(fields(categorySchema, { name: "Kantor", code: "KT1" })).toHaveProperty("code");
    expect(parse(categorySchema, { name: "Kantor", code: "ktr" }).code).toBe("KTR");
  });
  it("incoming: at least one line, quantity > 0, supplier required, valid date", () => {
    const f = fields(incomingSchema, { date: "2026-02-30", supplierId: null, lines: [] })!;
    expect(Object.keys(f).sort()).toEqual(["date", "lines", "supplierId"]);
    expect(fields(incomingSchema, { date: "2026-10-25", supplierId: 1, lines: [{ itemId: 1, quantity: 0, unitPrice: 0 }] })).toHaveProperty(["lines.0.quantity"]);
  });
  it("adjustment: reason required, physical stock >= 0", () => {
    expect(Object.keys(fields(adjustmentSchema, { date: "2026-10-25", itemId: 1, physical: -1, reason: "" })!).sort()).toEqual(["physical", "reason"]);
  });
  it("loan: expected return date not before the loan date (BR-20)", () => {
    const f = fields(loanSchema, { borrowerId: 1, lines: [{ itemId: 1, quantity: 1 }], loanDate: "2026-10-25", expectedReturnDate: "2026-10-24", purpose: "x" });
    expect(f).toHaveProperty("expectedReturnDate");
  });
  it("purchase request: reason required, quantity a whole number", () => {
    const f = fields(purchaseSchema, { requesterId: 1, lines: [{ itemId: 1, quantity: 1.5 }], neededBy: "2026-10-25", reason: "" })!;
    expect(Object.keys(f).sort()).toEqual(["lines.0.quantity", "reason"]);
  });
  it("receive: unit price and minimum stock not negative", () => {
    const f = fields(receiveSchema, { date: "2026-10-25", supplierId: 1, lines: [{ unitPrice: -1, minimumStock: -1 }] })!;
    expect(Object.keys(f).sort()).toEqual(["lines.0.minimumStock", "lines.0.unitPrice"]);
  });
  it("too long text is a field error, not a database error", () => {
    expect(fields(categorySchema, { name: "x".repeat(101), code: "ABC" })).toHaveProperty("name");
  });
});
