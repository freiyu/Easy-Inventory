"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/shared/form-field";
import { useMounted } from "@/hooks/use-mounted";
import { api, useCurrentUser, useGet } from "@/lib/api";
import { loginSchema, validate, type FieldErrors } from "@/lib/schemas";
import { t } from "@/lib/strings";

export default function LoginPage() {
  const router = useRouter();
  const mounted = useMounted();
  const user = useCurrentUser();
  const setup = useGet<{ needsSetup: boolean }>("/setup/status");
  const [values, setValues] = useState({ email: "", password: "", keepSignedIn: false });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!mounted) return;
    if (setup.data?.needsSetup) router.replace("/setup");
    else if (user) router.replace(user.mustChangePassword ? "/change-password" : "/dashboard");
  }, [mounted, user, setup.data?.needsSetup, router]);

  const signIn = async (email: string, password: string, keepSignedIn: boolean) => {
    setPending(true);
    const r = await api.auth.login(email, password, keepSignedIn);
    setPending(false);
    if (!r.success) setErrors({ _form: r.error.message });
    // On success the effect above redirects once the session is known.
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = validate(loginSchema, values);
    setErrors(v.ok ? {} : v.errors);
    if (v.ok) void signIn(v.data.email, v.data.password, v.data.keepSignedIn);
  };

  return (
    <div className="flex flex-col gap-4">
      <Card className="gap-5">
        <div className="px-5">
          <h1 className="text-xl font-semibold">{t.auth.signInTitle}</h1>
          <p className="mt-1 text-base text-muted-foreground">{t.auth.signInIntro}</p>
        </div>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4 px-5">
          <Field label={t.fields.email} required error={errors.email}>
            {(p) => (
              <Input {...p} type="email" autoComplete="username" value={values.email}
                onChange={(e) => setValues({ ...values, email: e.target.value })} />
            )}
          </Field>
          <Field label={t.fields.password} required error={errors.password}>
            {(p) => (
              <Input {...p} type="password" autoComplete="current-password" value={values.password}
                onChange={(e) => setValues({ ...values, password: e.target.value })} />
            )}
          </Field>
          <div className="flex items-center gap-2">
            <Checkbox id="keep" checked={values.keepSignedIn} onCheckedChange={(c) => setValues({ ...values, keepSignedIn: Boolean(c) })} />
            <Label htmlFor="keep" className="text-base font-normal">{t.auth.keepSignedIn}</Label>
          </div>
          {errors._form && (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-foreground">{errors._form}</p>
          )}
          <Button type="submit" size="lg" disabled={pending} className="w-full">
            {pending ? t.auth.signingIn : t.auth.signIn}
          </Button>
        </form>
      </Card>
    </div>
  );
}
