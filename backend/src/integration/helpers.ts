// Shared plumbing for the integration tests: the real app on a random port, a cookie-keeping HTTP client,
// a data wipe between files and the two standard accounts.
import type { AddressInfo } from "node:net";
import { createApp } from "../app";
import { prisma } from "../db";
import { today } from "../shared";
import { assertTestDatabase } from "./test-env";

export const PASSWORD = "integration-pass-1";
export const TODAY = today();

export async function startServer() {
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, close: () => new Promise((r) => server.close(r)) };
}

/** Empties every table except the seeded roles and the migration history. */
export async function resetData() {
  assertTestDatabase();
  await prisma.$transaction(async (tx) => {
    const tables = await tx.$queryRaw<{ name: string }[]>`SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()`;
    await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 0");
    for (const { name } of tables) if (name !== "roles" && name !== "_prisma_migrations") await tx.$executeRawUnsafe(`TRUNCATE TABLE \`${name}\``);
    await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 1");
  });
}

// shortcut: response bodies are checked field by field in each test, so they stay untyped here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Body = any;
export interface Reply {
  status: number;
  body: Body;
  headers: Headers;
  raw: ArrayBuffer | null;
}

/** One browser: keeps the session cookie between calls, like the frontend's same-origin fetch. */
export class Client {
  cookie = "";
  constructor(readonly base: string) {}

  async call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Reply> {
    const res = await fetch(`${this.base}/api${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(this.cookie ? { Cookie: this.cookie } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.getSetCookie().find((c) => c.startsWith("ezi_session="));
    if (set) this.cookie = set.split(";")[0] === "ezi_session=" ? "" : set.split(";")[0];
    const json = (res.headers.get("content-type") ?? "").includes("application/json");
    return { status: res.status, body: json ? await res.json() : null, headers: res.headers, raw: json ? null : await res.arrayBuffer() };
  }
  get = (path: string) => this.call("GET", path);
  post = (path: string, body?: unknown) => this.call("POST", path, body);
  put = (path: string, body?: unknown) => this.call("PUT", path, body);
  del = (path: string) => this.call("DELETE", path);

  /** Fails the test with the server's answer when the call did not succeed. */
  async ok(method: string, path: string, body?: unknown): Promise<Body> {
    const r = await this.call(method, path, body);
    if (r.status >= 300 || !r.body?.success) throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(r.body)}`);
    return r.body.data;
  }
}

/** First-run setup, then an active Staff account with its own password (PRD 3.3, 3.4). */
export async function setupAccounts(base: string) {
  const admin = new Client(base);
  await admin.ok("POST", "/setup/first-admin", { name: "Admin One", email: "admin@test.example", password: PASSWORD });
  await admin.ok("POST", "/auth/login", { email: "admin@test.example", password: PASSWORD });
  const staffUser = await addUser(admin, base, "Staff One", "staff@test.example", "Staff");
  return { admin, staff: staffUser.client, staffId: staffUser.id as number, adminId: (await admin.ok("GET", "/auth/me")).id as number };
}

/** Creates a user as Admin and signs them in with a permanent password. */
export async function addUser(admin: Client, base: string, name: string, email: string, role: "Admin" | "Staff") {
  const created = await admin.ok("POST", "/users", { name, email, role });
  const client = new Client(base);
  await client.ok("POST", "/auth/login", { email, password: created.tempPassword });
  await client.ok("POST", "/auth/change-password", { password: PASSWORD });
  return { client, id: created.user.id as number };
}

/** A category, a supplier and items with opening stock (posted as ADJUSTMENT, PRD 4.2). */
export async function masterData(admin: Client, items: { name: string; stock: number }[]) {
  const category = await admin.ok("POST", "/categories", { name: "Office", code: "OFF" });
  const supplier = await admin.ok("POST", "/suppliers", { name: "Toko Test" });
  const ids: number[] = [];
  for (const i of items) {
    const item = await admin.ok("POST", "/items", {
      name: i.name, categoryId: category.id, unit: "pcs", openingStock: i.stock, minimumStock: 1, lastPurchasePrice: 1000, supplierId: supplier.id,
    });
    ids.push(item.id);
  }
  return { categoryId: category.id as number, supplierId: supplier.id as number, itemIds: ids };
}

/** PRD 7.4: every item's maintained balance equals the sum of its ledger lines and is never negative. */
export async function ledgerMismatches() {
  return prisma.$queryRaw<{ id: number }[]>`
    SELECT i.id FROM items i LEFT JOIN stock_transaction_items l ON l.item_id = i.id
    GROUP BY i.id, i.current_stock HAVING i.current_stock <> COALESCE(SUM(l.quantity_change), 0) OR i.current_stock < 0`;
}
