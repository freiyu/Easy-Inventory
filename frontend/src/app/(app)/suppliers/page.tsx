"use client";

import { useMemo, useState } from "react";
import { Pencil, Power, PowerOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MasterConfirm, type MasterAction } from "@/components/master/status-actions";
import { DataTable, type Column, type RowAction } from "@/components/shared/data-table";
import { FormDialog } from "@/components/shared/dialogs";
import { FilterBar, SearchBox } from "@/components/shared/filter-bar";
import { Field } from "@/components/shared/form-field";
import { PageHeader } from "@/components/shared/page-header";
import { SelectField } from "@/components/shared/select-field";
import { ActiveBadge } from "@/components/shared/status-badge";
import { EmptyState, LoadGate } from "@/components/shared/states";
import { usePageLoad } from "@/hooks/use-page-load";
import { api, useStore } from "@/lib/mock/store";
import { matches } from "@/lib/queries";
import { supplierSchema, validate, type FieldErrors } from "@/lib/schemas";
import { t } from "@/lib/strings";
import type { Supplier } from "@/lib/types";

const blank = { name: "", contactPerson: "", phone: "", email: "", address: "", notes: "", status: "Active" };

export default function SuppliersPage() {
  const { db } = useStore();
  const load = usePageLoad("suppliers");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [editing, setEditing] = useState<Supplier | "new" | null>(null);
  const [values, setValues] = useState(blank);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);
  const [action, setAction] = useState<MasterAction>(null);

  const rows = useMemo(
    () => db.suppliers.filter((s) => (status === "all" || s.status === status) && matches(query, s.name, s.contactPerson, s.phone, s.email)),
    [db.suppliers, query, status],
  );
  const count = (id: number) => db.items.filter((i) => i.supplierId === id).length;
  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValues({ ...values, [k]: e.target.value });

  const open = (s: Supplier | "new") => {
    setEditing(s);
    setErrors({});
    setValues(s === "new" ? blank : { name: s.name, contactPerson: s.contactPerson, phone: s.phone, email: s.email, address: s.address, notes: s.notes, status: s.status });
  };

  const submit = async () => {
    const v = validate(supplierSchema, values);
    setErrors(v.ok ? {} : v.errors);
    if (!v.ok) return;
    setPending(true);
    const r = await api.suppliers.save(editing === "new" || !editing ? null : editing.id, v.data);
    setPending(false);
    if (!r.ok) return setErrors({ ...(r.error.fields ?? {}), _form: r.error.message });
    toast.success(t.suppliers.saved);
    setEditing(null);
  };

  const columns: Column<Supplier>[] = [
    { id: "name", header: t.suppliers.colName, cell: (s) => <span className="font-medium">{s.name}</span>, sortValue: (s) => s.name },
    { id: "contact", header: t.suppliers.colContact, cell: (s) => s.contactPerson || "-", sortValue: (s) => s.contactPerson },
    { id: "phone", header: t.suppliers.colPhone, cell: (s) => <span className="tabular">{s.phone || "-"}</span>, hideOnMobile: true },
    { id: "email", header: t.suppliers.colEmail, cell: (s) => s.email || "-", hideOnMobile: true },
    { id: "items", header: t.suppliers.colItems, cell: (s) => t.suppliers.itemsCount(count(s.id)), sortValue: (s) => count(s.id) },
    { id: "status", header: t.common.status, cell: (s) => <ActiveBadge status={s.status} />, sortValue: (s) => s.status },
  ];
  const actions = (s: Supplier): RowAction[] => [
    { label: t.common.edit, icon: Pencil, onSelect: () => open(s) },
    s.status === "Active"
      ? { label: t.items.deactivate, icon: PowerOff, separated: true, onSelect: () => setAction({ kind: "deactivate", id: s.id, name: s.name }) }
      : { label: t.items.activate, icon: Power, separated: true, onSelect: () => setAction({ kind: "activate", id: s.id, name: s.name }) },
    { label: t.common.delete, icon: Trash2, destructive: true, onSelect: () => setAction({ kind: "delete", id: s.id, name: s.name }) },
  ];

  return (
    <>
      <PageHeader title={t.suppliers.title} description={t.suppliers.description} actions={<Button onClick={() => open("new")}>{t.suppliers.add}</Button>} />
      <LoadGate load={load}>
        <FilterBar dirty={query !== "" || status !== "all"} onClear={() => { setQuery(""); setStatus("all"); }}>
          <SearchBox value={query} onChange={setQuery} placeholder={t.suppliers.searchPlaceholder} />
          <SelectField className="w-44" aria-label={t.common.status} value={status} onChange={setStatus}
            options={[{ value: "all", label: t.common.activeFilter.all }, { value: "Active", label: t.common.activeFilter.Active }, { value: "Inactive", label: t.common.activeFilter.Inactive }]} />
        </FilterBar>
        <DataTable
          caption={t.suppliers.caption}
          rows={rows}
          columns={columns}
          rowKey={(s) => s.id}
          rowLabel={(s) => s.name}
          actions={actions}
          initialSort={{ id: "name", dir: "asc" }}
          empty={<EmptyState title={t.suppliers.emptyTitle} body={t.suppliers.emptyBody} action={<Button onClick={() => open("new")}>{t.suppliers.add}</Button>} />}
        />
      </LoadGate>

      <FormDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === "new" ? t.suppliers.addTitle : t.suppliers.editTitle}
        submitLabel={t.suppliers.save}
        pending={pending}
        onSubmit={submit}
        error={errors._form}
      >
        <Field label={t.fields.name} required error={errors.name}>{(p) => <Input {...p} value={values.name} onChange={set("name")} />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.fields.contactPerson}>{(p) => <Input {...p} value={values.contactPerson} onChange={set("contactPerson")} />}</Field>
          <Field label={t.fields.phone}>{(p) => <Input {...p} type="tel" value={values.phone} onChange={set("phone")} />}</Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.fields.email} error={errors.email}>{(p) => <Input {...p} type="email" value={values.email} onChange={set("email")} />}</Field>
          <Field label={t.fields.status}>
            {(p) => <SelectField {...p} value={values.status} onChange={(v) => setValues({ ...values, status: v })} options={[{ value: "Active", label: t.status.active.Active }, { value: "Inactive", label: t.status.active.Inactive }]} />}
          </Field>
        </div>
        <Field label={t.fields.address}>{(p) => <Input {...p} value={values.address} onChange={set("address")} />}</Field>
        <Field label={t.common.notes}>{(p) => <Textarea {...p} rows={2} value={values.notes} onChange={set("notes")} />}</Field>
      </FormDialog>

      <MasterConfirm
        action={action}
        onClose={() => setAction(null)}
        copy={t.suppliers}
        labels={{ deactivate: t.items.deactivate, activate: t.items.activate, delete: t.common.delete }}
        run={(kind, id) => (kind === "delete" ? api.suppliers.remove(id) : kind === "activate" ? api.suppliers.activate(id) : api.suppliers.deactivate(id))}
      />
    </>
  );
}
