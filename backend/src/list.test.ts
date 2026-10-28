import { describe, expect, it } from "vitest";
import { ALL_ROWS, MAX_PAGE_SIZE, pageParams } from "./list";

describe("pageParams", () => {
  it("caps a page from a URL at the maximum, even when it asks for Infinity", () => {
    expect(pageParams({ pageSize: "100000" }).pageSize).toBe(MAX_PAGE_SIZE);
    expect(pageParams({ pageSize: "Infinity" }).pageSize).toBe(25);
  });
  it("gives an export every row in one page", () => {
    expect(pageParams({ page: "3", pageSize: ALL_ROWS })).toEqual({ page: 1, pageSize: ALL_ROWS });
  });
});
