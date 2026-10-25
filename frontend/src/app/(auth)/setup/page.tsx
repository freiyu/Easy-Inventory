"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Info } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/shared/form-field";
import { useMounted } from "@/hooks/use-mounted";
import { api, useGet } from "@/lib/api";
import { firstAdminSchema, validate, type FieldErrors } from "@/lib/schemas";
import { t } from "@/lib/strings";

export default function SetupPage() {
  const router = useRouter();
  const mounted = useMounted();
  const setup = useGet<{ needsSetup: boolean }>("/setup/status");
  const [values, setValues] = useState({ name: "", email: "", password: "", confirm: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);
  const [created, setCreated] = useState(false);
  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) => setValues({ ...values, [k]: e.target.value });

  useEffect(() => {
    if (created) router.replace("/login");
  }, [created, router]);

  // The first-run endpoint is closed once a user exists (PRD 3.3).
  if (mounted && setup.data && !setup.data.needsSetup && !created) {
    return (
      <Card className="items-center gap-3 px-6 py-8 text-center">
        <h1 className="text-xl font-semibold">{t.auth.setupClosedTitle}</h1>
        <p className="text-base text-muted-foreground">{t.auth.setupClosedBody}</p>
        <Link href="/login" className={buttonVariants({ variant: "outline" })}>{t.auth.goToSignIn}</Link>
      </Card>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = validate(firstAdminSchema, values);
    setErrors(v.ok ? {} : v.errors);
    if (!v.ok) return;
    setPending(true);
    const r = await api.auth.firstAdmin(v.data);
    setPending(false);
    if (r.success) {
      toast.success(t.auth.setupDone);
      setCreated(true);
    } else setErrors({ _form: r.error.message });
  };

  return (
    <Card className="gap-5">
      <div className="px-5">
        <p className="text-sm font-semibold text-muted-foreground">{t.auth.setupEyebrow}</p>
        <h1 className="mt-1 text-xl font-semibold">{t.auth.setupTitle}</h1>
      </div>
      <p className="mx-5 flex items-start gap-2 rounded-lg bg-info-soft px-3 py-2.5 text-sm text-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-info-icon" aria-hidden="true" />
        {t.auth.setupInfo}
      </p>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4 px-5">
        <Field label={t.fields.fullName} required error={errors.name}>
          {(p) => <Input {...p} autoComplete="name" value={values.name} onChange={set("name")} />}
        </Field>
        <Field label={t.fields.email} required error={errors.email}>
          {(p) => <Input {...p} type="email" autoComplete="username" value={values.email} onChange={set("email")} />}
        </Field>
        <Field label={t.fields.password} required error={errors.password} hint={t.auth.passwordHint}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" value={values.password} onChange={set("password")} />}
        </Field>
        <Field label={t.fields.confirmPassword} required error={errors.confirm}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" value={values.confirm} onChange={set("confirm")} />}
        </Field>
        {errors._form && <p role="alert" className="text-sm font-medium text-danger-icon">{errors._form}</p>}
        <Button type="submit" size="lg" disabled={pending} className="w-full">
          {pending ? t.common.saving : t.auth.setupSubmit}
        </Button>
      </form>
    </Card>
  );
}
