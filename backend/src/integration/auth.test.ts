// First-run bootstrap, sessions, authorization, CSRF and the error envelope on a real MySQL (PRD 3.3, 3.4, 6.6, 6.7).
import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { LANGS } from "../shared";
import { addUser, Client, masterData, PASSWORD, resetData, startServer } from "./helpers";

let server: Awaited<ReturnType<typeof startServer>>;
beforeAll(async () => {
  await resetData();
  server = await startServer();
});
afterAll(async () => {
  await server.close();
  await prisma.$disconnect();
});

describe("database bootstrap", () => {
  it("has exactly the two seeded roles and no user after the migrations", async () => {
    expect((await prisma.role.findMany({ orderBy: { name: "asc" } })).map((r) => r.name)).toEqual(["Admin", "Staff"]);
    expect(await prisma.user.count()).toBe(0);
  });

  it("creates exactly one first Admin even when two setups race", async () => {
    const c = new Client(server.base);
    expect((await c.get("/setup/status")).body.data).toEqual({ needsSetup: true });
    const body = (n: number) => ({ name: `Owner ${n}`, email: `owner${n}@test.example`, password: PASSWORD });
    const results = await Promise.all([c.post("/setup/first-admin", body(1)), c.post("/setup/first-admin", body(2))]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 403]);
    expect(await prisma.user.count()).toBe(1);
    expect((await prisma.user.findFirstOrThrow({ include: { role: true } })).role.name).toBe("Admin");
    expect((await c.get("/setup/status")).body.data).toEqual({ needsSetup: false });
  });
});

describe("one port: API and the static frontend (PRD 0.2)", () => {
  it("serves exported pages without a trailing-slash redirect, and 404.html for unknown paths", async () => {
    const page = async (p: string) => {
      const r = await fetch(`${server.base}${p}`, { redirect: "manual" });
      return [r.status, await r.text()];
    };
    expect(await page("/")).toEqual([200, "home page"]);
    expect(await page("/login")).toEqual([200, "login page"]);
    expect(await page("/login/")).toEqual([200, "login page"]);
    expect(await page("/login/__next.txt")).toEqual([200, "payload"]);
    expect(await page("/nothing-here")).toEqual([404, "not found page"]);
    // fetch would normalize "..", so send the raw path to prove the root check holds.
    const raw = await new Promise<number>((resolve) => {
      http.get(`${server.base}/%2e%2e/package.json`, (r) => resolve(r.statusCode ?? 0)).end();
    });
    expect(raw).toBe(404);
  });
});

describe("sessions and authorization", () => {
  let admin: Client;
  let adminEmail: string;
  beforeAll(async () => {
    adminEmail = (await prisma.user.findFirstOrThrow()).email;
    admin = new Client(server.base);
    await admin.ok("POST", "/auth/login", { email: adminEmail, password: PASSWORD });
  });

  it("answers 401 in the error envelope without a session", async () => {
    const r = await new Client(server.base).get("/items");
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ success: false, error: { code: "UNAUTHENTICATED", message: expect.any(String) } });
  });

  it("answers in the language the client asks for, English by default (PRD 4.13 v14)", async () => {
    const id = LANGS.id.t, en = LANGS.en.t;
    const anon = new Client(server.base);
    expect((await anon.call("POST", "/auth/login", { email: "nobody@test.example", password: "wrong-pass" }, { "X-EZI-Lang": "id" })).body.error.message).toBe(id.errors.invalidLogin);
    expect((await anon.call("POST", "/auth/login", { email: "nobody@test.example", password: "wrong-pass" })).body.error.message).toBe(en.errors.invalidLogin);
    // Validation messages come from the schema built for that language.
    const bad = await admin.call("POST", "/categories", { name: "", code: "AB" }, { "X-EZI-Lang": "id" });
    expect(bad.body.error.fields).toMatchObject({ name: id.validation.required(id.fields.name), code: id.validation.categoryCode });
    // A message thrown inside a database transaction (the request language survives Prisma's $transaction).
    await admin.ok("POST", "/categories", { name: "Bahasa A", code: "BHA" });
    const taken = await admin.call("POST", "/categories", { name: "Bahasa B", code: "BHA" }, { "X-EZI-Lang": "id" });
    expect(taken.body.error.message).toBe(id.errors.categoryCodeTaken);
    // A malformed body fails before the language middleware and is still answered in that language.
    const raw = await fetch(`${server.base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", "X-EZI-Lang": "id" }, body: "{" });
    expect(((await raw.json()) as { error: { message: string } }).error.message).toBe(id.errors.fix);
    // Anything else falls back to English.
    expect((await anon.call("POST", "/auth/login", { email: "nobody@test.example", password: "x" }, { "X-EZI-Lang": "fr" })).body.error.message).toBe(en.errors.invalidLogin);
  });

  it("uses one message for a wrong password and an unknown email, and logs failed sign-ins", async () => {
    const c = new Client(server.base);
    const wrong = await c.post("/auth/login", { email: adminEmail, password: "wrong-password" });
    const unknown = await c.post("/auth/login", { email: "nobody@test.example", password: "wrong-password" });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
    expect(await prisma.activityLog.count({ where: { action: "Failed login" } })).toBeGreaterThanOrEqual(2);
  });

  it("locks an email after 5 failures with 429", async () => {
    const c = new Client(server.base);
    for (let i = 0; i < 5; i++) await c.post("/auth/login", { email: "locked@test.example", password: "x" });
    expect((await c.post("/auth/login", { email: "locked@test.example", password: "x" })).status).toBe(429);
  });

  it("forces a temporary password to be changed before anything else", async () => {
    const created = await admin.ok("POST", "/users", { name: "New Staff", email: "new.staff@test.example", role: "Staff" });
    const c = new Client(server.base);
    const me = await c.ok("POST", "/auth/login", { email: "new.staff@test.example", password: created.tempPassword });
    expect(me.mustChangePassword).toBe(true);
    expect((await c.get("/items")).status).toBe(403);
    await c.ok("POST", "/auth/change-password", { password: PASSWORD });
    expect((await c.get("/items")).status).toBe(200);
  });

  it("keeps Staff out of Admin endpoints (403) and hides Admin fields", async () => {
    const { client: staff } = await addUser(admin, server.base, "Field Staff", "field.staff@test.example", "Staff");
    for (const path of ["/stock/transactions", "/suppliers", "/users", "/activity-log", "/backup/database", "/expenses/summary?from=2026-01-01&to=2026-12-31", "/export/items", "/reports/stock/export"]) {
      const r = await staff.get(path);
      expect(r.status, path).toBe(403);
      expect(r.body.error.code).toBe("FORBIDDEN");
    }
    expect((await staff.post("/items", {})).status).toBe(403);
    expect((await staff.post("/backup/database", {})).status).toBe(403);
  });

  it("refuses a cross-site write (CSRF) but accepts a same-origin one", async () => {
    expect((await admin.call("POST", "/categories", { name: "X", code: "XXX" }, { "Sec-Fetch-Site": "cross-site" })).status).toBe(403);
    expect((await admin.call("POST", "/categories", { name: "X", code: "XXX" }, { Origin: "http://evil.example" })).status).toBe(403);
    expect((await admin.call("POST", "/categories", { name: "X", code: "XXX" }, { "Sec-Fetch-Site": "same-origin" })).status).toBe(201);
  });

  it("treats SQL injection and script text as plain data (PRD 10.3)", async () => {
    const xss = `<img src=x onerror="alert(1)">`;
    const sqli = `x' OR '1'='1'; DROP TABLE items; --`;
    const data = await masterData(admin, [{ name: xss, stock: 1 }, { name: sqli, stock: 1 }]);
    expect((await admin.ok("GET", `/items/${data.itemIds[0]}`)).name).toBe(xss);
    expect((await admin.get(`/items?search=${encodeURIComponent("' OR '1'='1")}`)).body.data.map((i: { id: number }) => i.id)).toEqual([data.itemIds[1]]);
    expect((await admin.get(`/items?search=${encodeURIComponent("zz' OR '1'='1")}`)).body.data).toEqual([]);
    expect(await prisma.item.count()).toBe(2);
  });

  it("returns field errors as 422 VALIDATION_ERROR and a duplicate as 409 CONFLICT", async () => {
    const bad = await admin.post("/categories", { name: "", code: "12" });
    expect(bad.status).toBe(422);
    expect(bad.body.error).toMatchObject({ code: "VALIDATION_ERROR", fields: { name: expect.any(String), code: expect.any(String) } });
    expect((await admin.post("/categories", { name: "x", code: "XYZ" })).status).toBe(409); // same name as above, any case
    const missing = await admin.get("/no-such-endpoint");
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("NOT_FOUND"); // the API answers JSON, not the static 404 page
  });

  it("keeps a session for 14 days with keep me signed in, otherwise 8 hours", async () => {
    const days = async (keepSignedIn: boolean) => {
      const c = new Client(server.base);
      await c.ok("POST", "/auth/login", { email: adminEmail, password: PASSWORD, keepSignedIn });
      const s = await prisma.session.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
      return Math.round((s.expiresAt.getTime() - Date.now()) / 3_600_000);
    };
    expect(await days(true)).toBe(14 * 24);
    expect(await days(false)).toBe(8);
  });

  it("logs out cleanly, also when the session has already expired", async () => {
    const c = new Client(server.base);
    await c.ok("POST", "/auth/login", { email: adminEmail, password: PASSWORD });
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const r = await c.post("/auth/logout");
    expect(r.status).toBe(200);
    expect(c.cookie).toBe("");
    expect((await c.get("/auth/me")).status).toBe(401);
  });

  it("writes the activity log for sign-in and setup", async () => {
    const actions = (await prisma.activityLog.findMany({ select: { action: true } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["First admin created", "Login", "Failed login", "Password changed", "User created"]));
  });
});
