"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/shared/form-field";
import { LinesEditor, newLine, type LineDraft } from "@/components/shared/lines-editor";
import { SelectField } from "@/components/shared/select-field";
import { daysFromToday, today } from "@/lib/format";
import { api, useCurrentUser, useGet, useRequestId } from "@/lib/api";
import type { LoanDto } from "@/lib/api/loans";
import type { ItemDto } from "@/lib/api/master";
import { loanSchema, validate, type FieldErrors } from "@/lib/schemas";
import { t } from "@/lib/strings";

export function LoanForm({ loan }: { loan?: LoanDto }) {
  const router = useRouter();
  const user = useCurrentUser()!;
  const isAdmin = user.role === "Admin";
  const requestId = useRequestId();
  const itemList = useGet<ItemDto[]>("/items", { status: "Active", pageSize: 500, sort: "name:asc" });
  // Admin books on behalf of anyone active; Staff always borrow for themselves.
  const userList = useGet<{ id: number; name: string; role: string }[]>(isAdmin ? "/users" : null, { status: "Active", pageSize: 500, sort: "name:asc" });
  const [borrowerId, setBorrowerId] = useState(String(loan?.borrowerId ?? user.id));
  const [loanDate, setLoanDate] = useState(loan?.loanDate ?? today());
  const [expected, setExpected] = useState(loan?.expectedReturnDate ?? daysFromToday(3));
  const [purpose, setPurpose] = useState(loan?.purpose ?? "");
  const [notes, setNotes] = useState(loan?.notes ?? "");
  const [lines, setLines] = useState<LineDraft[]>(() =>
    loan ? loan.lines.map((l) => ({ ...newLine(), itemId: String(l.itemId), quantity: String(l.quantity) })) : [newLine()]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState<"draft" | "submit" | null>(null);

  const save = async (submit: boolean) => {
    const v = validate(loanSchema, { borrowerId, lines, loanDate, expectedReturnDate: expected, purpose, notes });
    setErrors(v.ok ? {} : v.errors);
    if (!v.ok) return;
    setPending(submit ? "submit" : "draft");
    const r = loan ? await api.loans.update(loan.id, v.data, submit) : await api.loans.create(v.data, submit, requestId.id);
    setPending(null);
    if (!r.success) return setErrors({ ...(r.error.fields ?? {}), _form: r.error.message });
    toast.success(submit ? t.loans.submitted : t.loans.draftSaved);
    router.push(`/loans/view?id=${r.data.id}`);
  };

  const busy = pending !== null;
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <form onSubmit={(e) => { e.preventDefault(); void save(true); }} noValidate className="lg:col-span-2">
        <Card className="gap-6">
          {isAdmin && (
            <div className="px-5">
              <Field label={t.fields.borrower} required error={errors.borrowerId} hint={t.loans.borrowerHint}>
                {(p) => <SelectField {...p} value={borrowerId} onChange={setBorrowerId}
                  options={(userList.data ?? []).map((u) => ({ value: String(u.id), label: `${u.name} (${u.role})` }))} />}
              </Field>
            </div>
          )}
          <section className="flex flex-col gap-3 px-5">
            <h2 className="text-lg font-semibold">{t.loans.sectionItems}</h2>
            <LinesEditor mode="loan" lines={lines} onChange={setLines} errors={errors}
              items={itemList.data ?? []} addLabel={t.loans.addLine} />
          </section>
          <section className="flex flex-col gap-3 border-t px-5 pt-5">
            <h2 className="text-lg font-semibold">{t.loans.sectionWhen}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.fields.loanDate} required error={errors.loanDate}>
                {(p) => <Input {...p} type="date" value={loanDate} onChange={(e) => setLoanDate(e.target.value)} />}
              </Field>
              <Field label={t.fields.expectedReturn} required error={errors.expectedReturnDate}>
                {(p) => <Input {...p} type="date" min={loanDate} value={expected} onChange={(e) => setExpected(e.target.value)} />}
              </Field>
            </div>
          </section>
          <section className="flex flex-col gap-3 border-t px-5 pt-5">
            <h2 className="text-lg font-semibold">{t.loans.sectionWhy}</h2>
            <Field label={t.fields.purpose} required error={errors.purpose}>
              {(p) => <Input {...p} value={purpose} onChange={(e) => setPurpose(e.target.value)} />}
            </Field>
            <Field label={t.common.notes}>
              {(p) => <Textarea {...p} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />}
            </Field>
          </section>
          {errors._form && <p role="alert" className="mx-5 rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-foreground">{errors._form}</p>}
          <div className="flex flex-wrap justify-end gap-2 border-t px-5 pt-5">
            <Button type="button" variant="outline" disabled={busy} onClick={() => router.back()}>{t.common.cancel}</Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => void save(false)}>{pending === "draft" ? t.common.saving : t.loans.saveDraft}</Button>
            <Button type="submit" disabled={busy}>{pending === "submit" ? t.common.saving : t.loans.submit}</Button>
          </div>
        </Card>
      </form>

      <Card className="h-fit gap-3">
        <h2 className="px-5 text-lg font-semibold">{t.loans.howTitle}</h2>
        <ol className="flex list-decimal flex-col gap-2 pr-5 pl-10 text-base text-muted-foreground">
          {[t.loans.how1, t.loans.how2, t.loans.how3, t.loans.how4].map((s) => <li key={s}>{s}</li>)}
        </ol>
      </Card>
    </div>
  );
}
