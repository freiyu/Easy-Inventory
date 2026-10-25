"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/shared/form-field";
import { LinesEditor, newLine, parseInt0, type LineDraft } from "@/components/shared/lines-editor";
import { PageHeader } from "@/components/shared/page-header";
import { SelectField } from "@/components/shared/select-field";
import { formatIDR, today } from "@/lib/format";
import { api, useGet, useRequestId } from "@/lib/api";
import type { ItemDto, SupplierDto } from "@/lib/api/master";
import { incomingSchema, validate, type FieldErrors } from "@/lib/schemas";
import { t } from "@/lib/strings";

export default function IncomingStockPage() {
  const router = useRouter();
  const items = useGet<ItemDto[]>("/items", { status: "Active", pageSize: 500, sort: "name:asc" });
  const suppliers = useGet<SupplierDto[]>("/suppliers", { status: "Active", pageSize: 500, sort: "name:asc" });
  const requestId = useRequestId();
  const [date, setDate] = useState(today);
  const [supplierId, setSupplierId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>(() => [newLine()]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);

  const total = lines.reduce((n, l) => n + parseInt0(l.quantity) * parseInt0(l.unitPrice), 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = validate(incomingSchema, { date, supplierId, notes, lines });
    setErrors(v.ok ? {} : v.errors);
    if (!v.ok) return;
    setPending(true);
    const r = await api.stock.in(v.data, requestId.id);
    setPending(false);
    if (!r.success) return setErrors({ ...(r.error.fields ?? {}), _form: r.error.message });
    requestId.renew();
    toast.success(t.stock.savedIn(r.data.number));
    router.push("/stock");
  };

  return (
    <>
      <PageHeader title={t.stock.inTitle} description={t.stock.inDesc} crumbs={[{ label: t.nav.stock, href: "/stock" }, { label: t.stock.inTitle }]} />
      <form onSubmit={submit} noValidate>
        <Card className="max-w-4xl gap-6">
          <div className="grid gap-4 px-5 sm:grid-cols-2">
            <Field label={t.fields.date} required error={errors.date}>
              {(p) => <Input {...p} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
            </Field>
            <Field label={t.fields.supplier} required error={errors.supplierId}>
              {(p) => <SelectField {...p} value={supplierId} onChange={setSupplierId} placeholder={t.stock.selectSupplier}
                options={(suppliers.data ?? []).map((s) => ({ value: String(s.id), label: s.name }))} />}
            </Field>
          </div>
          <section className="flex flex-col gap-3 border-t px-5 pt-5">
            <h2 className="text-lg font-semibold">{t.stock.itemsSection}</h2>
            <LinesEditor mode="in" lines={lines} onChange={setLines} errors={errors} items={items.data ?? []} />
            <p className="flex justify-end gap-3 text-base">
              <span className="text-muted-foreground">{t.stock.totalPurchase}</span>
              <span className="tabular font-semibold">{formatIDR(total)}</span>
            </p>
          </section>
          <div className="px-5">
            <Field label={t.stock.noteField}>{(p) => <Textarea {...p} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
          </div>
          {errors._form && <p role="alert" className="mx-5 rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-foreground">{errors._form}</p>}
          <div className="flex justify-end gap-2 border-t px-5 pt-5">
            <Button type="button" variant="outline" disabled={pending} onClick={() => router.back()}>{t.common.cancel}</Button>
            <Button type="submit" disabled={pending}>{pending ? t.common.saving : t.stock.saveIn}</Button>
          </div>
        </Card>
      </form>
    </>
  );
}
