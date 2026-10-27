"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/shared/form-field";
import { SelectField } from "@/components/shared/select-field";
import { UNITS } from "@/lib/constants";
import { api, useGet } from "@/lib/api";
import type { CategoryDto, ItemDto, SupplierDto } from "@/lib/api/master";
import { itemSchema, validate, type FieldErrors } from "@/lib/schemas";
import { t } from "@/lib/strings";

type Values = Record<"name" | "categoryId" | "subcategoryId" | "unit" | "openingStock" | "minimumStock" | "lastPurchasePrice" | "supplierId" | "location" | "status" | "notes", string>;

const blank: Values = {
  name: "", categoryId: "", subcategoryId: "", unit: "", openingStock: "0", minimumStock: "0",
  lastPurchasePrice: "0", supplierId: "", location: "", status: "Active", notes: "",
};

const fromItem = (i: ItemDto): Values => ({
  name: i.name, categoryId: String(i.categoryId), subcategoryId: i.subcategoryId ? String(i.subcategoryId) : "", unit: i.unit, openingStock: "0",
  minimumStock: String(i.minimumStock ?? 0), lastPurchasePrice: String(i.lastPurchasePrice ?? 0),
  supplierId: i.supplierId ? String(i.supplierId) : "", location: i.location ?? "", status: i.status, notes: i.notes ?? "",
});

export function ItemForm({ item }: { item?: ItemDto }) {
  const router = useRouter();
  const categoryList = useGet<CategoryDto[]>("/categories", { pageSize: 500, sort: "name:asc" });
  const subcategoryList = useGet<CategoryDto[]>("/subcategories", { pageSize: 500, sort: "name:asc" });
  const supplierList = useGet<SupplierDto[]>("/suppliers", { pageSize: 500, sort: "name:asc" });
  const [values, setValues] = useState<Values>(item ? fromItem(item) : blank);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);
  const set = (k: keyof Values) => (v: string) => setValues((s) => ({ ...s, [k]: v }));
  const input = (k: keyof Values) => ({ value: values[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k)(e.target.value) });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = validate(itemSchema, values);
    setErrors(v.ok ? {} : v.errors);
    if (!v.ok) return;
    setPending(true);
    const r = item ? await api.items.update(item.id, v.data) : await api.items.create(v.data);
    setPending(false);
    if (!r.success) {
      setErrors({ ...(r.error.fields ?? {}), _form: r.error.message });
      return;
    }
    toast.success(item ? t.items.savedEdit : t.items.savedAdd);
    router.push(`/items/view?id=${r.data.id}`);
  };

  // Inactive categories, subcategories and suppliers are offered only when this item already uses them.
  const categories = (categoryList.data ?? []).filter((c) => c.status === "Active" || String(c.id) === values.categoryId);
  const subcategories = (subcategoryList.data ?? []).filter((c) => c.status === "Active" || String(c.id) === values.subcategoryId);
  const suppliers = (supplierList.data ?? []).filter((s) => s.status === "Active" || String(s.id) === values.supplierId);

  return (
    <form onSubmit={submit} noValidate>
      <Card className="max-w-3xl gap-6">
        <section className="flex flex-col gap-4 px-5">
          <h2 className="text-lg font-semibold">{t.items.sectionBasic}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.items.fieldCode} hint={t.items.codeHint}>
              {(p) => <Input {...p} value={item?.code ?? t.items.codeAuto} readOnly disabled />}
            </Field>
            <Field label={t.items.fieldName} required error={errors.name}>
              {(p) => <Input {...p} {...input("name")} />}
            </Field>
            <Field label={t.fields.category} required error={errors.categoryId}>
              {(p) => <SelectField {...p} value={values.categoryId} onChange={set("categoryId")} placeholder={t.validation.selectCategory} options={categories.map((c) => ({ value: String(c.id), label: c.name }))} />}
            </Field>
            <Field label={t.fields.subcategory} required error={errors.subcategoryId}>
              {(p) => <SelectField {...p} value={values.subcategoryId} onChange={set("subcategoryId")} placeholder={t.validation.selectSubcategory} options={subcategories.map((c) => ({ value: String(c.id), label: c.name }))} />}
            </Field>
            <Field label={t.fields.unit} required error={errors.unit}>
              {(p) => <SelectField {...p} value={values.unit} onChange={set("unit")} placeholder={t.validation.selectUnit} options={UNITS.map((u) => ({ value: u, label: u }))} />}
            </Field>
          </div>
        </section>

        <section className="flex flex-col gap-4 border-t px-5 pt-6">
          <h2 className="text-lg font-semibold">{t.items.sectionStock}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {item ? (
              <Field label={t.items.currentStock} hint={t.items.openingReadOnly}>
                {(p) => <Input {...p} value={item.currentStock ?? 0} readOnly disabled />}
              </Field>
            ) : (
              <Field label={t.fields.openingStock} error={errors.openingStock} hint={t.items.openingHint}>
                {(p) => <Input {...p} inputMode="numeric" {...input("openingStock")} />}
              </Field>
            )}
            <Field label={t.fields.minimumStock} required error={errors.minimumStock} hint={t.items.minimumHint}>
              {(p) => <Input {...p} inputMode="numeric" {...input("minimumStock")} />}
            </Field>
          </div>
        </section>

        <section className="flex flex-col gap-4 border-t px-5 pt-6">
          <h2 className="text-lg font-semibold">{t.items.sectionPurchasing}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.fields.lastPrice} error={errors.lastPurchasePrice}>
              {(p) => <Input {...p} inputMode="numeric" {...input("lastPurchasePrice")} />}
            </Field>
            <Field label={t.fields.preferredSupplier} error={errors.supplierId}>
              {(p) => (
                <SelectField {...p} value={values.supplierId} onChange={set("supplierId")} placeholder={t.items.noSupplier}
                  options={[{ value: "", label: t.items.noSupplier }, ...suppliers.map((s) => ({ value: String(s.id), label: s.name }))]} />
              )}
            </Field>
            <Field label={t.fields.location} error={errors.location}>
              {(p) => <Input {...p} {...input("location")} />}
            </Field>
            <Field label={t.fields.status} error={errors.status}>
              {(p) => <SelectField {...p} value={values.status} onChange={set("status")} options={[{ value: "Active", label: t.status.active.Active }, { value: "Inactive", label: t.status.active.Inactive }]} />}
            </Field>
          </div>
          <Field label={t.common.notes} error={errors.notes}>
            {(p) => <Textarea {...p} rows={3} {...input("notes")} />}
          </Field>
        </section>

        {errors._form && <p role="alert" className="mx-5 rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-foreground">{errors._form}</p>}
        <div className="flex justify-end gap-2 border-t px-5 pt-5">
          <Button type="button" variant="outline" disabled={pending} onClick={() => router.back()}>{t.common.cancel}</Button>
          <Button type="submit" disabled={pending}>{pending ? t.common.saving : t.items.saveItem}</Button>
        </div>
      </Card>
    </form>
  );
}
