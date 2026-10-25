// Setup and auth endpoints (PRD 6.6) plus the session loader.
import type { FirstAdminInput } from "../schemas";
import type { User } from "../types";
import { get, post } from "./client";
import { sessionLoaded, setSessionUser } from "./store";

let loading: Promise<void> | null = null;

/** Loads the current user once (GET /auth/me). Safe to call from many components. */
export function ensureSession(): Promise<void> {
  if (sessionLoaded()) return Promise.resolve();
  loading ??= get<User>("/auth/me").then((r) => {
    setSessionUser(r.success ? r.data : null);
    loading = null;
  });
  return loading;
}

export const auth = {
  setupStatus: () => get<{ needsSetup: boolean }>("/setup/status"),
  firstAdmin: (v: FirstAdminInput) => post<User>("/setup/first-admin", { name: v.name, email: v.email, password: v.password }),
  async login(email: string, password: string, keepSignedIn: boolean) {
    const r = await post<User>("/auth/login", { email, password, keepSignedIn });
    if (r.success) setSessionUser(r.data);
    return r;
  },
  async logout() {
    const r = await post<null>("/auth/logout");
    setSessionUser(null);
    return r;
  },
  async changePassword(current: string | undefined, password: string) {
    const r = await post<User>("/auth/change-password", { current, password });
    if (r.success) setSessionUser(r.data);
    return r;
  },
};
