"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { enterFirstRunDemo, resetDemoData, setSimulateError, switchDemoRole, useCurrentUser, useStore } from "@/lib/mock/store";
import { t } from "@/lib/strings";
import type { Role } from "@/lib/types";

/** Prototype only: role switcher and helpers. The real app has none of this (PRD 0.4, Stage 1). */
export function DemoTools() {
  const router = useRouter();
  const user = useCurrentUser();
  const { simulateError } = useStore();
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed right-3 bottom-3 z-40">
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger
          render={<Button variant="outline" size="sm" className="bg-popover shadow-md" aria-label={`${t.demo.title} (${t.demo.label})`} />}
        >
          <FlaskConical className="size-4" aria-hidden="true" />
          {t.demo.label}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" className="w-72">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{t.demo.role}</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={user?.role ?? ""}
              onValueChange={(v) => { switchDemoRole(v as Role); setOpen(false); router.push("/dashboard"); }}
            >
              <DropdownMenuRadioItem value="Admin">{t.demo.roleAdmin}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="Staff">{t.demo.roleStaff}</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem checked={simulateError} onCheckedChange={(v) => { setSimulateError(Boolean(v)); setOpen(false); }}>
            {t.demo.simulateError}
          </DropdownMenuCheckboxItem>
          <DropdownMenuItem onClick={() => { enterFirstRunDemo(); router.push("/setup"); }}>{t.demo.firstRun}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => { resetDemoData(); toast.success(t.demo.resetDone); router.push("/login"); }}>
            {t.demo.resetData}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <p className="px-2 py-1.5 text-sm text-muted-foreground">{t.demo.note}</p>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
