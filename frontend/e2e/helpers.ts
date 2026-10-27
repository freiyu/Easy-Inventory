// Shared fake accounts and data for the E2E run. Never real office data (the repository is public).
import { expect, request, type APIRequestContext, type Page } from "@playwright/test";

export const ADMIN = { name: "Admin Satu", email: "admin@example.test", password: "admin-pass-1" };
export const STAFF = { name: "Staf Satu", email: "staf@example.test", password: "staf-pass-1" };
export const ADMIN_STATE = "e2e/.auth/admin.json";
export const STAFF_STATE = "e2e/.auth/staff.json";

/** Signed-in API client; returns `data` of a success envelope and fails the test otherwise. */
export async function apiAs(baseURL: string, user: { email: string; password: string }) {
  const ctx = await request.newContext({ baseURL });
  const res = await ctx.post("/api/auth/login", { data: { email: user.email, password: user.password } });
  expect(res.ok(), await res.text()).toBeTruthy();
  return ctx;
}

export async function ok(ctx: APIRequestContext, method: "get" | "post" | "put" | "delete", path: string, data?: unknown) {
  const res = await ctx[method](`/api${path}`, data === undefined ? undefined : { data });
  const body = await res.json();
  expect(body.success, `${method.toUpperCase()} ${path}: ${JSON.stringify(body)}`).toBe(true);
  return body.data;
}

/** yyyy-mm-dd, `days` from today, so date rules (no past needed-by date) never expire the tests. */
export const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

export const textbox = (page: Page, name: string) => page.getByRole("textbox", { name, exact: true });

/** Picks an option in a shadcn/base-ui select by its label. */
export async function choose(page: Page, label: string, option: string | RegExp, scope = page.locator("body")) {
  await scope.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option }).first().click();
}

export async function signIn(page: Page, user: { email: string; password: string }) {
  await page.goto("/login");
  await textbox(page, "Email").fill(user.email);
  await textbox(page, "Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
}
