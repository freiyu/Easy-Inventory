// Mock server state: the in-memory database, hidden passwords, the idempotency cache and the
// stand-in for the session cookie. Development only; removed in Stage 4 together with lib/mock.
import type { Envelope } from "../api/types";
import type { User } from "../types";
import type { DB } from "./ops";
import { createSeed } from "./seed";

export const DEMO_PASSWORD = "Demo#2026";

export interface MockState {
  db: DB;
  /** User id to password. Plain text is fine here: it is fake data in browser memory, never stored. */
  passwords: Map<number, string>;
  /** `userId:path:clientRequestId` to the first answer (BR-19). */
  idem: Map<string, Envelope<unknown>>;
  /** Failed login counter per email (PRD 3.4 rate limit). */
  attempts: Map<string, { count: number; until: number }>;
}

const SESSION_KEY = "ezi-mock-session";

function fresh(firstRun = false): MockState {
  const db = createSeed();
  if (firstRun) db.users = [];
  return { db, passwords: new Map(db.users.map((u) => [u.id, DEMO_PASSWORD])), idem: new Map(), attempts: new Map() };
}

// The demo data survives a reload (so the human can walk through a flow across pages and roles).
// Only the database is kept, never passwords: after a reload every user accepts the demo password again.
// Bump DB_VERSION when the seed or the data model changes, so old saved data is dropped.
const DB_KEY = "ezi-mock-db";
const DB_VERSION = 1;

function saved(): DB | null {
  try {
    const raw = window.localStorage.getItem(DB_KEY);
    const parsed = raw ? (JSON.parse(raw) as { v: number; db: DB }) : null;
    return parsed?.v === DB_VERSION ? parsed.db : null;
  } catch {
    return null;
  }
}

/** Called by the adapter after every committed write. */
export function persist() {
  try {
    window.localStorage.setItem(DB_KEY, JSON.stringify({ v: DB_VERSION, db: mock.db }));
  } catch {
    /* blocked or full storage: the demo data just resets on reload */
  }
}

function initial(): MockState {
  const state = fresh();
  const db = typeof window === "undefined" ? null : saved();
  if (db) {
    state.db = db;
    state.passwords = new Map(db.users.map((u) => [u.id, DEMO_PASSWORD]));
  }
  return state;
}

export const mock: MockState = initial();

/** Stand-in for the HttpOnly session cookie: survives a reload, not a closed tab. */
let memorySession: number | null = null; // used when sessionStorage is missing (tests) or blocked
export const sessionStore = {
  read(): number | null {
    try {
      const v = window.sessionStorage.getItem(SESSION_KEY);
      return v ? Number(v) : memorySession;
    } catch {
      return memorySession;
    }
  },
  write(id: number | null) {
    memorySession = id;
    try {
      if (id === null) window.sessionStorage.removeItem(SESSION_KEY);
      else window.sessionStorage.setItem(SESSION_KEY, String(id));
    } catch {
      /* blocked storage: the session just will not survive a reload */
    }
  },
};

export const sessionUser = (): User | null => {
  const id = sessionStore.read();
  return id === null ? null : (mock.db.users.find((u) => u.id === id && u.status === "Active") ?? null);
};

/** Dev helper (browser console): window.__eziMock.reset() or .reset({ firstRun: true }) to see the setup screen. */
export function resetMock(opts: { firstRun?: boolean } = {}) {
  Object.assign(mock, fresh(opts.firstRun));
  sessionStore.write(null);
  try {
    window.localStorage.removeItem(DB_KEY);
  } catch {
    /* nothing saved */
  }
}
if (typeof window !== "undefined") {
  (window as unknown as { __eziMock: unknown }).__eziMock = { reset: resetMock, demoPassword: DEMO_PASSWORD };
}
