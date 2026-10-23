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
import { PageHeader } from "@/components/shared/page-header";
import { today } from "@/lib/format";
import { api, useStore } from "@/lib/mock/store";
import { availableForLoan } from "@/lib/rules";
import { outgoingSchema, validate, type FieldErrors } from "@/lib/schemas";
import { t } from "@/lib/strings";

export default function OutgoingStockPage() {
  const router = useRouter();
  const { db } = useStore();
  const [date, setDate] = useState(today);
  const [destination, setDestination] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>(() => [newLine()]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = validate(outgoingSchema, { date, destination, notes, lines });
    setErrors(v.ok ? {} : v.errors);
    if (!v.ok) return;
    setPending(true);
    const r = await api.stock.out(v.data);
    setPending(false);
    if (!r.ok) return setErrors({ ...(r.error.fields ?? {}), _form: r.error.message });
    toast.success(t.stock.savedOut(r.data.number));
    router.push("/stock");
  };

  return (
    <>
      <PageHeader title={t.stock.outTitle} description={t.stock.outDesc} crumbs={[{ label: t.nav.stock, href: "/stock" }, { label: t.stock.outTitle }]} />
      <form onSubmit={submit} noValidate>
        <Card className="max-w-4xl gap-6">
          <div className="grid gap-4 px-5 sm:grid-cols-2">
            <Field label={t.fields.date} required error={errors.date}>
              {(p) => <Input {...p} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
            </Field>
            <Field label={t.fields.destination} required error={errors.destination}>
              {(p) => <Input {...p} placeholder={t.fields.destinationHint} value={destination} onChange={(e) => setDestination(e.target.value)} />}
            </Field>
          </div>
          <section className="flex flex-col gap-3 border-t px-5 pt-5">
            <h2 className="text-lg font-semibold">{t.stock.outItemsSection}</h2>
            <LinesEditor mode="out" lines={lines} onChange={setLines} errors={errors}
              items={db.items.filter((i) => i.status === "Active")} available={(i) => availableForLoan(i, db.loans)} />
          </section>
          <div className="px-5">
            <Field label={t.stock.noteField}>{(p) => <Textarea {...p} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
          </div>
          {errors._form && <p role="alert" className="mx-5 rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-foreground">{errors._form}</p>}
          <div className="flex justify-end gap-2 border-t px-5 pt-5">
            <Button type="button" variant="outline" disabled={pending} onClick={() => router.back()}>{t.common.cancel}</Button>
            <Button type="submit" disabled={pending}>{pending ? t.common.saving : t.stock.saveOut}</Button>
          </div>
        </Card>
      </form>
    </>
  );
}
