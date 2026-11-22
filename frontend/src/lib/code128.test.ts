import { describe, expect, it } from "vitest";
import { CODE128_PATTERNS, code128Symbols, code128Widths } from "./code128";

describe("code128 table", () => {
  it("has 107 distinct patterns, each symbol 11 modules wide (stop 13)", () => {
    expect(CODE128_PATTERNS).toHaveLength(107);
    expect(new Set(CODE128_PATTERNS).size).toBe(107);
    CODE128_PATTERNS.forEach((p, i) => {
      const sum = [...p].reduce((a, d) => a + Number(d), 0);
      expect(sum).toBe(i === 106 ? 13 : 11);
    });
  });
});

describe("code128Symbols", () => {
  it("encodes a single character: start B, data, checksum, stop", () => {
    // checksum: (104 + 33*1) % 103 = 34
    expect(code128Symbols("A")).toEqual([104, 33, 34, 106]);
  });
  it("weights each data symbol by its position", () => {
    // checksum: (104 + 33*1 + 34*2) % 103 = 102
    expect(code128Symbols("AB")).toEqual([104, 33, 34, 102, 106]);
  });
  it("matches the Wikipedia PJJ123C example (start B instead of A: checksum 55 instead of 54)", () => {
    expect(code128Symbols("PJJ123C")).toEqual([104, 48, 42, 42, 17, 18, 19, 35, 55, 106]);
  });
  it("encodes a real item code", () => {
    const s = code128Symbols("AUL-ELK-0001")!;
    expect(s).toHaveLength(12 + 3);
    expect(s[0]).toBe(104);
    expect(s.at(-1)).toBe(106);
  });
  it("returns null for the empty string and for non-printable or non-ASCII input", () => {
    expect(code128Symbols("")).toBeNull();
    expect(code128Symbols("é")).toBeNull();
    expect(code128Symbols("a\tb")).toBeNull();
  });
});

describe("code128Widths", () => {
  it("is 11 modules per symbol plus 13 for the stop, and null when not encodable", () => {
    expect(code128Widths("A")!.reduce((a, b) => a + b, 0)).toBe(11 * 3 + 13);
    expect(code128Widths("")).toBeNull();
  });
});
