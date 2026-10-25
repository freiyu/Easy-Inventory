// In-memory prototype store. All screens read and write data only through this module,
// so Stage 2 can replace it with the typed API client and mock adapter in one place.
// State resets on a full page reload; only the demo session survives (sessionStorage).
import { useSyncExternalStore } from "react";
import { today } from "../format";
import type {
  AdjustmentInput,
  CategoryInput,
  FirstAdminInput,
  IncomingInput,
  ItemInput,
  LoanInput,
  OutgoingInput,
  PurchaseInput,
  ReceiveInput,
  ReturnInput,
  SupplierInput,
  UserInput,
} from "../schemas";
import { t } from "../strings";
import type { Result, Role, User } from "../types";
import * as ops from "./ops";
import { createSeed } from "./seed";

export interface State {
  db: ops.DB;
  userId: number | null;
  simulateError: boolean;
}

const SESSION_KEY = "ezi-prototype-session";
const LATENCY_MS = 450;

const readSession = (): number | null => {
  try {
    const v = window.sessionStorage.getItem(SESSION_KEY);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
};
const writeSession = (id: number | null) => {
  try {
    if (id === null) window.sessionStorage.removeItem(SESSION_KEY);
    else window.sessionStorage.setItem(SESSION_KEY, String(id));
  } catch {
    /* storage can be blocked; the demo session just will not survive a reload */
  }
};

const serverState: State = { db: createSeed(), userId: null, simulateError: false };
let state: State =
  typeof window === "undefined"
    ? serverState
    : { db: createSeed(), userId: readSession(), simulateError: false };
const listeners = new Set<() => void>();

function setState(next: State) {
  state = next;
  listeners.forEach((l) => l());
}

export const getState = () => state;
export function useStore(): State {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => serverState,
  );
}

export const currentUser = (s: State = state): User | null =>
  s.userId === null ? null : (s.db.users.find((u) => u.id === s.userId) ?? null);
export const useCurrentUser = (): User | null => currentUser(useStore());

const delay = (ms = LATENCY_MS) => new Promise((r) => setTimeout(r, ms));

/** Runs one operation like an API call: latency, auth check, atomic commit on success. */
async function run<T>(fn: (c: ops.Ctx) => Result<T>): Promise<Result<T>> {
  await delay();
  const user = currentUser();
  if (!user) return ops.fail("UNAUTHENTICATED", t.errors.forbidden);
  const db = structuredClone(state.db);
  const actor = db.users.find((u) => u.id === user.id)!;
  const r = fn({ db, actor, now: new Date().toISOString(), today: today() });
  if (r.ok) setState({ ...state, db });
  return r;
}

// ---------------------------------------------------------------------- auth

// The prototype accepts any password, so only the email is used.
export async function login(email: string): Promise<Result<User>> {
  await delay();
  const db = structuredClone(state.db);
  const user = db.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
  // Generic message on purpose (PRD 3.4).
  if (!user || user.status !== "Active") return ops.fail("UNAUTHENTICATED", t.errors.invalidLogin);
  user.lastLoginAt = new Date().toISOString();
  ops.log({ db, actor: user, now: user.lastLoginAt, today: today() }, "Login", "Auth", user.email);
  writeSession(user.id);
  setState({ ...state, db, userId: user.id });
  return ops.ok(user);
}

export function logout() {
  writeSession(null);
  setState({ ...state, userId: null });
}

export const changeOwnPassword = () =>
  run((c) => {
    c.actor.mustChangePassword = false;
    ops.log(c, "Password changed", "Auth", c.actor.email);
    return ops.ok(c.actor);
  });

export async function firstRunSetup(input: FirstAdminInput): Promise<Result<User>> {
  await delay();
  if (state.db.users.length > 0) return ops.fail("FORBIDDEN", t.errors.forbidden);
  const db = structuredClone(state.db);
  const user: User = {
    id: ops.nextId(db, "user"),
    name: input.name,
    email: input.email,
    role: "Admin",
    status: "Active",
    mustChangePassword: false,
    lastLoginAt: null,
    createdAt: new Date().toISOString(),
  };
  db.users.push(user);
  ops.log({ db, actor: user, now: user.createdAt, today: today() }, "First admin created", "Setup", user.email);
  setState({ ...state, db });
  return ops.ok(user);
}

// ------------------------------------------------------------- demo controls

export function switchDemoRole(role: Role) {
  const user = state.db.users.find((u) => u.role === role && u.status === "Active" && !u.mustChangePassword);
  if (!user) return;
  writeSession(user.id);
  setState({ ...state, userId: user.id });
}
export function resetDemoData() {
  writeSession(null);
  setState({ db: createSeed(), userId: null, simulateError: false });
}
export function enterFirstRunDemo() {
  writeSession(null);
  const db = createSeed();
  db.users = [];
  setState({ db, userId: null, simulateError: false });
}
export function setSimulateError(simulateError: boolean) {
  setState({ ...state, simulateError });
}

// ----------------------------------------------------------------- mutations
// One function per API endpoint (PRD 6.6). Each returns a Result and never throws.

export const api = {
  items: {
    create: (v: ItemInput) => run((c) => ops.createItem(c, v)),
    update: (id: number, v: ItemInput) => run((c) => ops.updateItem(c, id, v)),
    deactivate: (id: number) => run((c) => ops.setItemStatus(c, id, "Inactive")),
    activate: (id: number) => run((c) => ops.setItemStatus(c, id, "Active")),
    remove: (id: number) => run((c) => ops.deleteItem(c, id)),
  },
  categories: {
    save: (id: number | null, v: CategoryInput) => run((c) => ops.saveCategory(c, id, v)),
    deactivate: (id: number) => run((c) => ops.setCategoryStatus(c, id, "Inactive")),
    activate: (id: number) => run((c) => ops.setCategoryStatus(c, id, "Active")),
    remove: (id: number) => run((c) => ops.deleteCategory(c, id)),
  },
  suppliers: {
    save: (id: number | null, v: SupplierInput) => run((c) => ops.saveSupplier(c, id, v)),
    deactivate: (id: number) => run((c) => ops.setSupplierStatus(c, id, "Inactive")),
    activate: (id: number) => run((c) => ops.setSupplierStatus(c, id, "Active")),
    remove: (id: number) => run((c) => ops.deleteSupplier(c, id)),
  },
  stock: {
    in: (v: IncomingInput) => run((c) => ops.stockIn(c, v)),
    out: (v: OutgoingInput) => run((c) => ops.stockOut(c, v)),
    adjust: (v: AdjustmentInput) => run((c) => ops.stockAdjustment(c, v)),
    void: (id: number, reason: string) => run((c) => ops.voidTransaction(c, id, reason)),
  },
  loans: {
    create: (v: LoanInput, submit: boolean) => run((c) => ops.createLoan(c, v, submit)),
    update: (id: number, v: LoanInput, submit: boolean) => run((c) => ops.updateLoanDraft(c, id, v, submit)),
    submit: (id: number) => run((c) => ops.submitLoan(c, id)),
    cancel: (id: number) => run((c) => ops.cancelLoan(c, id)),
    approve: (id: number) => run((c) => ops.approveLoan(c, id)),
    reject: (id: number, reason: string) => run((c) => ops.rejectLoan(c, id, reason)),
    issue: (id: number) => run((c) => ops.issueLoan(c, id)),
    return: (id: number, v: ReturnInput) => run((c) => ops.returnLoan(c, id, v)),
  },
  purchases: {
    create: (v: PurchaseInput, submit: boolean) => run((c) => ops.createPurchase(c, v, submit)),
    update: (id: number, v: PurchaseInput, submit: boolean) => run((c) => ops.updatePurchaseDraft(c, id, v, submit)),
    submit: (id: number) => run((c) => ops.submitPurchase(c, id)),
    cancel: (id: number) => run((c) => ops.cancelPurchase(c, id)),
    approve: (id: number) => run((c) => ops.approvePurchase(c, id)),
    reject: (id: number, reason: string) => run((c) => ops.rejectPurchase(c, id, reason)),
    receive: (id: number, v: ReceiveInput) => run((c) => ops.receivePurchase(c, id, v)),
  },
  users: {
    create: (v: UserInput) => run((c) => ops.createUser(c, v)),
    update: (id: number, v: UserInput) => run((c) => ops.updateUser(c, id, v)),
    deactivate: (id: number) => run((c) => ops.setUserStatus(c, id, "Inactive")),
    activate: (id: number) => run((c) => ops.setUserStatus(c, id, "Active")),
    resetPassword: (id: number) => run((c) => ops.resetUserPassword(c, id)),
  },
  backup: {
    create: () => run((c) => ops.createBackup(c)),
  },
};
