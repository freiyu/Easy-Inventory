import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { qrMatrix } from "./qr";

const golden: Record<string, string[]> = JSON.parse(readFileSync(new URL("./qr-golden.json", import.meta.url), "utf8"));

describe("qrMatrix", () => {
  it("returns null for an empty or blank value", () => {
    expect(qrMatrix("")).toBeNull();
    expect(qrMatrix("   ")).toBeNull();
  });

  it("is square with a side of 17 + 4 * version and has the three finder corners dark", () => {
    const m = qrMatrix("KTR-ELK-0001")!;
    const n = m.length;
    expect(n).toBe(21); // 12 bytes at level M fit version 1
    expect(m.every((row) => row.length === n)).toBe(true);
    expect([m[0][0], m[0][n - 1], m[n - 1][0]]).toEqual([true, true, true]);
  });

  it("encodes a 40-character code in a bigger symbol, and lower case with spaces", () => {
    expect(qrMatrix("A".repeat(40))!.length).toBeGreaterThan(21);
    expect(qrMatrix("abc xyz 09 ~")).not.toBeNull();
  });

  it("matches the golden matrices that the Rust tests scan", () => {
    for (const [code, rows] of Object.entries(golden)) {
      expect(qrMatrix(code)!.map((r) => r.map((d) => (d ? "1" : "0")).join("")), code).toEqual(rows);
    }
  });
});
