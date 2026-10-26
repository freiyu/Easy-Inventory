// The fetch transport (Stage 4): URLs, envelopes and the error shapes pages rely on. The backend's own
// behavior is covered by the integration tests in backend/src/integration.
import { afterEach, describe, expect, it, vi } from "vitest";
import { t } from "../strings";
import { getFile } from "./client";
import { apiUrl, download, send } from "./transport";

const reply = (status: number, body: unknown) =>
  vi.fn().mockResolvedValue(new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("transport", () => {
  it("builds /api URLs and leaves out undefined query values", () => {
    expect(apiUrl("/items", { page: 2, search: "kabel & lan", status: undefined })).toBe("/api/items?page=2&search=kabel+%26+lan");
    expect(apiUrl("/auth/me")).toBe("/api/auth/me");
  });

  it("sends JSON with the same-origin cookie and returns the envelope as is", async () => {
    const fetch = reply(200, { success: true, data: [1], meta: { page: 1, pageSize: 25, total: 1 } });
    vi.stubGlobal("fetch", fetch);
    expect(await send({ method: "POST", path: "/loans", body: { a: 1 } })).toEqual({ success: true, data: [1], meta: { page: 1, pageSize: 25, total: 1 } });
    expect(fetch).toHaveBeenCalledWith("/api/loans", expect.objectContaining({
      method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: '{"a":1}',
    }));
  });

  it("adds the HTTP status to a server error envelope", async () => {
    vi.stubGlobal("fetch", reply(422, { success: false, error: { code: "INSUFFICIENT_STOCK", message: "x" } }));
    expect(await send({ method: "POST", path: "/stock/out", body: {} })).toEqual({ success: false, status: 422, error: { code: "INSUFFICIENT_STOCK", message: "x" } });
  });

  it("turns a non-JSON error page into a generic error", async () => {
    vi.stubGlobal("fetch", reply(502, "<html>Bad gateway</html>"));
    expect(await send({ method: "GET", path: "/items" })).toEqual({ success: false, status: 502, error: { code: "INTERNAL_ERROR", message: t.errors.server } });
  });

  it("reports an unreachable server as a network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    expect(await send({ method: "GET", path: "/items" })).toEqual({ success: false, status: 0, error: { code: "INTERNAL_ERROR", message: t.errors.network } });
  });
});

describe("file download", () => {
  it("returns the error envelope when the server refuses the export", async () => {
    vi.stubGlobal("fetch", reply(403, { success: false, error: { code: "FORBIDDEN", message: "no" } }));
    expect(await getFile("/export/items")).toEqual({ success: false, status: 403, error: { code: "FORBIDDEN", message: "no" } });
  });

  it.each([
    ['attachment; filename="ezi-items-20261026.xlsx"', "ezi-items-20261026.xlsx"],
    ["attachment; filename=ezi-backup-20261026171715-manual.sql.gz", "ezi-backup-20261026171715-manual.sql.gz"],
  ])("saves the file under the server's name (%s)", async (header, name) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("x", { status: 200, headers: { "Content-Disposition": header } })));
    const a = { href: "", download: "", click: vi.fn() };
    vi.stubGlobal("document", { createElement: () => a });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:x");
    expect(await download("/x")).toEqual({ success: true, data: null });
    expect(a.download).toBe(name);
    expect(a.click).toHaveBeenCalled();
  });
});
