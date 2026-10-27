import { describe, expect, it } from "vitest";
import { parseCsv, UNCLOSED_QUOTE } from "./csv";
import {
  availableForLoan, daysOverdue, formatSequence, itemCode, loanActions, loanDisplayStatus, monthsBetween, purchaseActions, returnFloor,
  safeCell, sequenceKey, stockStatus, totalsByItem,
} from "./rules";

const admin = { id: 1, role: "Admin" as const };
const admin2 = { id: 2, role: "Admin" as const };
const staff = { id: 3, role: "Staff" as const };
const staff2 = { id: 4, role: "Staff" as const };

describe("stock status (BR-25)", () => {
  it("is Out at zero, Low at or under minimum, Safe above", () => {
    expect(stockStatus(0, 5)).toBe("Out");
    expect(stockStatus(5, 5)).toBe("Low");
    expect(stockStatus(1, 5)).toBe("Low");
    expect(stockStatus(6, 5)).toBe("Safe");
    expect(stockStatus(1, 0)).toBe("Safe");
  });
});

describe("available for loan (BR-07)", () => {
  it("is stock minus reserved, never below zero", () => {
    expect(availableForLoan(10, 4)).toBe(6);
    expect(availableForLoan(10, 0)).toBe(10);
    expect(availableForLoan(3, 5)).toBe(0);
  });
});

describe("loan display status and overdue (BR-12)", () => {
  it("is Overdue only when Borrowed past the expected date", () => {
    expect(loanDisplayStatus("Borrowed", "2026-10-24", "2026-10-25")).toBe("Overdue");
    expect(loanDisplayStatus("Borrowed", "2026-10-25", "2026-10-25")).toBe("Borrowed");
    expect(loanDisplayStatus("Approved", "2026-10-01", "2026-10-25")).toBe("Approved");
  });
  it("counts overdue days for Borrowed loans only", () => {
    expect(daysOverdue("Borrowed", "2026-10-20", "2026-10-25")).toBe(5);
    expect(daysOverdue("Borrowed", "2026-10-30", "2026-10-25")).toBe(0);
    expect(daysOverdue("Completed", "2026-10-20", "2026-10-25")).toBe(0);
  });
});

describe("return floor (BR-20)", () => {
  it("is the loan date, or the issue day when issued earlier", () => {
    expect(returnFloor("2026-10-10", null)).toBe("2026-10-10");
    expect(returnFloor("2026-10-10", "2026-10-08")).toBe("2026-10-08");
    expect(returnFloor("2026-10-10", "2026-10-12")).toBe("2026-10-10");
  });
});

describe("totals by item", () => {
  it("merges duplicate lines", () => {
    expect([...totalsByItem([{ itemId: 1, quantity: 2 }, { itemId: 2, quantity: 1 }, { itemId: 1, quantity: 3 }])]).toEqual([[1, 5], [2, 1]]);
  });
});

describe("loan state machine (PRD 3.2, 6.2, BR-13)", () => {
  const loan = (status: Parameters<typeof loanActions>[0]["status"], borrowerId = staff.id) => ({ status, borrowerId });
  it("lets only the borrower edit, submit or cancel a draft", () => {
    expect(loanActions(loan("Draft"), staff)).toEqual(["edit", "submit", "cancel"]);
    expect(loanActions(loan("Draft"), admin)).toEqual([]);
    expect(loanActions(loan("Draft"), staff2)).toEqual([]);
  });
  it("lets the borrower cancel a pending loan and another Admin decide it", () => {
    expect(loanActions(loan("Pending Approval"), staff)).toEqual(["cancel"]);
    expect(loanActions(loan("Pending Approval"), admin)).toEqual(["approve", "reject"]);
  });
  it("never lets an Admin approve their own loan", () => {
    expect(loanActions(loan("Pending Approval", admin.id), admin)).toEqual(["cancel"]);
    expect(loanActions(loan("Pending Approval", admin.id), admin2)).toEqual(["approve", "reject"]);
  });
  it("gives issue, return and cancel-approved to Admin only", () => {
    expect(loanActions(loan("Approved"), admin)).toEqual(["cancel", "issue"]);
    expect(loanActions(loan("Approved"), staff)).toEqual([]);
    expect(loanActions(loan("Borrowed"), admin)).toEqual(["return"]);
    expect(loanActions(loan("Borrowed"), staff)).toEqual([]);
  });
  it("allows nothing on closed loans", () => {
    for (const s of ["Rejected", "Cancelled", "Completed"] as const) {
      expect(loanActions(loan(s), admin)).toEqual([]);
      expect(loanActions(loan(s), staff)).toEqual([]);
    }
  });
});

describe("purchase request state machine (PRD 6.2A, BR-29)", () => {
  const pr = (status: Parameters<typeof purchaseActions>[0]["status"], requesterId = staff.id) => ({ status, requesterId });
  it("follows the same ownership rule as loans", () => {
    expect(purchaseActions(pr("Draft"), staff)).toEqual(["edit", "submit", "cancel"]);
    expect(purchaseActions(pr("Draft"), admin)).toEqual([]);
    expect(purchaseActions(pr("Pending Approval"), staff)).toEqual(["cancel"]);
    expect(purchaseActions(pr("Pending Approval"), admin)).toEqual(["approve", "reject"]);
    expect(purchaseActions(pr("Pending Approval", admin.id), admin)).toEqual(["cancel"]);
    expect(purchaseActions(pr("Approved"), admin)).toEqual(["cancel", "receive"]);
    expect(purchaseActions(pr("Approved"), staff)).toEqual([]);
    expect(purchaseActions(pr("Received"), admin)).toEqual([]);
  });
});

describe("numbers and codes (BR-23, BR-32)", () => {
  it("formats readable numbers per prefix and month", () => {
    expect(formatSequence(sequenceKey("IN", "2026-10-25"), 1)).toBe("IN-202610-0001");
    expect(formatSequence(sequenceKey("LN", "2026-01-02"), 12345)).toBe("LN-202601-12345");
  });
  it("formats item codes with 4 digits, more after 9999", () => {
    expect(itemCode("KTR", 7)).toBe("KTR-0007");
    expect(itemCode("KTR", 10000)).toBe("KTR-10000");
    expect(itemCode("AUL-ELK", 1)).toBe("AUL-ELK-0001"); // v12: category and subcategory pair
  });
});

describe("helpers", () => {
  it("lists the months of a range across a year end", () => {
    expect(monthsBetween("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(monthsBetween("2026-03", "2026-02")).toEqual([]);
  });
  it("escapes spreadsheet formulas (PRD 7.5)", () => {
    expect(safeCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(safeCell("+62 811")).toBe("'+62 811");
    expect(safeCell("-5")).toBe("'-5");
    expect(safeCell("@x")).toBe("'@x");
    expect(safeCell("Paper")).toBe("Paper");
    expect(safeCell(-5)).toBe(-5);
  });
});

describe("CSV reader (PRD 4.10)", () => {
  it("reads quotes, CRLF, BOM and semicolons", () => {
    expect(parseCsv('﻿name,unit\r\n"Pen, blue",pcs\r\n')).toEqual([["name", "unit"], ["Pen, blue", "pcs"]]);
    expect(parseCsv('name;unit\n"Say ""hi""";box\n')).toEqual([["name", "unit"], ['Say "hi"', "box"]]);
  });
  it("keeps a quote inside a field and drops blank lines", () => {
    expect(parseCsv('name\n12" ruler\n\n')).toEqual([["name"], ['12" ruler']]);
  });
  it("refuses an unclosed quote", () => {
    expect(() => parseCsv('name\n"Pen')).toThrow(UNCLOSED_QUOTE);
  });
});
