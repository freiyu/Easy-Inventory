"use client";
// The Admin's update notice at the top of every page. It says only what matters: a new version, the progress of
// "Update now", the result. Offline or unknown shows nothing (see lib/update-view.ts).
import { useState } from "react";
import { CircleCheck, Download, Loader2, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/dialogs";
import { useUpdate } from "@/components/layout/update-context";
import { t } from "@/lib/strings";

const TONE = {
  info: { bg: "bg-info-soft", icon: "text-info-icon" },
  success: { bg: "bg-success-soft", icon: "text-success-icon" },
  danger: { bg: "bg-danger-soft", icon: "text-danger-icon" },
} as const;

/** The "Update now" button and its confirmation. `version` is what will be installed. */
export function UpdateNowButton({ version, label = t.update.updateNow, variant = "default" }: { version: string; label?: string; variant?: "default" | "outline" }) {
  const u = useUpdate();
  const [open, setOpen] = useState(false);
  if (!u) return null;
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>{label}</Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t.update.confirmTitle}
        description={t.update.confirmBody(version)}
        confirmLabel={t.update.updateNow}
        onConfirm={u.install}
      />
    </>
  );
}

export function UpdateNotice() {
  const u = useUpdate();
  if (!u || u.view.kind === "none") return null;
  const v = u.view;
  const busy = v.kind === "queued" || v.kind === "downloading" || v.kind === "installing";
  const tone = v.kind === "done" ? TONE.success : v.kind === "failed" ? TONE.danger : TONE.info;
  const Icon = busy ? Loader2 : v.kind === "done" ? CircleCheck : v.kind === "failed" ? TriangleAlert : Download;
  const text =
    v.kind === "available" ? (v.auto ? t.update.availableAuto(v.version) : t.update.availableManual(v.version))
    : v.kind === "queued" ? t.update.queued
    : v.kind === "downloading" ? t.update.downloading(v.version)
    : v.kind === "installing" ? t.update.installing(v.version)
    : v.kind === "done" ? t.update.done(v.version)
    : t.update.failed(v.message);

  return (
    <div role={v.kind === "failed" ? "alert" : "status"} aria-live="polite" className={`mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg px-4 py-3 text-(length:--text-body) text-foreground ${tone.bg}`}>
      <Icon className={`size-5 shrink-0 ${tone.icon} ${busy ? "ezi-spinner" : ""}`} aria-hidden="true" />
      <p className="min-w-0 flex-1 basis-60">{text}</p>
      <div className="flex flex-wrap items-center gap-2">
        {v.kind === "available" && <UpdateNowButton version={v.version} />}
        {v.kind === "failed" && u.info?.latest && <UpdateNowButton version={u.info.latest} label={t.update.tryAgain} />}
        {v.kind === "failed" && <Button variant="outline" onClick={u.dismissFailure}><X aria-hidden="true" />{t.update.dismiss}</Button>}
        {v.kind === "done" && <Button onClick={() => window.location.reload()}>{t.update.reload}</Button>}
      </div>
    </div>
  );
}
