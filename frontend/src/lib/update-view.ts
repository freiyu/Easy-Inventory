import type { UpdateInfo } from "@/lib/api/admin";

/** What the update notice shows. Offline or unknown is `none`: the notice never nags about the network. */
export type UpdateView =
  | { kind: "none" }
  | { kind: "available"; version: string; auto: boolean }
  | { kind: "queued"; version: string }
  | { kind: "downloading"; version: string }
  | { kind: "installing"; version: string }
  | { kind: "done"; version: string }
  | { kind: "failed"; message: string };

const NONE: UpdateView = { kind: "none" };

/**
 * `info`: the last answer. `lost`: the last read failed (offline, or EZI is restarting). `target`: the version this tab
 * asked for with "Update now". `dismissed`: a failure message the Admin closed.
 */
export function deriveView(info: UpdateInfo | null, lost: boolean, target: string | null, dismissed: string | null): UpdateView {
  if (!info) return NONE;
  const version = info.latest ?? target ?? "";
  if (target && !lost && info.current === target) return { kind: "done", version: target };
  // EZI stops while the installer works: a lost connection right after "Update now" is the restart, not a problem.
  if (lost) return target || info.phase === "installing" ? { kind: "installing", version } : NONE;
  if (info.phase === "installing") return { kind: "installing", version };
  if (info.installError && info.installError !== dismissed && !info.requested && !info.phase && info.available) return { kind: "failed", message: info.installError };
  if (info.phase === "downloading") return { kind: "downloading", version };
  if (info.requested) return { kind: "queued", version };
  if (info.available && info.latest) return { kind: "available", version: info.latest, auto: info.autoEnabled };
  return NONE;
}
