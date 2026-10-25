"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/shared/form-field";
import { t } from "@/lib/strings";
import { validate, reasonSchema } from "@/lib/schemas";
import type { Envelope } from "@/lib/api";

/** Modal form: submit disables and shows progress, input is never cleared on failure (PRD 5.4). */
export function FormDialog({
  open, onOpenChange, title, description, submitLabel, pendingLabel = t.common.saving, pending, destructive, onSubmit, error, children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  submitLabel: string;
  pendingLabel?: string;
  pending?: boolean;
  destructive?: boolean;
  onSubmit: () => void;
  error?: string;
  children?: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="contents" noValidate>
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
            {description && <DialogDescription className="text-base">{description}</DialogDescription>}
          </DialogHeader>
          {children && <div className="flex flex-col gap-4">{children}</div>}
          {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-foreground">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>{t.common.cancel}</Button>
            <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={pending}>
              {pending ? pendingLabel : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Confirmation for actions that need no extra input (deactivate, cancel, issue...). */
export function ConfirmDialog({
  open, onOpenChange, title, description, confirmLabel, destructive, onConfirm, children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => Promise<Envelope<unknown>>;
  children?: React.ReactNode;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    setPending(true);
    setError("");
    const r = await onConfirm();
    setPending(false);
    if (r.success) onOpenChange(false);
    else setError(r.error.message);
  };
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!pending) { onOpenChange(o); if (!o) setError(""); } }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg font-semibold">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-base">{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-foreground">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{t.common.cancel}</AlertDialogCancel>
          <Button variant={destructive ? "destructive" : "default"} disabled={pending} onClick={submit}>
            {pending ? t.common.saving : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Confirmation that requires a written reason (void, reject). */
export function ReasonDialog({
  open, onOpenChange, title, description, confirmLabel, reasonLabel = t.fields.reason, onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  reasonLabel?: string;
  onConfirm: (reason: string) => Promise<Envelope<unknown>>;
}) {
  const [reason, setReason] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const submit = async () => {
    const v = validate(reasonSchema, { reason });
    if (!v.ok) { setFieldError(v.errors.reason ?? ""); return; }
    setFieldError("");
    setPending(true);
    const r = await onConfirm(v.data.reason);
    setPending(false);
    if (r.success) { onOpenChange(false); setReason(""); setError(""); }
    else setError(r.error.message);
  };
  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => { onOpenChange(o); if (!o) { setFieldError(""); setError(""); } }}
      title={title}
      description={description}
      submitLabel={confirmLabel}
      pending={pending}
      destructive
      onSubmit={submit}
      error={error}
    >
      <Field label={reasonLabel} required error={fieldError}>
        {(p) => <Textarea {...p} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />}
      </Field>
    </FormDialog>
  );
}
