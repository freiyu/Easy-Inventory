"use client";
// The program-update state for the signed-in Admin: one poller shared by the notice and the Backup page.
// It polls slowly (once a minute) and quickly (every 3 seconds) while an update is requested or running.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { UpdateInfo } from "@/lib/api/admin";
import type { Envelope } from "@/lib/api/types";
import { deriveView, type UpdateView } from "@/lib/update-view";

interface UpdateState {
  info: UpdateInfo | null;
  view: UpdateView;
  /** Asks the updater to install now. Resolves with the server's answer. */
  install: () => Promise<Envelope<UpdateInfo>>;
  setAuto: (on: boolean) => Promise<Envelope<UpdateInfo>>;
  dismissFailure: () => void;
}

const Ctx = createContext<UpdateState | null>(null);

/** The update state, or null outside the Admin shell (Staff never get a provider). */
export const useUpdate = () => useContext(Ctx);

export function UpdateProvider({ children }: { children: React.ReactNode }) {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [lost, setLost] = useState(false);
  const [target, setTarget] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const r = await api.update.get();
    if (r.success) { setInfo(r.data); setLost(false); } else setLost(true);
  }, []);

  const busy = !!target || !!info?.requested || !!info?.phase;
  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0);
    const id = setInterval(() => void refresh(), busy ? 3_000 : 60_000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [refresh, busy]);

  const install = useCallback(async () => {
    const r = await api.update.install();
    if (r.success) { setInfo(r.data); setLost(false); setTarget(r.data.latest); setDismissed(null); }
    return r;
  }, []);
  const setAuto = useCallback(async (on: boolean) => {
    const r = await api.update.setAuto(on);
    if (r.success) setInfo(r.data);
    return r;
  }, []);
  const dismissFailure = useCallback(() => setDismissed(info?.installError ?? null), [info]);

  const value = useMemo<UpdateState>(
    () => ({ info, view: deriveView(info, lost, target, dismissed), install, setAuto, dismissFailure }),
    [info, lost, target, dismissed, install, setAuto, dismissFailure],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
