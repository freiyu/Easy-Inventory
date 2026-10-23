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
import { categorySchema, validate, type FieldErrors } from "@/lib/schemas";
import { t } from "@/lib/strings";
import type { Category } from "@/lib/types";

const blank = { name: "", code: "", description: "", status: "Active" };

export default function CategoriesPage() {
  const { db } = useStore();
  const load = usePageLoad("categories");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  const [values, setValues] = useState(blank);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);
  const [action, setAction] = useState<MasterAction>(null);

  const rows = useMemo(
    () => db.categories.filter((c) => (status === "all" || c.status === status) && matches(query, c.name, c.code, c.description)),
    [db.categories, query, status],
  );
  const count = (id: number) => db.items.filter((i) => i.categoryId === id).length;

  const open = (c: Category | "new") => {
    setEditing(c);
    setErrors({});
    setValues(c === "new" ? blank : { name: c.name, code: c.code, description: c.description, status: c.status });
  };

  const submit = async () => {
    const v = validate(categorySchema, values);
    setErrors(v.ok ? {} : v.errors);
    if (!v.ok) return;
    setPending(true);
    const r = await api.categories.save(editing === "new" || !editing ? null : editing.id, v.data);
    setPending(false);
    if (!r.ok) return setErrors({ ...(r.error.fields ?? {}), _form: r.error.message });
    toast.success(t.categories.saved);
    setEditing(null);
  };

  const columns: Column<Category>[] = [
    { id: "name", header: t.categories.colName, cell: (c) => <span className="font-medium">{c.name}</span>, sortValue: (c) => c.name },
    { id: "code", header: t.categories.colCode, cell: (c) => c.code || "-", sortValue: (c) => c.code, hideOnMobile: true },
    { id: "description", header: t.categories.colDescription, cell: (c) => <span className="line-clamp-1 whitespace-normal">{c.description || "-"}</span>, hideOnMobile: true },
    { id: "items", header: t.categories.colItems, cell: (c) => count(c.id), numeric: true, sortValue: (c) => count(c.id) },
    { id: "status", header: t.common.status, cell: (c) => <ActiveBadge status={c.status} />, sortValue: (c) => c.status },
  ];
  const actions = (c: Category): RowAction[] => [
    { label: t.common.edit, icon: Pencil, onSelect: () => open(c) },
    c.status === "Active"
      ? { label: t.items.deactivate, icon: PowerOff, separated: true, onSelect: () => setAction({ kind: "deactivate", id: c.id, name: c.name }) }
      : { label: t.items.activate, icon: Power, separated: true, onSelect: () => setAction({ kind: "activate", id: c.id, name: c.name }) },
    { label: t.common.delete, icon: Trash2, destructive: true, onSelect: () => setAction({ kind: "delete", id: c.id, name: c.name }) },
  ];

  return (
    <>
      <PageHeader title={t.categories.title} description={t.categories.description} actions={<Button onClick={() => open("new")}>{t.categories.add}</Button>} />
      <LoadGate load={load}>
        <FilterBar dirty={query !== "" || status !== "all"} onClear={() => { setQuery(""); setStatus("all"); }}>
          <SearchBox value={query} onChange={setQuery} placeholder={t.categories.searchPlaceholder} />
          <SelectField className="w-44" aria-label={t.common.status} value={status} onChange={setStatus}
            options={[{ value: "all", label: t.common.activeFilter.all }, { value: "Active", label: t.common.activeFilter.Active }, { value: "Inactive", label: t.common.activeFilter.Inactive }]} />
        </FilterBar>
        <DataTable
          caption={t.categories.caption}
          rows={rows}
          columns={columns}
          rowKey={(c) => c.id}
          rowLabel={(c) => c.name}
          actions={actions}
          initialSort={{ id: "name", dir: "asc" }}
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
          <Field label={t.fields.code} error={errors.code}>{(p) => <Input {...p} value={values.code} onChange={(e) => setValues({ ...values, code: e.target.value })} />}</Field>
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
        run={(kind, id) => (kind === "delete" ? api.categories.remove(id) : kind === "activate" ? api.categories.activate(id) : api.categories.deactivate(id))}
      />
    </>
  );
}
