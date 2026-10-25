// Authentication (PRD 3.3, 3.4, 6.7): Argon2id passwords, database-backed sessions in a signed HttpOnly
// SameSite=Lax cookie, login rate limiting, first-run setup, CSRF origin check and the role guards.
import { createHash, randomBytes } from "node:crypto";
import argon2 from "argon2";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { prisma } from "./db";
import { fail, forbidden } from "./http";
import { iso, isoOrNull, log, write, type SessionUser } from "./services/core";
import { t, type Role } from "./shared";

export const COOKIE = "ezi_session";
const SHORT_MS = 8 * 60 * 60 * 1000; // 8 hours
const LONG_MS = 7 * 24 * 60 * 60 * 1000; // "Keep me signed in": 7 days
const MAX_FAILED = 5;
const WINDOW_MS = 10 * 60 * 1000; // 5 failures within 10 minutes lock the account/IP pair for 10 minutes

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

export const hashPassword = (pw: string) => argon2.hash(pw, { type: argon2.argon2id });
const verifyPassword = (hash: string, pw: string) => argon2.verify(hash, pw).catch(() => false);
// Verified when the email is unknown, so a wrong email takes as long as a wrong password.
const DUMMY_HASH = hashPassword(randomBytes(16).toString("hex"));
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

type UserRow = { id: number; name: string; email: string; status: string; mustChangePassword: boolean; lastLoginAt: Date | null; createdAt: Date; role: { name: string } };
export const userDto = (u: UserRow): SessionUser => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role.name as Role,
  status: u.status as SessionUser["status"],
  mustChangePassword: u.mustChangePassword,
  lastLoginAt: isoOrNull(u.lastLoginAt),
  createdAt: iso(u.createdAt),
});

// ---------------------------------------------------------------- middleware

/** Reads the session cookie; an expired session, or one of an inactive user, counts as logged out. */
export const loadSession: RequestHandler = async (req, _res, next) => {
  const token = req.signedCookies?.[COOKIE];
  if (typeof token === "string" && token) {
    const s = await prisma.session.findUnique({ where: { id: sha256(token) }, include: { user: { include: { role: true } } } });
    if (s && s.expiresAt > new Date() && s.user.status === "Active") req.user = userDto(s.user);
    else if (s) await prisma.session.delete({ where: { id: s.id } }).catch(() => undefined);
  }
  next();
};

// While a temporary password is in use, only these paths work (PRD 3.4: the change is forced).
const PASSWORD_PATHS = new Set(["/auth/me", "/auth/logout", "/auth/change-password"]);

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.user) throw fail("UNAUTHENTICATED", t.errors.signedOut);
  if (req.user.mustChangePassword && !PASSWORD_PATHS.has(req.path)) throw forbidden();
  next();
};

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (req.user?.role !== "Admin") throw forbidden();
  next();
};

/**
 * CSRF protection for state-changing requests (PRD 6.7). The app is same-origin by design, so a write from
 * another site is refused: browsers send Sec-Fetch-Site, which a page cannot fake; older browsers send Origin.
 */
export function sameOrigin(req: Request, _res: Response, next: NextFunction) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
  const site = req.get("sec-fetch-site");
  if (site) {
    if (site !== "same-origin" && site !== "none") throw forbidden();
    return next();
  }
  const origin = req.get("origin");
  if (origin && URL.parse(origin)?.host !== req.get("host")) throw forbidden(); // "null" or junk is refused too
  next();
}

// ------------------------------------------------------------- rate limiting

// shortcut: kept in memory, so a restart clears it; fine for one process on one host (PRD 2.3), move to the DB if EZI ever runs several processes.
const attempts = new Map<string, { count: number; first: number; lockedUntil: number }>();

function checkLock(key: string, now: number) {
  const a = attempts.get(key);
  if (a && a.lockedUntil > now) throw fail("RATE_LIMITED", t.errors.rateLimited);
}
function recordFailure(key: string, now: number) {
  const a = attempts.get(key);
  const fresh = !a || now - a.first > WINDOW_MS || (a.lockedUntil !== 0 && a.lockedUntil <= now);
  const next = fresh ? { count: 1, first: now, lockedUntil: 0 } : { ...a, count: a.count + 1 };
  if (next.count >= MAX_FAILED) next.lockedUntil = now + WINDOW_MS;
  attempts.set(key, next);
}

// ------------------------------------------------------------------ sessions

async function startSession(res: Response, userId: number, keep: boolean) {
  const token = randomBytes(32).toString("base64url");
  const ttl = keep ? LONG_MS : SHORT_MS;
  await prisma.session.create({ data: { id: sha256(token), userId, expiresAt: new Date(Date.now() + ttl) } });
  await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }); // housekeeping
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: "lax", signed: true, path: "/", ...(keep ? { maxAge: ttl } : {}) });
}

// ------------------------------------------------------------------ handlers

export async function setupStatus() {
  return { needsSetup: (await prisma.user.count()) === 0 };
}

/** PRD 3.3: only while no user exists; the first account is always an Admin. */
export async function createFirstAdmin(input: { name: string; email: string; password: string }) {
  const passwordHash = await hashPassword(input.password);
  return prisma.$transaction(async (tx) => {
    // Lock the role rows so two first-run requests at the same moment cannot both pass the check.
    await tx.$queryRaw`SELECT id FROM roles FOR UPDATE`;
    if ((await tx.user.count()) > 0) throw fail("FORBIDDEN", t.errors.setupDone);
    const role = await tx.role.findUniqueOrThrow({ where: { name: "Admin" } });
    const user = await tx.user.create({ data: { name: input.name, email: input.email, passwordHash, roleId: role.id }, include: { role: true } });
    await tx.activityLog.create({ data: { userId: user.id, action: "First admin created", module: "Setup", reference: user.email } });
    return userDto(user);
  });
}

export async function login(req: Request, res: Response, input: { email: string; password: string; keepSignedIn: boolean }) {
  const email = input.email.trim().toLowerCase();
  const key = `${email}|${req.ip}`;
  const now = Date.now();
  checkLock(key, now);
  const user = email ? await prisma.user.findUnique({ where: { email }, include: { role: true } }) : null;
  const good = user ? await verifyPassword(user.passwordHash, input.password) : (await verifyPassword(await DUMMY_HASH, input.password), false);
  // One generic message for every failure (PRD 3.4).
  if (!user || !good || user.status !== "Active") {
    recordFailure(key, now);
    // PRD 4.12: failed sign-ins are logged too (the typed email, never the password).
    await prisma.activityLog.create({ data: { userId: user?.id ?? null, action: "Failed login", module: "Auth", reference: email.slice(0, 200) } });
    throw fail("UNAUTHENTICATED", t.errors.invalidLogin);
  }
  attempts.delete(key);
  const updated = await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() }, include: { role: true } });
  await prisma.activityLog.create({ data: { userId: user.id, action: "Login", module: "Auth", reference: user.email } });
  await startSession(res, user.id, input.keepSignedIn);
  return userDto(updated);
}

export async function logout(req: Request, res: Response) {
  const token = req.signedCookies?.[COOKIE];
  if (typeof token === "string" && token) await prisma.session.deleteMany({ where: { id: sha256(token) } });
  res.clearCookie(COOKIE, { path: "/" });
  return null;
}

/** The current password is required, except when a temporary password must be replaced (PRD 3.4). */
export async function changePassword(actor: SessionUser, input: { current?: string; password: string }) {
  const passwordHash = await hashPassword(input.password);
  return write(actor, async (c) => {
    const user = await c.tx.user.findUniqueOrThrow({ where: { id: actor.id } });
    if (!user.mustChangePassword && !(await verifyPassword(user.passwordHash, input.current ?? ""))) {
      throw fail("VALIDATION_ERROR", t.errors.fix, { current: t.errors.currentPassword });
    }
    const updated = await c.tx.user.update({ where: { id: actor.id }, data: { passwordHash, mustChangePassword: false }, include: { role: true } });
    await log(c, "Password changed", "Auth", actor.email);
    return userDto(updated);
  });
}
