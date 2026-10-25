"use client";

import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/dialogs";
import type { Envelope } from "@/lib/api";

export type MasterAction = { kind: "deactivate" | "activate" | "delete"; id: number; name: string } | null;

interface Copy {
  deactivateTitle: (n: string) => string; deactivateBody: string; activateTitle: (n: string) => string; activateBody: string;
  deleteTitle: (n: string) => string; deleteBody: string; deactivated: string; activated: string; deleted: string;
}
interface Labels { deactivate: string; activate: string; delete: string }

/** Deactivate / activate / delete confirmation shared by categories, suppliers, users. */
export function MasterConfirm({
  action, onClose, copy, labels, run,
}: {
  action: MasterAction;
  onClose: () => void;
  copy: Copy;
  labels: Labels;
  run: (kind: "deactivate" | "activate" | "delete", id: number) => Promise<Envelope<unknown>>;
}) {
  if (!action) return null;
  const { kind, id, name } = action;
  const title = { deactivate: copy.deactivateTitle(name), activate: copy.activateTitle(name), delete: copy.deleteTitle(name) }[kind];
  const body = { deactivate: copy.deactivateBody, activate: copy.activateBody, delete: copy.deleteBody }[kind];
  const done = { deactivate: copy.deactivated, activate: copy.activated, delete: copy.deleted }[kind];
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={title}
      description={body}
      confirmLabel={labels[kind]}
      destructive={kind === "delete"}
      onConfirm={async () => {
        const r = await run(kind, id);
        if (r.success) toast.success(done);
        return r;
      }}
    />
  );
}
