// Setup, login, logout, session and password routes (PRD 3.3, 3.4, 6.6).
import { t } from "../../strings";
import type { User } from "../../types";
import { fail, log, nextId, ok } from "../ops";
import { mock, sessionStore } from "../state";
import type { Route } from "./types";

const MAX_FAILED = 5;
const LOCK_MS = 60_000;
const str = (v: unknown) => (typeof v === "string" ? v : "");

export const authRoutes: Route[] = [
  { method: "GET", path: "/setup/status", public: true, run: ({ c }) => ok({ needsSetup: c.db.users.length === 0 }) },
  {
    method: "POST",
    path: "/setup/first-admin",
    public: true,
    run: ({ c, body }) => {
      if (c.db.users.length > 0) return fail("FORBIDDEN", t.errors.setupDone);
      const name = str(body.name).trim();
      const email = str(body.email).trim();
      const password = str(body.password);
      if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) return fail("VALIDATION_ERROR", t.errors.fix);
      const user: User = {
        id: nextId(c.db, "user"), name, email, role: "Admin", status: "Active",
        mustChangePassword: false, lastLoginAt: null, createdAt: c.now,
      };
      c.db.users.push(user);
      mock.passwords.set(user.id, password);
      log({ ...c, actor: user }, "First admin created", "Setup", user.email);
      return ok(user);
    },
  },
  {
    method: "POST",
    path: "/auth/login",
    public: true,
    run: ({ c, body }) => {
      const email = str(body.email).trim().toLowerCase();
      const saved = mock.attempts.get(email);
      const lock = saved && (saved.until === 0 || saved.until > Date.now()) ? saved : undefined; // an expired lock starts over
      if (lock && lock.until > Date.now()) return fail("RATE_LIMITED", t.errors.rateLimited);
      const user = c.db.users.find((u) => u.email.toLowerCase() === email);
      // One generic message for every failure (PRD 3.4).
      if (!user || user.status !== "Active" || mock.passwords.get(user.id) !== str(body.password)) {
        const count = (lock?.count ?? 0) + 1;
        mock.attempts.set(email, { count, until: count >= MAX_FAILED ? Date.now() + LOCK_MS : 0 });
        return fail("UNAUTHENTICATED", t.errors.invalidLogin);
      }
      mock.attempts.delete(email);
      user.lastLoginAt = c.now;
      log({ ...c, actor: user }, "Login", "Auth", user.email);
      // Written after the checks; the adapter commits the copy of the database that holds lastLoginAt.
      sessionStore.write(user.id);
      return ok(user);
    },
  },
  { method: "POST", path: "/auth/logout", run: () => (sessionStore.write(null), ok(null)) },
  { method: "GET", path: "/auth/me", run: ({ c }) => ok(c.actor) },
  {
    method: "POST",
    path: "/auth/change-password",
    run: ({ c, body }) => {
      const current = str(body.current);
      const password = str(body.password);
      if (password.length < 8 || password.length > 200) return fail("VALIDATION_ERROR", t.errors.fix, { password: t.validation.passwordLength });
      if (current && current !== mock.passwords.get(c.actor.id)) return fail("VALIDATION_ERROR", t.errors.fix, { current: t.errors.currentPassword });
      mock.passwords.set(c.actor.id, password);
      c.actor.mustChangePassword = false;
      log(c, "Password changed", "Auth", c.actor.email);
      return ok(c.actor);
    },
  },
];
