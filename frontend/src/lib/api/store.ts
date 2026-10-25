// Tiny version counter. Every successful write bumps it and every mounted query refetches.
import { useSyncExternalStore } from "react";

let version = 0;
const listeners = new Set<() => void>();

export function invalidate() {
  version++;
  listeners.forEach((l) => l());
}

export function useVersion(): number {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => version,
    () => 0,
  );
}

// ------------------------------------------------------------------ session
// The logged-in user as the server reports it (GET /auth/me). The real session is a cookie (PRD 3.4);
// nothing secret is kept here.
import type { User } from "../types";

export interface Session {
  user: User | null;
  /** False until the first GET /auth/me has answered. */
  loaded: boolean;
}

let session: Session = { user: null, loaded: false };
const sessionListeners = new Set<() => void>();
const serverSession: Session = { user: null, loaded: false };

export function setSessionUser(user: User | null) {
  session = { user, loaded: true };
  sessionListeners.forEach((l) => l());
}

export function useSessionState(): Session {
  return useSyncExternalStore(
    (cb) => {
      sessionListeners.add(cb);
      return () => sessionListeners.delete(cb);
    },
    () => session,
    () => serverSession,
  );
}

export const sessionLoaded = () => session.loaded;
