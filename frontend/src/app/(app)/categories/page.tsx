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
import type { CategoryDto } from "@/lib/api/master";
import { categorySchema, validate, type FieldErrors } from "@/lib/schemas";
import { t } from "@/lib/strings";

const blank = { name: "", code: "", description: "", status: "Active" };

export default function CategoriesPage() {
  const lp = useListParams({ sort: "name:asc", filters: { status: "all" } });
  const list = useGet<CategoryDto[]>("/categories", lp.params);
  const [editing, setEditing] = useState<CategoryDto | "new" | null>(null);
  const [values, setValues] = useState(blank);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);
  const [action, setAction] = useState<MasterAction>(null);

  const open = (c: CategoryDto | "new") => {
    setEditing(c);
    setErrors({});
    setValues(c === "new" ? blank : { name: c.name, code: c.code, description: c.description, status: c.status });
  };

  const submit = async () => {
    const v = validate(categorySchema, values);
    setErrors(v.ok ? {} : v.errors);
    if (!v.ok) return;
    setPending(true);
    const r = editing === "new" || !editing ? await api.categories.create(v.data) : await api.categories.update(editing.id, v.data);
    setPending(false);
    if (!r.success) return setErrors({ ...(r.error.fields ?? {}), _form: r.error.message });
    toast.success(t.categories.saved);
    setEditing(null);
  };

  const columns: Column<CategoryDto>[] = [
    { id: "name", header: t.categories.colName, cell: (c) => <span className="font-medium">{c.name}</span>, sortable: true },
    { id: "code", header: t.categories.colCode, cell: (c) => c.code || "-", sortable: true, hideOnMobile: true },
    { id: "description", header: t.categories.colDescription, cell: (c) => <span className="line-clamp-1 whitespace-normal">{c.description || "-"}</span>, hideOnMobile: true },
    { id: "items", header: t.categories.colItems, cell: (c) => c.itemCount, numeric: true, sortable: true },
    { id: "status", header: t.common.status, cell: (c) => <ActiveBadge status={c.status} />, sortable: true },
  ];
  const actions = (c: CategoryDto): RowAction[] => [
    { label: t.common.edit, icon: Pencil, onSelect: () => open(c) },
    c.status === "Active"
      ? { label: t.items.deactivate, icon: PowerOff, separated: true, onSelect: () => setAction({ kind: "deactivate", id: c.id, name: c.name }) }
      : { label: t.items.activate, icon: Power, separated: true, onSelect: () => setAction({ kind: "activate", id: c.id, name: c.name }) },
    { label: t.common.delete, icon: Trash2, destructive: true, onSelect: () => setAction({ kind: "delete", id: c.id, name: c.name }) },
  ];

  return (
    <>
      <PageHeader title={t.categories.title} description={t.categories.description} actions={<Button onClick={() => open("new")}>{t.categories.add}</Button>} />
      <LoadGate load={list}>
        <FilterBar dirty={lp.dirty} onClear={lp.clear}>
          <SearchBox value={lp.search} onChange={lp.setSearch} placeholder={t.categories.searchPlaceholder} />
          <SelectField className="w-44" aria-label={t.common.status} value={lp.filters.status} onChange={(v) => lp.set({ status: v })}
            options={[{ value: "all", label: t.common.activeFilter.all }, { value: "Active", label: t.common.activeFilter.Active }, { value: "Inactive", label: t.common.activeFilter.Inactive }]} />
        </FilterBar>
        <DataTable
          caption={t.categories.caption}
          {...tableProps(list, lp)}
          columns={columns}
          rowKey={(c) => c.id}
          rowLabel={(c) => c.name}
          actions={actions}
          empty={<EmptyState title={t.categories.emptyTitle} body={t.categories.emptyBody} action={<Button onClick={() => open("new")}>{t.categories.add}</Button>} />}
        />
      </LoadGate>

      <FormDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === "new" ? t.categories.addTitle : t.categories.editTitle}
        submitLabel={t.categories.save}
        pending={pending}
        onSubmit={submit}
        error={errors._form}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.fields.name} required error={errors.name}>{(p) => <Input {...p} value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} />}</Field>
          <Field label={t.fields.code} required error={errors.code} hint={t.categories.codeHint}>{(p) => <Input {...p} maxLength={3} className="uppercase" value={values.code} onChange={(e) => setValues({ ...values, code: e.target.value.toUpperCase() })} />}</Field>
        </div>
        <Field label={t.fields.status}>
          {(p) => <SelectField {...p} value={values.status} onChange={(v) => setValues({ ...values, status: v })} options={[{ value: "Active", label: t.status.active.Active }, { value: "Inactive", label: t.status.active.Inactive }]} />}
        </Field>
        <Field label={t.fields.description} error={errors.description}>{(p) => <Textarea {...p} rows={3} value={values.description} onChange={(e) => setValues({ ...values, description: e.target.value })} />}</Field>
      </FormDialog>

      <MasterConfirm
        action={action}
        onClose={() => setAction(null)}
        copy={t.categories}
        labels={{ deactivate: t.items.deactivate, activate: t.items.activate, delete: t.common.delete }}
        run={(kind, id) => (kind === "delete" ? api.categories.remove(id) : api.categories.setStatus(id, kind))}
      />
    </>
  );
}
