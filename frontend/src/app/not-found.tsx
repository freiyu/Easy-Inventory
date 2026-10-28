"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { StatePanel } from "@/components/shared/states";
import { t } from "@/lib/strings";
import { SearchX } from "lucide-react";
import { useMounted } from "@/hooks/use-mounted";

export default function NotFound() {
  // The static 404 is prerendered in Indonesian; render after mount so a browser set to English never hydrates over it.
  if (!useMounted()) return null;
  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center px-4">
      <div className="w-full">
        <StatePanel
          icon={SearchX}
          title={t.states.notFoundTitle}
          body={t.states.notFoundBody}
          action={<Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>{t.states.backToDashboard}</Link>}
        />
      </div>
    </main>
  );
}
