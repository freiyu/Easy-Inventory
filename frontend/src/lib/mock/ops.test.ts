import { beforeEach, describe, expect, it } from "vitest";
import { daysFromToday } from "../format";
import { availableForLoan, loanDisplayStatus, stockStatus } from "../rules";
import { createSeed } from "./seed";
import * as ops from "./ops";

let db: ops.DB;
const admin = () => db.users.find((u) => u.id === 1)!;
const ctx = (actor = admin()): ops.Ctx => ({ db, actor, now: new Date().toISOString(), today: daysFromToday(0) });
const item = (code: string) => db.items.find((i) => i.code === code)!;
const lines = (...p: [number, number][]) => p.map(([itemId, quantity]) => ({ itemId, quantity }));

beforeEach(() => {
  db = createSeed();
});

describe("stock ledger", () => {
  it("keeps current_stock equal to the sum of ledger changes (PRD 6.1)", () => {
    for (const i of db.items) {
      const sum = db.transactions.flatMap((t) => t.lines).filter((l) => l.itemId === i.id).reduce((n, l) => n + l.quantityChange, 0);
      expect(sum).toBe(i.currentStock);
    }
  });

  it("classifies Safe, Low and Out (BR-25)", () => {
    expect(stockStatus(11, 10)).toBe("Safe");
    expect(stockStatus(10, 10)).toBe("Low");
    expect(stockStatus(1, 10)).toBe("Low");
    expect(stockStatus(0, 10)).toBe("Out");
  });

  it("blocks outgoing stock above what is free after reservations (BR-03, BR-07)", () => {
    const charger = item("ELC-001"); // 3 in stock, 1 reserved by an approved loan
    expect(availableForLoan(charger, db.loans)).toBe(2);
    const r = ops.stockOut(ctx(), { date: daysFromToday(0), destination: "Test", notes: "", lines: lines([charger.id, 3]) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toBe("Insufficient stock. Available stock: 2.");
    expect(charger.currentStock).toBe(3);
  });

  it("never lets a void make stock negative, and voids once only (BR-05)", () => {
    const tx = db.transactions.find((t) => t.type === "IN" && t.status === "Posted" && t.lines.some((l) => l.itemId === item("PRN-001").id))!;
    // Sell the stock first so reversing the purchase would go below zero.
    const toner = item("PRN-001");
    ops.stockOut(ctx(), { date: daysFromToday(0), destination: "Test", notes: "", lines: lines([toner.id, toner.currentStock]) });
    const blocked = ops.voidTransaction(ctx(), tx.id, "mistake");
    expect(blocked.ok).toBe(false);
    expect(toner.currentStock).toBe(0);

    const ok = db.transactions.find((t) => t.type === "ADJUSTMENT" && t.status === "Posted")!;
    const first = ops.voidTransaction(ctx(), ok.id, "mistake");
    expect(first.ok).toBe(true);
    expect(ok.status).toBe("Voided");
    expect(ops.voidTransaction(ctx(), ok.id, "again").ok).toBe(false);
  });
});

describe("loans", () => {
  it("reserves on approval, deducts on issue, restores on a full return (BR-07, BR-09, BR-10, BR-11)", () => {
    const projector = item("ELC-003"); // 2 in stock
    const staff = db.users.find((u) => u.id === 4)!;
    const created = ops.createLoan(ctx(staff), {
      borrowerId: staff.id, lines: lines([projector.id, 1]), loanDate: daysFromToday(0), expectedReturnDate: daysFromToday(2), purpose: "Test", notes: "",
    }, true);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const id = created.data.id;

    expect(ops.approveLoan(ctx(), id).ok).toBe(true);
    expect(projector.currentStock).toBe(2); // approval reserves only
    expect(availableForLoan(projector, db.loans)).toBe(1);

    expect(ops.issueLoan(ctx(), id).ok).toBe(true);
    expect(projector.currentStock).toBe(1);

    expect(ops.returnLoan(ctx(), id, { returnDate: daysFromToday(0), notes: "" }).ok).toBe(true);
    expect(projector.currentStock).toBe(2);
    expect(db.loans.find((l) => l.id === id)!.status).toBe("Completed");
  });

  it("lets a loan issued before its planned date still be returned (BR-20)", () => {
    const pending = db.loans.find((l) => l.status === "Pending Approval" && l.loanDate > daysFromToday(0))!;
    expect(ops.approveLoan(ctx(), pending.id).ok).toBe(true);
    expect(ops.issueLoan(ctx(), pending.id).ok).toBe(true);
    expect(ops.returnLoan(ctx(), pending.id, { returnDate: daysFromToday(0), notes: "" }).ok).toBe(true);
  });

  it("does not let a user approve their own request (BR-13)", () => {
    const own = db.loans.find((l) => l.borrowerId === 2 && l.status === "Pending Approval")!;
    const r = ops.approveLoan(ctx(db.users.find((u) => u.id === 2)!), own.id);
    expect(r.ok).toBe(false);
    expect(ops.approveLoan(ctx(), own.id).ok).toBe(true); // another Admin can
  });

  it("rejects a request above available-for-loan (BR-08)", () => {
    const charger = item("ELC-001");
    const staff = db.users.find((u) => u.id === 3)!;
    const r = ops.createLoan(ctx(staff), {
      borrowerId: staff.id, lines: lines([charger.id, 3]), loanDate: daysFromToday(0), expectedReturnDate: daysFromToday(1), purpose: "Too many", notes: "",
    }, true);
    expect(r.ok).toBe(false);
  });

  it("derives Overdue from Borrowed plus the expected date (BR-12)", () => {
    const overdue = db.loans.filter((l) => loanDisplayStatus(l) === "Overdue");
    expect(overdue.length).toBeGreaterThan(0);
    for (const l of overdue) expect(l.status).toBe("Borrowed");
  });

  it("lets Staff act only on their own loans", () => {
    const budi = db.users.find((u) => u.id === 3)!;
    const others = db.loans.find((l) => l.borrowerId !== budi.id && l.status === "Pending Approval")!;
    expect(ops.cancelLoan(ctx(budi), others.id).ok).toBe(false);
  });
});

describe("input checks the backend must repeat", () => {
  it("requires a reason to void, adjust or reject (BR-06)", () => {
    const tx = db.transactions.find((t) => t.type === "ADJUSTMENT" && t.status === "Posted")!;
    expect(ops.voidTransaction(ctx(), tx.id, "  ").ok).toBe(false);
    const pending = db.loans.find((l) => l.status === "Pending Approval" && l.borrowerId !== 1)!;
    expect(ops.rejectLoan(ctx(), pending.id, "").ok).toBe(false);
    expect(ops.stockAdjustment(ctx(), { date: daysFromToday(0), itemId: item("ATK-001").id, physical: 1, reason: " " }).ok).toBe(false);
  });

  it("rejects zero or negative quantities", () => {
    const paper = item("ATK-001");
    const before = paper.currentStock;
    expect(ops.stockOut(ctx(), { date: daysFromToday(0), destination: "T", notes: "", lines: lines([paper.id, -5]) }).ok).toBe(false);
    expect(ops.stockIn(ctx(), { date: daysFromToday(0), supplierId: 1, notes: "", lines: [{ itemId: paper.id, quantity: 0, unitPrice: 1 }] }).ok).toBe(false);
    expect(paper.currentStock).toBe(before);
  });

  it("does not issue a loan whose item was deactivated after approval (BR-24)", () => {
    const approved = db.loans.find((l) => l.status === "Approved")!;
    ops.setItemStatus(ctx(), approved.lines[0].itemId, "Inactive");
    expect(ops.issueLoan(ctx(), approved.id).ok).toBe(false);
  });

  it("checks the expected return date against the loan date (BR-20)", () => {
    const staff = db.users.find((u) => u.id === 3)!;
    const r = ops.createLoan(ctx(staff), {
      borrowerId: 3, lines: lines([item("ELC-002").id, 1]), loanDate: daysFromToday(2), expectedReturnDate: daysFromToday(1), purpose: "T", notes: "",
    }, false);
    expect(r.ok).toBe(false);
  });
});

describe("master data and users", () => {
  it("refuses to delete an item that has history (BR-14)", () => {
    expect(ops.deleteItem(ctx(), item("ATK-001").id).ok).toBe(false);
  });

  it("deletes an unreferenced item", () => {
    const created = ops.createItem(ctx(), {
      code: "TMP-001", name: "Temp", categoryId: 1, unit: "pcs", openingStock: 0, minimumStock: 0, lastPurchasePrice: 0, supplierId: null, location: "", status: "Active", notes: "",
    });
    expect(created.ok).toBe(true);
    if (created.ok) expect(ops.deleteItem(ctx(), created.data.id).ok).toBe(true);
  });

  it("keeps item codes unique ignoring case (BR-01)", () => {
    const r = ops.createItem(ctx(), {
      code: "atk-001", name: "Dup", categoryId: 1, unit: "pcs", openingStock: 0, minimumStock: 0, lastPurchasePrice: 0, supplierId: null, location: "", status: "Active", notes: "",
    });
    expect(r.ok).toBe(false);
  });

  it("protects the last active Admin (BR-22)", () => {
    expect(ops.setUserStatus(ctx(), 2, "Inactive").ok).toBe(true); // a second Admin exists
    expect(ops.setUserStatus(ctx(), 1, "Inactive").ok).toBe(false); // now Rina is the last one
  });

  it("only Admin can post stock transactions (BR-16)", () => {
    const staff = db.users.find((u) => u.id === 3)!;
    const r = ops.stockIn(ctx(staff), { date: daysFromToday(0), supplierId: 1, notes: "", lines: [{ itemId: 1, quantity: 1, unitPrice: 1 }] });
    expect(r.ok).toBe(false);
  });
});
