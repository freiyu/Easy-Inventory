"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { PasswordForm } from "@/components/shared/password-form";
import { RoleBadge } from "@/components/shared/status-badge";
import { formatDateTime } from "@/lib/format";
import { useCurrentUser } from "@/lib/api";
import { t } from "@/lib/strings";

export default function ProfilePage() {
  const user = useCurrentUser();
  const [formKey, setFormKey] = useState(0); // remount the form to clear it after a successful change
  if (!user) return null;
  return (
    <>
      <PageHeader title={t.profile.title} description={t.profile.description} />
      <div className="grid max-w-4xl gap-6 md:grid-cols-2">
        <Card className="h-fit gap-4">
          <h2 className="px-5 text-lg font-semibold">{t.profile.account}</h2>
          <dl className="flex flex-col gap-4 px-5">
            {[[t.fields.fullName, user.name], [t.fields.email, user.email]].map(([k, v]) => (
              <div key={k}><dt className="text-sm text-muted-foreground">{k}</dt><dd className="text-base font-medium">{v}</dd></div>
            ))}
            <div><dt className="text-sm text-muted-foreground">{t.fields.role}</dt><dd className="mt-1"><RoleBadge role={user.role} /></dd></div>
            <div><dt className="text-sm text-muted-foreground">{t.profile.lastLogin}</dt><dd className="text-base font-medium">{formatDateTime(user.lastLoginAt)}</dd></div>
          </dl>
        </Card>
        <Card className="gap-4">
          <div className="px-5">
            <h2 className="text-lg font-semibold">{t.profile.passwordCard}</h2>
            <p className="mt-1 text-base text-muted-foreground">{t.profile.passwordBody}</p>
          </div>
          <div className="px-5"><PasswordForm key={formKey} onDone={() => setFormKey((k) => k + 1)} /></div>
        </Card>
      </div>
    </>
  );
}
