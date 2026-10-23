"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/shared/form-field";
import { changeOwnPassword } from "@/lib/mock/store";
import { changePasswordSchema, validate, type FieldErrors } from "@/lib/schemas";
import { t } from "@/lib/strings";

/** Used by the forced change after a temporary password and by My Profile. */
export function PasswordForm({ forced, onDone }: { forced?: boolean; onDone: () => void }) {
  const [values, setValues] = useState({ current: "", password: "", confirm: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);
  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) => setValues({ ...values, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = validate(changePasswordSchema, values);
    const next: FieldErrors = v.ok ? {} : v.errors;
    if (!forced && !values.current) next.current = t.auth.currentWrong;
    setErrors(next);
    if (Object.keys(next).length) return;
    setPending(true);
    const r = await changeOwnPassword();
    setPending(false);
    if (r.ok) {
      toast.success(t.auth.changeDone);
      onDone();
    } else setErrors({ _form: r.error.message });
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {!forced && (
        <Field label={t.fields.currentPassword} required error={errors.current}>
          {(p) => <Input {...p} type="password" autoComplete="current-password" value={values.current} onChange={set("current")} />}
        </Field>
      )}
      <Field label={t.fields.newPassword} required error={errors.password} hint={t.auth.passwordHint}>
        {(p) => <Input {...p} type="password" autoComplete="new-password" value={values.password} onChange={set("password")} />}
      </Field>
      <Field label={t.fields.confirmPassword} required error={errors.confirm}>
        {(p) => <Input {...p} type="password" autoComplete="new-password" value={values.confirm} onChange={set("confirm")} />}
      </Field>
      {errors._form && <p role="alert" className="text-sm font-medium text-danger-icon">{errors._form}</p>}
      <Button type="submit" disabled={pending} className="self-start">{pending ? t.common.saving : t.auth.changeSubmit}</Button>
    </form>
  );
}
