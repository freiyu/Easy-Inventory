"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/shared/form-field";
import { PageHeader } from "@/components/shared/page-header";
import { SelectField } from "@/components/shared/select-field";
import { formatNumber, today } from "@/lib/format";
import { api, useStore } from "@/lib/mock/store";
import { reservedQuantity } from "@/lib/rules";
import { adjustmentSchema, validate, type FieldErrors } from "@/lib/schemas";
import { t } from "@/lib/strings";

export default function AdjustmentPage() {
  const router = useRouter();
  const { db } = useStore();
  const [date, setDate] = useState(today);
  const [itemId, setItemId] = useState("");
  const [physical, setPhysical] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);

  const item = db.items.find((i) => String(i.id) === itemId);
  const diff = item && /^\d+$/.test(physical.trim()) ? Number(physical) - item.currentStock : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = validate(adjustmentSchema, { date, itemId, physical, reason });
    const next: FieldErrors = v.ok ? {} : v.errors;
    if (v.ok && diff === 0) next.physical = t.validation.differenceZero;
    setErrors(next);
    if (!v.ok || Object.keys(next).length) return;
    setPending(true);
    const r = await api.stock.adjust(v.data);
    setPending(false);
    if (!r.ok) return setErrors({ ...(r.error.fields ?? {}), _form: r.error.message });
    toast.success(t.stock.savedAdj(r.data.number));
    router.push("/stock");
  };

  return (
    <>
      <PageHeader title={t.stock.adjTitle} description={t.stock.adjDesc} crumbs={[{ label: t.nav.stock, href: "/stock" }, { label: t.stock.adjTitle }]} />
      <form onSubmit={submit} noValidate>
        <Card className="max-w-3xl gap-6">
          <div className="grid gap-4 px-5 sm:grid-cols-2">
            <Field label={t.fields.item} required error={errors.itemId} hint={t.stock.adjItemHint}>
              {(p) => <SelectField {...p} value={itemId} onChange={(v) => { setItemId(v); setPhysical(""); }} placeholder={t.stock.selectItem}
                options={db.items.filter((i) => i.status === "Active").map((i) => ({ value: String(i.id), label: `${i.name} (${i.code})` }))} />}
            </Field>
            <Field label={t.fields.date} required error={errors.date}>
              {(p) => <Input {...p} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
            </Field>
          </div>
          <div className="grid gap-4 px-5 sm:grid-cols-3">
            <Field label={t.fields.systemStock} hint={item ? t.stock.reservedNote(reservedQuantity(db.loans, item.id)) : undefined}>
              {(p) => <Input {...p} readOnly disabled value={item ? `${formatNumber(item.currentStock)} ${item.unit}` : "-"} />}
            </Field>
            <Field label={t.fields.physicalStock} required error={errors.physical}>
              {(p) => <Input {...p} inputMode="numeric" value={physical} onChange={(e) => setPhysical(e.target.value)} />}
            </Field>
            <Field label={t.stock.differenceLabel}>
              {(p) => (
                <Input {...p} readOnly disabled className="tabular"
                  value={diff === null ? "-" : diff === 0 ? t.stock.noChange : `${diff > 0 ? "+" : ""}${formatNumber(diff)}`} />
              )}
            </Field>
          </div>
          <div className="px-5">
            <Field label={t.fields.reason} required error={errors.reason} hint={t.stock.reasonHint}>
              {(p) => <Textarea {...p} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />}
            </Field>
          </div>
          {errors._form && <p role="alert" className="mx-5 rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-foreground">{errors._form}</p>}
          <div className="flex justify-end gap-2 border-t px-5 pt-5">
            <Button type="button" variant="outline" disabled={pending} onClick={() => router.back()}>{t.common.cancel}</Button>
            <Button type="submit" disabled={pending}>{pending ? t.common.saving : t.stock.saveAdj}</Button>
          </div>
        </Card>
      </form>
    </>
  );
}
