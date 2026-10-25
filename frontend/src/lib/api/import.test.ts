// Item CSV import (PRD 4.10, BR-33): preview, confirm, duplicates, validation, roles, backup.
import { beforeEach, describe, expect, it } from "vitest";
import { setLatency } from "../mock/adapter";
import { DEMO_PASSWORD, resetMock } from "../mock/state";
import { auth } from "./auth";
import { get } from "./client";
import { items, type ImportReportDto, type ItemDto } from "./master";

const HEADER = "name,category,unit,opening_stock,minimum_stock,price,supplier,location,notes";

const must = <T,>(r: { success: boolean } & Record<string, unknown>) => {
  expect(r.success, JSON.stringify(r)).toBe(true);
  return (r as unknown as { data: T }).data;
};

beforeEach(async () => {
  setLatency(0);
  resetMock();
  must(await auth.login("rina.wulandari@kantor.example", DEMO_PASSWORD, false));
});

describe("item CSV import", () => {
  it("previews every row without saving anything", async () => {
    const before = (await items.list({ pageSize: 500 })) as { meta?: { total: number } };
    const csv = [
      HEADER,
      "Import Pen,Stationery,box,10,5,38000,Toko Alat Tulis Maju Jaya,Cabinet B2,from csv",
      "A4 paper 80 GSM,Paper,ream,1,1,1,,,", // already exists (case-insensitive)
      "Import Pen,Stationery,box,,,,,,", // repeated in the file
      "No Category,Nowhere,pcs,,,,,,",
      "Bad Unit,Stationery,furlong,,,,,,",
      "Bad Number,Stationery,pcs,abc,,,,,",
      "Bad Supplier,Stationery,pcs,,,,Ghost Supplier,,",
      ",Stationery,pcs,,,,,,",
    ].join("\n");
    const r = must<ImportReportDto>(await items.importPreview(csv));
    expect(r).toMatchObject({ total: 8, ready: 1, skipped: 2, errors: 5, created: 0 });
    expect(r.rows.map((x) => [x.line, x.status])).toEqual([[2, "ready"], [3, "skipped"], [4, "skipped"], [5, "error"], [6, "error"], [7, "error"], [8, "error"], [9, "error"]]);
    expect(r.rows[3].message).toMatch(/Nowhere/);
    const after = (await items.list({ pageSize: 500 })) as { meta?: { total: number } };
    expect(after.meta?.total).toBe(before.meta?.total);
  });

  it("imports the ready rows with generated codes, opening stock and a Before import backup, and skips the rest", async () => {
    const csv = [HEADER, "Import Pen,Stationery,box,10,5,38000,,Cabinet B2,from csv", "Import Tape,Stationery,roll,0,2,9000,,,", "Broken,Nowhere,pcs,,,,,,"].join("\r\n");
    const r = must<ImportReportDto>(await items.importConfirm(csv));
    expect(r).toMatchObject({ created: 2, skipped: 0, errors: 1 });
    const found = must<ItemDto[]>(await items.list({ search: "Import ", pageSize: 50 }));
    const pen = found.find((i) => i.name === "Import Pen")!;
    expect(pen).toMatchObject({ currentStock: 10, minimumStock: 5, lastPurchasePrice: 38000, location: "Cabinet B2", notes: "from csv", unit: "box" });
    expect(pen.code).toMatch(/^STN-\d{4}$/);
    expect(found.find((i) => i.name === "Import Tape")!.code).not.toBe(pen.code);
    expect(found.some((i) => i.name === "Broken")).toBe(false);
    const backups = must<{ kind: string }[]>(await get("/backup/database", { pageSize: 5, sort: "created:desc" }));
    expect(backups[0].kind).toBe("Before import");
    // importing the same file again creates nothing: existing names are skipped, never overwritten
    const again = await items.importConfirm(csv);
    expect(again).toMatchObject({ success: false, error: { code: "BUSINESS_RULE_VIOLATION" } });
  });

  it("reads semicolons, quotes and a BOM, and refuses a bad file with a clear message", async () => {
    const ok = must<ImportReportDto>(await items.importPreview('﻿Name;Category;Unit;Notes\r\n"Pen, fine ""tip""";Stationery;pcs;"line one"'));
    expect(ok).toMatchObject({ ready: 1 });
    expect(ok.rows[0].name).toBe('Pen, fine "tip"');
    expect(await items.importPreview("")).toMatchObject({ success: false, error: { code: "VALIDATION_ERROR" } });
    expect(await items.importPreview("name,unit\r\nX,pcs")).toMatchObject({ success: false, error: { message: expect.stringMatching(/category/) } });
    expect(await items.importPreview(HEADER)).toMatchObject({ success: false });
    const many = [HEADER, ...Array.from({ length: 501 }, (_, i) => `Item ${i},Stationery,pcs,,,,,,`)].join("\n");
    expect(await items.importPreview(many)).toMatchObject({ success: false, error: { message: expect.stringMatching(/500/) } });
  });

  it("is Admin only", async () => {
    await auth.logout();
    must(await auth.login("budi.santoso@kantor.example", DEMO_PASSWORD, false));
    expect(await items.importPreview(`${HEADER}\nX,Stationery,pcs,,,,,,`)).toMatchObject({ success: false, status: 403 });
    expect(await items.importConfirm(`${HEADER}\nX,Stationery,pcs,,,,,,`)).toMatchObject({ success: false, status: 403 });
  });
});
