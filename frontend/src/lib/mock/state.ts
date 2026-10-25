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

export const mock: MockState = fresh();

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
}
if (typeof window !== "undefined") {
  (window as unknown as { __eziMock: unknown }).__eziMock = { reset: resetMock, demoPassword: DEMO_PASSWORD };
}
