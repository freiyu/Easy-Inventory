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

describe("purchase requests", () => {
  const staff = () => db.users.find((u) => u.id === 3)!;
  const input = (requesterId: number, ...p: [number, number][]) => ({ requesterId, lines: lines(...p), neededBy: daysFromToday(3), reason: "Running low", notes: "" });
  const receive = (_itemId: number, unitPrice: number) => ({ date: daysFromToday(0), supplierId: 2, notes: "", lines: [{ unitPrice, code: "", minimumStock: 0 }] });
  const approved = (itemId: number, qty: number) => {
    const r = ops.createPurchase(ctx(staff()), input(3, [itemId, qty]), true);
    if (!r.ok) throw new Error(r.error.message);
    ops.approvePurchase(ctx(), r.data.id);
    return r.data;
  };

  it("does not touch stock until received, then posts an IN for the full quantity (BR-27, BR-28)", () => {
    const folder = item("ATK-008");
    const before = folder.currentStock;
    const pr = approved(folder.id, 20);
    expect(folder.currentStock).toBe(before);
    const r = ops.receivePurchase(ctx(), pr.id, receive(folder.id, 3800));
    expect(r.ok).toBe(true);
    expect(pr.status).toBe("Received");
    expect(folder.currentStock).toBe(before + 20);
    expect(folder.lastPurchasePrice).toBe(3800);
    const tx = db.transactions.find((x) => x.id === pr.transactionId)!;
    expect(tx.type).toBe("IN");
    expect(tx.lines[0].quantityChange).toBe(20);
  });

  it("receives only once (BR-28)", () => {
    const folder = item("ATK-008");
    const pr = approved(folder.id, 5);
    expect(ops.receivePurchase(ctx(), pr.id, receive(folder.id, 3500)).ok).toBe(true);
    const stock = folder.currentStock;
    expect(ops.receivePurchase(ctx(), pr.id, receive(folder.id, 3500)).ok).toBe(false);
    expect(folder.currentStock).toBe(stock);
  });

  it("does not let a user approve or reject their own purchase request (BR-29)", () => {
    const own = ops.createPurchase(ctx(), input(1, [item("ATK-008").id, 5]), true);
    if (!own.ok) throw new Error("setup");
    expect(ops.approvePurchase(ctx(), own.data.id).ok).toBe(false);
    expect(ops.rejectPurchase(ctx(), own.data.id, "no").ok).toBe(false);
    expect(own.data.status).toBe("Pending Approval");
  });

  it("requires a reason to reject (BR-06) and allows only Admin to decide or receive (BR-16)", () => {
    const r = ops.createPurchase(ctx(staff()), input(3, [item("ATK-008").id, 5]), true);
    if (!r.ok) throw new Error("setup");
    expect(ops.rejectPurchase(ctx(), r.data.id, " ").ok).toBe(false);
    expect(ops.approvePurchase(ctx(staff()), r.data.id).ok).toBe(false);
    ops.approvePurchase(ctx(), r.data.id);
    expect(ops.receivePurchase(ctx(staff()), r.data.id, receive(item("ATK-008").id, 3500)).ok).toBe(false);
    expect(r.data.status).toBe("Approved");
  });

  it("lets Staff act only on their own requests", () => {
    const other = db.users.find((u) => u.id === 4)!;
    const r = ops.createPurchase(ctx(other), input(4, [item("ATK-008").id, 5]), false);
    if (!r.ok) throw new Error("setup");
    expect(ops.submitPurchase(ctx(staff()), r.data.id).ok).toBe(false);
    expect(ops.cancelPurchase(ctx(staff()), r.data.id).ok).toBe(false);
    expect(ops.createPurchase(ctx(staff()), input(4, [item("ATK-008").id, 5]), false).ok).toBe(false);
  });

  it("blocks inactive items, past needed-by dates and zero quantities", () => {
    const inactive = db.items.find((i) => i.status === "Inactive")!;
    expect(ops.createPurchase(ctx(), input(3, [inactive.id, 1]), false).ok).toBe(false);
    expect(ops.createPurchase(ctx(), { ...input(3, [item("ATK-008").id, 1]), neededBy: daysFromToday(-1) }, false).ok).toBe(false);
    expect(ops.createPurchase(ctx(), input(3, [item("ATK-008").id, 0]), false).ok).toBe(false);
  });

  it("numbers requests PR-YYYYMM-NNNN and lets a requester edit and cancel their own draft (BR-30)", () => {
    const r = ops.createPurchase(ctx(staff()), input(3, [item("ATK-008").id, 5]), false);
    if (!r.ok) throw new Error("setup");
    expect(r.data.number).toMatch(/^PR-\d{6}-\d{4}$/);
    const edited = ops.updatePurchaseDraft(ctx(staff()), r.data.id, input(3, [item("ATK-008").id, 9]), true);
    expect(edited.ok).toBe(true);
    expect(r.data.status).toBe("Pending Approval");
    expect(r.data.lines[0].quantity).toBe(9);
    expect(ops.cancelPurchase(ctx(staff()), r.data.id).ok).toBe(true);
  });

  it("accepts a needed-by date of today and lets a second Admin approve an Admin's request (BR-29)", () => {
    const secondAdmin = db.users.find((u) => u.id === 2)!;
    const r = ops.createPurchase(ctx(), { ...input(1, [item("ATK-008").id, 5]), neededBy: daysFromToday(0) }, true);
    if (!r.ok) throw new Error("setup");
    expect(ops.approvePurchase(ctx(secondAdmin), r.data.id).ok).toBe(true);
  });

  it("checks supplier, price per line and the received date before posting (BR-28)", () => {
    const folder = item("ATK-008");
    const pr = approved(folder.id, 5);
    const stock = folder.currentStock;
    expect(ops.receivePurchase(ctx(), pr.id, { ...receive(folder.id, 3500), supplierId: 999 }).ok).toBe(false);
    expect(ops.receivePurchase(ctx(), pr.id, { ...receive(folder.id, 3500), lines: [] }).ok).toBe(false);
    expect(ops.receivePurchase(ctx(), pr.id, { ...receive(folder.id, 3500), date: daysFromToday(1) }).ok).toBe(false);
    expect(pr.status).toBe("Approved");
    expect(folder.currentStock).toBe(stock);
  });

  it("keeps a received request Received when its IN is voided, and the purchase leaves the ledger", () => {
    const folder = item("ATK-008");
    const before = folder.currentStock;
    const pr = approved(folder.id, 5);
    ops.receivePurchase(ctx(), pr.id, receive(folder.id, 3500));
    expect(ops.voidTransaction(ctx(), pr.transactionId!, "Wrong delivery").ok).toBe(true);
    expect(pr.status).toBe("Received");
    expect(db.transactions.find((x) => x.id === pr.transactionId)!.status).toBe("Voided");
    expect(folder.currentStock).toBe(before);
  });

  it("blocks duplicate item lines, a negative price, an item with requests from being deleted, and a stale draft from being submitted", () => {
    const folder = item("ATK-008");
    expect(ops.createPurchase(ctx(), input(3, [folder.id, 1], [folder.id, 2]), false).ok).toBe(false);
    const pr = approved(folder.id, 5);
    expect(ops.receivePurchase(ctx(), pr.id, receive(folder.id, -1)).ok).toBe(false);
    expect(pr.status).toBe("Approved");
    expect(ops.deleteItem(ctx(), folder.id).ok).toBe(false);
    const draft = ops.createPurchase(ctx(staff()), input(3, [folder.id, 1]), false);
    if (!draft.ok) throw new Error("setup");
    draft.data.neededBy = daysFromToday(-1);
    expect(ops.submitPurchase(ctx(staff()), draft.data.id).ok).toBe(false);
  });

  describe("new items on a request (BR-31)", () => {
    const fresh = (name: string, qty = 6) => ({ itemId: null, quantity: qty, newItem: { name, categoryId: 2, unit: "pcs" } });
    const withLines = (requesterId: number, ...l: ReturnType<typeof fresh>[]) => ({ ...input(requesterId), lines: l });
    const recv = (...l: { unitPrice: number; code: string; minimumStock: number }[]) => ({ date: daysFromToday(0), supplierId: 2, notes: "", lines: l });

    it("creates the item only when received, with the receipt as its first stock", () => {
      const count = db.items.length;
      const r = ops.createPurchase(ctx(staff()), withLines(3, fresh("Whiteboard Duster")), true);
      if (!r.ok) throw new Error("setup");
      expect(ops.approvePurchase(ctx(), r.data.id).ok).toBe(true);
      expect(db.items.length).toBe(count);
      const done = ops.receivePurchase(ctx(), r.data.id, recv({ unitPrice: 12000, code: "ATK-099", minimumStock: 3 }));
      expect(done.ok).toBe(true);
      const made = item("ATK-099");
      expect(made).toMatchObject({ name: "Whiteboard Duster", categoryId: 2, unit: "pcs", currentStock: 6, minimumStock: 3, lastPurchasePrice: 12000, supplierId: 2, status: "Active" });
      expect(r.data.lines[0].itemId).toBe(made.id);
      expect(db.transactions.find((x) => x.id === r.data.transactionId)!.lines[0]).toMatchObject({ itemId: made.id, quantityChange: 6, balanceAfter: 6 });
    });

    it("leaves no item behind when the request is rejected or cancelled", () => {
      const count = db.items.length;
      const a = ops.createPurchase(ctx(staff()), withLines(3, fresh("Ghost Item A")), true);
      const b = ops.createPurchase(ctx(staff()), withLines(3, fresh("Ghost Item B")), true);
      if (!a.ok || !b.ok) throw new Error("setup");
      expect(ops.rejectPurchase(ctx(), a.data.id, "Not needed").ok).toBe(true);
      expect(ops.cancelPurchase(ctx(staff()), b.data.id).ok).toBe(true);
      expect(db.items.length).toBe(count);
    });

    it("mixes existing and new lines in one receipt", () => {
      const folder = item("ATK-008");
      const before = folder.currentStock;
      const r = ops.createPurchase(ctx(staff()), { ...input(3), lines: [{ itemId: folder.id, quantity: 4 }, fresh("Desk Organizer", 2)] }, true);
      if (!r.ok) throw new Error("setup");
      ops.approvePurchase(ctx(), r.data.id);
      expect(ops.receivePurchase(ctx(), r.data.id, recv({ unitPrice: 3600, code: "", minimumStock: 0 }, { unitPrice: 25000, code: "ATK-098", minimumStock: 1 })).ok).toBe(true);
      expect(folder.currentStock).toBe(before + 4);
      expect(item("ATK-098").currentStock).toBe(2);
    });

    it("rejects a name that already exists (any case), a repeated new name, an inactive category and an unknown unit", () => {
      const code = (r: ReturnType<typeof ops.createPurchase>) => (r.ok ? "OK" : r.error.code);
      expect(code(ops.createPurchase(ctx(staff()), withLines(3, fresh("Same Name")), false))).toBe("OK"); // positive control
      const existingName = item("ATK-008").name.toUpperCase();
      const taken = ops.createPurchase(ctx(staff()), withLines(3, fresh(existingName)), false);
      expect(code(taken)).toBe("CONFLICT");
      if (!taken.ok) expect(taken.error.fields).toHaveProperty("lines.0.name");
      expect(code(ops.createPurchase(ctx(staff()), withLines(3, fresh("Same Name"), fresh("same name")), false))).toBe("VALIDATION_ERROR");
      const inactiveCat = db.categories.find((c) => c.status === "Inactive")!;
      expect(code(ops.createPurchase(ctx(staff()), withLines(3, { ...fresh("Odd One"), newItem: { name: "Odd One", categoryId: inactiveCat.id, unit: "pcs" } }), false))).toBe("BUSINESS_RULE_VIOLATION");
      const badUnit = ops.createPurchase(ctx(staff()), withLines(3, { ...fresh("Odd Two"), newItem: { name: "Odd Two", categoryId: 2, unit: "furlong" } }), false);
      expect(code(badUnit)).toBe("VALIDATION_ERROR");
      if (!badUnit.ok) expect(badUnit.error.fields).toHaveProperty("lines.0.unit");
      // a line cannot be an existing item and a new item at once
      expect(code(ops.createPurchase(ctx(staff()), { ...input(3), lines: [{ itemId: item("ATK-008").id, quantity: 1, newItem: { name: "Both", categoryId: 2, unit: "pcs" } }] }, false))).toBe("VALIDATION_ERROR");
    });

    it("creates nothing when the code is missing or taken or the minimum is invalid", () => {
      const count = db.items.length;
      const r = ops.createPurchase(ctx(staff()), withLines(3, fresh("Label Roll")), true);
      if (!r.ok) throw new Error("setup");
      ops.approvePurchase(ctx(), r.data.id);
      for (const bad of [
        { unitPrice: 5000, code: "", minimumStock: 1 },
        { unitPrice: 5000, code: item("ATK-008").code.toLowerCase(), minimumStock: 1 },
        { unitPrice: 5000, code: "ATK-097", minimumStock: -1 },
      ]) expect(ops.receivePurchase(ctx(), r.data.id, recv(bad)).ok).toBe(false);
      expect(db.items.length).toBe(count);
      expect(r.data.status).toBe("Approved");
      expect(r.data.lines[0].itemId).toBeNull();
    });

    it("creates nothing when a later new line fails, keeps the ledger balanced, and keeps Staff from receiving", () => {
      const count = db.items.length;
      const r = ops.createPurchase(ctx(staff()), withLines(3, fresh("First New"), fresh("Second New")), true);
      if (!r.ok) throw new Error("setup");
      ops.approvePurchase(ctx(), r.data.id);
      const ok1 = { unitPrice: 1000, code: "ATK-096", minimumStock: 1 };
      expect(ops.receivePurchase(ctx(staff()), r.data.id, recv(ok1, { unitPrice: 1000, code: "ATK-095", minimumStock: 1 })).ok).toBe(false);
      expect(ops.receivePurchase(ctx(), r.data.id, recv(ok1, { ...ok1 })).ok).toBe(false); // same code twice inside the request
      expect(ops.receivePurchase(ctx(), r.data.id, recv(ok1, { unitPrice: 1000, code: item("ATK-008").code, minimumStock: 1 })).ok).toBe(false);
      expect(db.items.length).toBe(count);
      expect(r.data.status).toBe("Approved");
      expect(ops.receivePurchase(ctx(), r.data.id, recv(ok1, { unitPrice: 1000, code: "ATK-095", minimumStock: 1 })).ok).toBe(true);
      for (const i of db.items) {
        const sum = db.transactions.flatMap((t) => t.lines).filter((l) => l.itemId === i.id).reduce((n, l) => n + l.quantityChange, 0);
        expect(sum).toBe(i.currentStock);
      }
    });

    it("keeps a category that a pending new item points to from being deleted", () => {
      const made = ops.saveCategory(ctx(), null, { name: "Cables", code: "CBL", description: "", status: "Active" });
      if (!made.ok) throw new Error("setup");
      const r = ops.createPurchase(ctx(staff()), withLines(3, { ...fresh("Cable Tie Pack"), newItem: { name: "Cable Tie Pack", categoryId: made.data.id, unit: "pack" } }), true);
      if (!r.ok) throw new Error("setup");
      expect(ops.deleteCategory(ctx(), made.data.id).ok).toBe(false);
      ops.cancelPurchase(ctx(staff()), r.data.id);
      expect(ops.deleteCategory(ctx(), made.data.id).ok).toBe(false); // the cancelled request still points to it
    });
  });

  it("cancels: Staff before approval, Admin also after; never once received", () => {
    const r = ops.createPurchase(ctx(staff()), input(3, [item("ATK-008").id, 5]), true);
    if (!r.ok) throw new Error("setup");
    ops.approvePurchase(ctx(), r.data.id);
    expect(ops.cancelPurchase(ctx(staff()), r.data.id).ok).toBe(false);
    expect(ops.cancelPurchase(ctx(), r.data.id).ok).toBe(true);
    const done = approved(item("ATK-008").id, 5);
    ops.receivePurchase(ctx(), done.id, receive(item("ATK-008").id, 3500));
    expect(ops.cancelPurchase(ctx(), done.id).ok).toBe(false);
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
