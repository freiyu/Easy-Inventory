"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { PasswordForm } from "@/components/shared/password-form";
import { useMounted } from "@/hooks/use-mounted";
import { useCurrentUser } from "@/lib/api";
import { t } from "@/lib/strings";

// Shown after sign-in when must_change_password is set (PRD 3.4).
export default function ChangePasswordPage() {
  const router = useRouter();
  const mounted = useMounted();
  const user = useCurrentUser();

  useEffect(() => {
    if (!mounted) return;
    if (!user) router.replace("/login");
    else if (!user.mustChangePassword) router.replace("/dashboard");
  }, [mounted, user, router]);

  if (!mounted || !user?.mustChangePassword) return null;
  return (
    <Card className="gap-4">
      <div className="px-5">
        <h1 className="text-xl font-semibold">{t.auth.changeTitle}</h1>
        <p className="mt-1 text-base text-muted-foreground">{t.auth.changeForcedBody}</p>
      </div>
      <div className="px-5">
        <PasswordForm forced onDone={() => router.replace("/dashboard")} />
      </div>
    </Card>
  );
}
