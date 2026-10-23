import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { StatePanel } from "@/components/shared/states";
import { t } from "@/lib/strings";
import { SearchX } from "lucide-react";

export default function NotFound() {
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
