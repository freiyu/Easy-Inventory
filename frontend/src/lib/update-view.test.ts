import { describe, expect, it } from "vitest";
import type { UpdateInfo } from "@/lib/api/admin";
import { deriveView } from "./update-view";

const base: UpdateInfo = { current: "1.2.0", latest: null, available: false, autoEnabled: true, checkedAt: null, lastError: null, requested: false, phase: null, installError: null, installedAt: null };
const newer = { ...base, latest: "1.3.0", available: true };

describe("deriveView", () => {
  it("shows nothing when there is nothing to say", () => {
    expect(deriveView(null, false, null, null).kind).toBe("none");
    expect(deriveView(base, false, null, null).kind).toBe("none");
    expect(deriveView({ ...base, latest: "1.2.0" }, false, null, null).kind).toBe("none");
  });
  it("offline or unknown is quiet, even when a check failed", () => {
    expect(deriveView(newer, true, null, null).kind).toBe("none");
    expect(deriveView({ ...base, lastError: "Cannot reach api.github.com" }, false, null, null).kind).toBe("none");
  });
  it("an available version says whether it installs by itself", () => {
    expect(deriveView(newer, false, null, null)).toEqual({ kind: "available", version: "1.3.0", auto: true });
    expect(deriveView({ ...newer, autoEnabled: false }, false, null, null)).toEqual({ kind: "available", version: "1.3.0", auto: false });
  });
  it("follows Update now: queued, downloading, installing, restarting, done", () => {
    expect(deriveView({ ...newer, requested: true }, false, "1.3.0", null).kind).toBe("queued");
    expect(deriveView({ ...newer, phase: "downloading" }, false, "1.3.0", null).kind).toBe("downloading");
    expect(deriveView({ ...newer, phase: "installing" }, false, "1.3.0", null).kind).toBe("installing");
    expect(deriveView(newer, true, "1.3.0", null)).toEqual({ kind: "installing", version: "1.3.0" }); // EZI is restarting
    expect(deriveView({ ...base, current: "1.3.0", latest: "1.3.0" }, false, "1.3.0", null)).toEqual({ kind: "done", version: "1.3.0" });
  });
  it("another Admin's tab sees the same progress, and the restart if it was installing", () => {
    expect(deriveView({ ...newer, phase: "installing" }, false, null, null).kind).toBe("installing");
    expect(deriveView({ ...newer, phase: "installing" }, true, null, null).kind).toBe("installing");
    expect(deriveView({ ...newer, phase: "downloading" }, true, null, null).kind).toBe("none");
  });
  it("a failed installation is shown until it is closed or tried again", () => {
    const failed = { ...newer, installError: "The installer stopped with code 5." };
    expect(deriveView(failed, false, "1.3.0", null)).toEqual({ kind: "failed", message: "The installer stopped with code 5." });
    expect(deriveView(failed, false, "1.3.0", failed.installError).kind).toBe("available");
    expect(deriveView({ ...failed, requested: true }, false, "1.3.0", null).kind).toBe("queued");
  });
});
