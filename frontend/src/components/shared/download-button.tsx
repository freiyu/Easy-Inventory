"use client";

import { useState, type ComponentProps } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Envelope } from "@/lib/api";

/** Excel export or backup download: disabled while the file is built (PRD 5.3, 5.4), error as a toast. */
export function DownloadButton({ run, label, busyLabel, ...props }: { run: () => Promise<Envelope<null>>; label: string; busyLabel: string } & Omit<ComponentProps<typeof Button>, "onClick" | "children">) {
  const [busy, setBusy] = useState(false);
  const click = async () => {
    setBusy(true);
    const r = await run();
    setBusy(false);
    if (!r.success) toast.error(r.error.message);
  };
  return <Button {...props} disabled={busy} onClick={click}>{busy ? busyLabel : label}</Button>;
}
