// PRD 10.1 Authentication and 10.3 security checks that a browser can see.
import { expect, test } from "@playwright/test";
import { ADMIN, STAFF, apiAs, ok, signIn, textbox } from "./helpers";

test("invalid login is refused and stays on the sign-in page", async ({ page }) => {
  await signIn(page, { email: ADMIN.email, password: "wrong-pass-1" });
  await expect(page.getByRole("alert").filter({ hasText: /incorrect|invalid/i })).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("a protected page sends a signed-out visitor to sign in", async ({ page }) => {
  await page.goto("/items");
  await expect(page).toHaveURL(/\/login/);
});

test("keep me signed in sets a 14-day cookie; without it the cookie ends with the browser", async ({ page, context }) => {
  await signIn(page, ADMIN);
  await expect(page).toHaveURL(/\/dashboard/);
  let cookie = (await context.cookies()).find((c) => c.name === "ezi_session");
  expect(cookie?.expires).toBe(-1);

  await context.clearCookies();
  await page.goto("/login");
  await textbox(page, "Email").fill(ADMIN.email);
  await textbox(page, "Password").fill(ADMIN.password);
  await page.getByRole("checkbox", { name: "Keep me signed in for 14 days" }).check();
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  cookie = (await context.cookies()).find((c) => c.name === "ezi_session");
  const days = (cookie!.expires * 1000 - Date.now()) / 86_400_000;
  expect(days).toBeGreaterThan(13.9);
  expect(days).toBeLessThanOrEqual(14);
});

test("logout ends the session: the old cookie no longer works", async ({ page, context }) => {
  await signIn(page, ADMIN);
  await expect(page).toHaveURL(/\/dashboard/);
  const old = (await context.cookies()).find((c) => c.name === "ezi_session")!;
  const header = { Cookie: `ezi_session=${old.value}` };
  expect((await page.request.get("/api/auth/me", { headers: header })).status()).toBe(200);
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: /sign out/i }).click();
  await expect(page).toHaveURL(/\/login/);
  await context.clearCookies();
  const res = await page.request.get("/api/auth/me", { headers: header });
  expect(res.status()).toBe(401);
});

test("five failed logins lock that email for a while", async ({ request }) => {
  const email = "nobody@example.test";
  for (let i = 0; i < 5; i++) await request.post("/api/auth/login", { data: { email, password: "wrong-pass-1" } });
  const sixth = await request.post("/api/auth/login", { data: { email, password: "wrong-pass-1" } });
  expect((await sixth.json()).error.code).toBe("RATE_LIMITED");
});

test("a password reset by an Admin forces a new password at the next sign-in", async ({ page, baseURL }) => {
  const admin = await apiAs(baseURL!, ADMIN);
  const created = await ok(admin, "post", "/users", { name: "Staf Reset", email: "staf.reset@example.test", role: "Staff" });
  const reset = await ok(admin, "post", `/users/${created.user.id}/reset-password`);

  await signIn(page, { email: "staf.reset@example.test", password: reset.tempPassword });
  await expect(page).toHaveURL(/\/change-password/);
  // Until it is changed, other pages stay closed (PRD 3.4).
  await page.goto("/items");
  await expect(page).toHaveURL(/\/change-password/);
});

test("Staff calling Admin endpoints directly get 403 (PRD 10.3)", async ({ baseURL }) => {
  const staff = await apiAs(baseURL!, STAFF);
  for (const path of ["/users", "/backup/database", "/activity-log", "/suppliers", "/export/items", "/reports/stock"]) {
    const res = await staff.get(`/api${path}`);
    expect(res.status(), path).toBe(403);
  }
  const write = await staff.post("/api/categories", { data: { name: "Hack", code: "HCK" } });
  expect(write.status()).toBe(403);
});

test("a cross-site write is refused (CSRF, PRD 6.7)", async ({ baseURL }) => {
  const admin = await apiAs(baseURL!, ADMIN);
  const res = await admin.post("/api/categories", { data: { name: "Lintas", code: "LTS" }, headers: { Origin: "http://evil.example", "Sec-Fetch-Site": "cross-site" } });
  expect(res.status()).toBe(403);
});

test("API responses never carry password hashes", async ({ baseURL }) => {
  const admin = await apiAs(baseURL!, ADMIN);
  const text = await (await admin.get("/api/users")).text();
  expect(text).not.toMatch(/passwordHash|password_hash|\$argon2/);
});
