"use client";

import { useState } from "react";
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
import { api, tableProps, useGet, useListParams } from "@/lib/api";
import type { SupplierDto } from "@/lib/api/master";
import { supplierSchema, serverErrors, validate, type FieldErrors } from "@/lib/schemas";
import { t } from "@/lib/strings";

const blank = { name: "", contactPerson: "", phone: "", email: "", address: "", notes: "", status: "Active" };

export default function SuppliersPage() {
  const lp = useListParams({ sort: "name:asc", filters: { status: "all" } });
  const list = useGet<SupplierDto[]>("/suppliers", lp.params);
  const [editing, setEditing] = useState<SupplierDto | "new" | null>(null);
  const [values, setValues] = useState(blank);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);
  const [action, setAction] = useState<MasterAction>(null);

  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValues({ ...values, [k]: e.target.value });

  const open = (s: SupplierDto | "new") => {
    setEditing(s);
    setErrors({});
    setValues(s === "new" ? blank : { name: s.name, contactPerson: s.contactPerson, phone: s.phone, email: s.email, address: s.address, notes: s.notes, status: s.status });
  };

  const submit = async () => {
    const v = validate(supplierSchema, values);
    setErrors(v.ok ? {} : v.errors);
    if (!v.ok) return;
    setPending(true);
    const r = editing === "new" || !editing ? await api.suppliers.create(v.data) : await api.suppliers.update(editing.id, v.data);
    setPending(false);
    if (!r.success) return setErrors(serverErrors(r.error));
    toast.success(t.suppliers.saved);
    setEditing(null);
  };

  const columns: Column<SupplierDto>[] = [
    { id: "name", header: t.suppliers.colName, cell: (s) => <span className="font-medium">{s.name}</span>, sortable: true },
    { id: "contact", header: t.suppliers.colContact, cell: (s) => s.contactPerson || "-", sortable: true },
    { id: "phone", header: t.suppliers.colPhone, cell: (s) => <span className="tabular">{s.phone || "-"}</span>, sortable: true, hideOnMobile: true },
    { id: "email", header: t.suppliers.colEmail, cell: (s) => s.email || "-", sortable: true, hideOnMobile: true },
    { id: "items", header: t.suppliers.colItems, cell: (s) => t.suppliers.itemsCount(s.itemCount), sortable: true },
    { id: "status", header: t.common.status, cell: (s) => <ActiveBadge status={s.status} />, sortable: true },
  ];
  const actions = (s: SupplierDto): RowAction[] => [
    { label: t.common.edit, icon: Pencil, onSelect: () => open(s) },
    s.status === "Active"
      ? { label: t.items.deactivate, icon: PowerOff, separated: true, onSelect: () => setAction({ kind: "deactivate", id: s.id, name: s.name }) }
      : { label: t.items.activate, icon: Power, separated: true, onSelect: () => setAction({ kind: "activate", id: s.id, name: s.name }) },
    { label: t.common.delete, icon: Trash2, destructive: true, onSelect: () => setAction({ kind: "delete", id: s.id, name: s.name }) },
  ];

  return (
    <>
      <PageHeader title={t.suppliers.title} description={t.suppliers.description} actions={<Button onClick={() => open("new")}>{t.suppliers.add}</Button>} />
      <FilterBar dirty={lp.dirty} onClear={lp.clear}>
        <SearchBox value={lp.search} onChange={lp.setSearch} placeholder={t.suppliers.searchPlaceholder} />
        <SelectField className="w-44" aria-label={t.common.status} value={lp.filters.status} onChange={(v) => lp.set({ status: v })}
          options={[{ value: "all", label: t.common.activeFilter.all }, { value: "Active", label: t.common.activeFilter.Active }, { value: "Inactive", label: t.common.activeFilter.Inactive }]} />
      </FilterBar>
      <LoadGate load={list}>
        <DataTable
          caption={t.suppliers.caption}
          {...tableProps(list, lp)}
          columns={columns}
          rowKey={(s) => s.id}
          rowLabel={(s) => s.name}
          actions={actions}
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
        run={(kind, id) => (kind === "delete" ? api.suppliers.remove(id) : api.suppliers.setStatus(id, kind))}
      />
    </>
  );
}
