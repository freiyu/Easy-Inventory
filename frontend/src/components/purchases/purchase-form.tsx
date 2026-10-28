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
import { daysFromToday } from "@/lib/format";
import { api, useCurrentUser, useGet, useRequestId } from "@/lib/api";
import type { CategoryOption } from "@/lib/api/master";
import type { PurchaseDto } from "@/lib/api/purchases";
import { purchaseSchema, validate, type FieldErrors } from "@/lib/schemas";
import { t } from "@/lib/strings";

export function PurchaseForm({ request }: { request?: PurchaseDto }) {
  const router = useRouter();
  const user = useCurrentUser()!;
  const categories = useGet<CategoryOption[]>("/categories", { status: "Active", pageSize: 500, sort: "name:asc" });
  const subcategories = useGet<CategoryOption[]>("/subcategories", { status: "Active", pageSize: 500, sort: "name:asc" });
  // Only an Admin may file a request for someone else (PRD 3.2); the list is Admin only.
  const users = useGet<{ id: number; name: string; role: string }[]>(user.role === "Admin" ? "/users" : null, { status: "Active", pageSize: 500, sort: "name:asc" });
  const requestId = useRequestId();
  const isAdmin = user.role === "Admin";
  const [requesterId, setRequesterId] = useState(String(request?.requesterId ?? user.id));
  const [neededBy, setNeededBy] = useState(request?.neededBy ?? daysFromToday(7));
  const [reason, setReason] = useState(request?.reason ?? "");
  const [notes, setNotes] = useState(request?.notes ?? "");
  const [lines, setLines] = useState<LineDraft[]>(() =>
    request
      ? request.lines.map((l) => ({
          ...newLine(), itemId: l.itemId === null ? "" : String(l.itemId), quantity: String(l.quantity),
          isNew: l.itemId === null, name: l.newItem?.name ?? "", categoryId: String(l.newItem?.categoryId ?? ""), subcategoryId: String(l.newItem?.subcategoryId ?? ""), unit: l.newItem?.unit ?? "",
        }))
      : [newLine()]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState<"draft" | "submit" | null>(null);

  const save = async (submit: boolean) => {
    const v = validate(purchaseSchema, { requesterId, lines, neededBy, reason, notes });
    setErrors(v.ok ? {} : v.errors);
    if (!v.ok) return;
    setPending(submit ? "submit" : "draft");
    const r = request ? await api.purchases.update(request.id, v.data, submit) : await api.purchases.create(v.data, submit, requestId.id);
    setPending(null);
    if (!r.success) return setErrors({ ...(r.error.fields ?? {}), _form: r.error.message });
    requestId.renew();
    toast.success(submit ? t.purchases.submitted : t.purchases.draftSaved);
    router.push(`/purchases/view?id=${r.data.id}`);
  };

  const busy = pending !== null;
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <form onSubmit={(e) => { e.preventDefault(); void save(true); }} noValidate className="lg:col-span-2">
        <Card className="gap-6">
          {isAdmin && (
            <div className="px-5">
              <Field label={t.fields.requester} required error={errors.requesterId} hint={t.purchases.requesterHint}>
                {(p) => <SelectField {...p} value={requesterId} onChange={setRequesterId}
                  options={(users.data ?? []).map((u) => ({ value: String(u.id), label: `${u.name} (${u.role})` }))} />}
              </Field>
            </div>
          )}
          <section className="flex flex-col gap-3 px-5">
            <h2 className="text-lg font-semibold">{t.purchases.sectionItems}</h2>
            <p className="text-sm text-muted-foreground">{t.purchases.howNew}</p>
            <LinesEditor mode="purchase" lines={lines} onChange={setLines} errors={errors}
              categories={categories.data ?? []} subcategories={subcategories.data ?? []} addLabel={t.purchases.addLine} />
          </section>
          <section className="flex flex-col gap-3 border-t px-5 pt-5">
            <h2 className="text-lg font-semibold">{t.purchases.sectionWhen}</h2>
            <Field label={t.fields.neededBy} required error={errors.neededBy} className="sm:max-w-xs">
              {(p) => <Input {...p} type="date" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} />}
            </Field>
          </section>
          <section className="flex flex-col gap-3 border-t px-5 pt-5">
            <h2 className="text-lg font-semibold">{t.purchases.sectionWhy}</h2>
            <Field label={t.fields.reason} required error={errors.reason}>
              {(p) => <Input {...p} value={reason} onChange={(e) => setReason(e.target.value)} />}
            </Field>
            <Field label={t.common.notes}>
              {(p) => <Textarea {...p} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />}
            </Field>
          </section>
          {errors._form && <p role="alert" className="mx-5 rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-foreground">{errors._form}</p>}
          <div className="flex flex-wrap justify-end gap-2 border-t px-5 pt-5">
            <Button type="button" variant="outline" disabled={busy} onClick={() => router.back()}>{t.common.cancel}</Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => void save(false)}>{pending === "draft" ? t.common.saving : t.purchases.saveDraft}</Button>
            <Button type="submit" disabled={busy}>{pending === "submit" ? t.common.saving : t.purchases.submit}</Button>
          </div>
        </Card>
      </form>

      <Card className="h-fit gap-3">
        <h2 className="px-5 text-lg font-semibold">{t.purchases.howTitle}</h2>
        <ol className="flex list-decimal flex-col gap-2 pr-5 pl-10 text-base text-muted-foreground">
          {[t.purchases.how1, t.purchases.how2, t.purchases.how3, t.purchases.how4].map((s) => <li key={s}>{s}</li>)}
        </ol>
      </Card>
    </div>
  );
}
