// Users and the activity log (PRD 4.11, 4.12, BR-22). Admin only.
import { randomInt } from "node:crypto";
import { hashPassword, userDto } from "../auth";
import type { Prisma, Tx } from "../db";
import { fail, notFound } from "../http";
import { clampPage, filterId, filterValue, pageParams, paged, searchRows, sortParam, type Query } from "../list";
import { t } from "../shared";
import { iso, log, write, type Ctx, type SessionUser } from "./core";

const e = t.errors;

export async function listUsers(c: Ctx, q: Query) {
  const role = filterValue(q, "role"), status = filterValue(q, "status");
  const users = await c.tx.user.findMany({ where: { ...(role ? { role: { name: role } } : {}), ...(status ? { status } : {}) }, include: { role: true } });
  const rows = searchRows(users.map(userDto), q, (u) => [u.name, u.email]);
  return paged(rows, q, { name: (u) => u.name, email: (u) => u.email, role: (u) => u.role, status: (u) => u.status, last: (u) => u.lastLoginAt ?? "" }, "name:asc");
}

export async function oneUser(c: Ctx, id: number) {
  const u = await c.tx.user.findUnique({ where: { id }, include: { role: true } });
  if (!u) throw notFound();
  return userDto(u);
}

/** A readable temporary password; the user must change it at the next sign-in (PRD 3.4). */
function tempPassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: 10 }, () => chars[randomInt(chars.length)]).join("");
}

/** Locks the active Admin rows so two requests cannot remove the last Admin together (BR-22). */
async function activeAdmins(tx: Tx): Promise<number[]> {
  const rows = await tx.$queryRaw<{ id: number }[]>`SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'Admin' AND u.status = 'Active' FOR UPDATE`;
  return rows.map((r) => Number(r.id));
}

type UserInput = { name: string; email: string; role: "Admin" | "Staff" };

async function emailFree(tx: Tx, email: string, id?: number) {
  if (await tx.user.findFirst({ where: { email, ...(id ? { NOT: { id } } : {}) } })) throw fail("CONFLICT", e.emailTaken, { email: e.emailTaken });
}

export async function createUser(actor: SessionUser, input: UserInput) {
  const password = tempPassword();
  const passwordHash = await hashPassword(password);
  return write(actor, async (c) => {
    await emailFree(c.tx, input.email);
    const user = await c.tx.user.create({
      data: { name: input.name, email: input.email, passwordHash, mustChangePassword: true, role: { connect: { name: input.role } } },
      include: { role: true },
    });
    await log(c, "User created", "Users", user.email);
    return { user: userDto(user), tempPassword: password };
  });
}

export function updateUser(actor: SessionUser, id: number, input: UserInput) {
  return write(actor, async (c) => {
    const admins = await activeAdmins(c.tx);
    const user = await c.tx.user.findUnique({ where: { id }, include: { role: true } });
    if (!user) throw notFound();
    await emailFree(c.tx, input.email, id);
    if (admins.includes(id) && input.role !== "Admin" && admins.length <= 1) throw fail("BUSINESS_RULE_VIOLATION", e.lastAdmin);
    const saved = await c.tx.user.update({
      where: { id }, data: { name: input.name, email: input.email, role: { connect: { name: input.role } } }, include: { role: true },
    });
    await log(c, "User updated", "Users", saved.email);
    return userDto(saved);
  });
}

/** Deactivating ends the user's sessions at once; the last active Admin stays (BR-22). */
export function setUserStatus(actor: SessionUser, id: number, status: "Active" | "Inactive") {
  return write(actor, async (c) => {
    const admins = await activeAdmins(c.tx);
    const user = await c.tx.user.findUnique({ where: { id } });
    if (!user) throw notFound();
    if (status === "Inactive" && admins.includes(id) && admins.length <= 1) throw fail("BUSINESS_RULE_VIOLATION", e.lastAdmin);
    const saved = await c.tx.user.update({ where: { id }, data: { status }, include: { role: true } });
    if (status === "Inactive") await c.tx.session.deleteMany({ where: { userId: id } });
    await log(c, status === "Active" ? "User activated" : "User deactivated", "Users", saved.email);
    return userDto(saved);
  });
}

export async function resetUserPassword(actor: SessionUser, id: number) {
  const password = tempPassword();
  const passwordHash = await hashPassword(password);
  return write(actor, async (c) => {
    const user = await c.tx.user.findUnique({ where: { id } });
    if (!user) throw notFound();
    await c.tx.user.update({ where: { id }, data: { passwordHash, mustChangePassword: true } });
    await log(c, "Password reset", "Users", user.email);
    return { tempPassword: password };
  });
}

// ------------------------------------------------------------- activity log

const metaText = (m: Prisma.JsonValue) => (m === null ? "" : typeof m === "string" ? m : JSON.stringify(m));

export async function listActivity(c: Ctx, q: Query) {
  const where: Prisma.ActivityLogWhereInput = {};
  const moduleName = filterValue(q, "module"), userId = filterId(q, "userId"), search = filterValue(q, "search");
  if (moduleName) where.module = moduleName;
  if (userId) where.userId = userId;
  const from = filterValue(q, "from"), to = filterValue(q, "to");
  // Days in the application time zone (UTC+7).
  if (from || to) where.createdAt = { gte: from ? new Date(`${from}T00:00:00+07:00`) : undefined, lt: to ? new Date(Date.parse(`${to}T00:00:00+07:00`) + 86_400_000) : undefined };
  if (search) {
    where.OR = [
      { action: { contains: search } }, { reference: { contains: search } }, { user: { name: { contains: search } } },
      { metadata: { path: "$", string_contains: search } },
    ];
  }
  const [field, dir] = sortParam(q, ["time", "user", "action", "module"], "time:desc");
  const orderBy: Prisma.ActivityLogOrderByWithRelationInput[] = {
    time: [{ createdAt: dir }, { id: dir }],
    user: [{ user: { name: dir } }, { id: "desc" as const }],
    action: [{ action: dir }, { id: "desc" as const }],
    module: [{ module: dir }, { id: "desc" as const }],
  }[field]!;
  const { page: want, pageSize } = pageParams(q);
  const total = await c.tx.activityLog.count({ where });
  const page = clampPage(want, pageSize, total);
  const rows = await c.tx.activityLog.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize, include: { user: { select: { name: true } } } });
  return {
    rows: rows.map((a) => ({
      id: a.id, userId: a.userId, action: a.action, module: a.module, reference: a.reference, metadata: metaText(a.metadata),
      createdAt: iso(a.createdAt), userName: a.user?.name ?? null,
    })),
    meta: { page, pageSize, total },
  };
}

export async function activityModules(c: Ctx) {
  const rows = await c.tx.activityLog.findMany({ distinct: ["module"], select: { module: true }, orderBy: { module: "asc" } });
  return rows.map((r) => r.module);
}
