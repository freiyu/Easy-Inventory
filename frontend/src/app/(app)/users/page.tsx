"use client";

import { useMemo, useState } from "react";
import { KeyRound, Pencil, Power, PowerOff, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DataTable, type Column, type RowAction } from "@/components/shared/data-table";
import { ConfirmDialog, FormDialog } from "@/components/shared/dialogs";
import { FilterBar, SearchBox } from "@/components/shared/filter-bar";
import { Field } from "@/components/shared/form-field";
import { PageHeader } from "@/components/shared/page-header";
import { SelectField } from "@/components/shared/select-field";
import { ActiveBadge, RoleBadge, StatusBadge } from "@/components/shared/status-badge";
import { EmptyState, LoadGate } from "@/components/shared/states";
import { usePageLoad } from "@/hooks/use-page-load";
import { formatDateTime } from "@/lib/format";
import { api, useCurrentUser, useStore } from "@/lib/mock/store";
import { matches } from "@/lib/queries";
import { userSchema, validate, type FieldErrors } from "@/lib/schemas";
import { t } from "@/lib/strings";
import type { Result, User } from "@/lib/types";

const ALL = "all";
type Pending = { kind: "deactivate" | "activate" | "reset"; user: User } | null;

export default function UsersPage() {
  const me = useCurrentUser();
  const { db } = useStore();
  const load = usePageLoad("users");
  const [query, setQuery] = useState("");
  const [role, setRole] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [editing, setEditing] = useState<User | "new" | null>(null);
  const [values, setValues] = useState({ name: "", email: "", role: "Staff" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [temp, setTemp] = useState<{ name: string; password: string } | null>(null);

  const clear = () => { setQuery(""); setRole(ALL); setStatus(ALL); };
  const rows = useMemo(() => db.users.filter((u) =>
    (role === ALL || u.role === role) && (status === ALL || u.status === status) && matches(query, u.name, u.email)), [db.users, query, role, status]);

  const open = (u: User | "new") => {
    setEditing(u);
    setErrors({});
    setValues(u === "new" ? { name: "", email: "", role: "Staff" } : { name: u.name, email: u.email, role: u.role });
  };

  const submit = async () => {
    const v = validate(userSchema, values);
    setErrors(v.ok ? {} : v.errors);
    if (!v.ok) return;
    setSaving(true);
    const creating = editing === "new";
    const r = creating ? await api.users.create(v.data) : await api.users.update((editing as User).id, v.data);
    setSaving(false);
    if (!r.ok) return setErrors({ ...(r.error.fields ?? {}), _form: r.error.message });
    toast.success(t.users.saved);
    setEditing(null);
    if (creating && "tempPassword" in r.data) setTemp({ name: r.data.user.name, password: r.data.tempPassword });
  };

  const columns: Column<User>[] = [
    {
      id: "name", header: t.users.colName, sortValue: (u) => u.name,
      cell: (u) => <span className="font-medium">{u.name}{u.id === me?.id && <span className="font-normal text-muted-foreground"> ({t.common.you})</span>}</span>,
    },
    { id: "email", header: t.users.colEmail, cell: (u) => <span className="break-all">{u.email}</span>, sortValue: (u) => u.email, hideOnMobile: true },
    { id: "role", header: t.users.colRole, cell: (u) => <RoleBadge role={u.role} />, sortValue: (u) => u.role },
    {
      id: "status", header: t.users.colStatus, sortValue: (u) => u.status,
      cell: (u) => (
        <span className="flex flex-wrap gap-1.5">
          <ActiveBadge status={u.status} />
          {u.mustChangePassword && <StatusBadge tone="warning" icon={ShieldAlert}>{t.users.mustChange}</StatusBadge>}
        </span>
      ),
    },
    { id: "last", header: t.users.colLastLogin, cell: (u) => <span className="tabular">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : t.users.never}</span>, sortValue: (u) => u.lastLoginAt ?? "", hideOnMobile: true },
  ];

  const actions = (u: User): RowAction[] => [
    { label: t.users.edit, icon: Pencil, onSelect: () => open(u) },
    { label: t.users.resetPassword, icon: KeyRound, onSelect: () => setPending({ kind: "reset", user: u }), hidden: u.status !== "Active" },
    u.status === "Active"
      ? { label: t.users.deactivate, icon: PowerOff, separated: true, onSelect: () => setPending({ kind: "deactivate", user: u }) }
      : { label: t.users.activate, icon: Power, separated: true, onSelect: () => setPending({ kind: "activate", user: u }) },
  ];

  const confirm = pending && {
    deactivate: { title: t.users.deactivateTitle(pending.user.name), body: t.users.deactivateBody, label: t.users.deactivate, destructive: true },
    activate: { title: t.users.activateTitle(pending.user.name), body: t.users.activateBody, label: t.users.activate, destructive: false },
    reset: { title: t.users.resetTitle(pending.user.name), body: t.users.resetBody, label: t.users.resetPassword, destructive: false },
  }[pending.kind];

  const runPending = async (): Promise<Result<unknown>> => {
    if (!pending) throw new Error("no pending action");
    const { kind, user } = pending;
    if (kind === "reset") {
      const r = await api.users.resetPassword(user.id);
      if (r.ok) setTemp({ name: user.name, password: r.data.tempPassword });
      return r;
    }
    const r = await (kind === "deactivate" ? api.users.deactivate(user.id) : api.users.activate(user.id));
    if (r.ok) toast.success(kind === "deactivate" ? t.users.deactivated : t.users.activated);
    return r;
  };

  return (
    <>
      <PageHeader title={t.users.title} description={t.users.description} actions={<Button onClick={() => open("new")}>{t.users.add}</Button>} />
      <LoadGate load={load}>
        <FilterBar dirty={query !== "" || role !== ALL || status !== ALL} onClear={clear}>
          <SearchBox value={query} onChange={setQuery} placeholder={t.users.searchPlaceholder} />
          <SelectField className="w-44" aria-label={t.users.colRole} value={role} onChange={setRole} options={[{ value: ALL, label: t.users.allRoles }, { value: "Admin", label: "Admin" }, { value: "Staff", label: "Staff" }]} />
          <SelectField className="w-44" aria-label={t.users.colStatus} value={status} onChange={setStatus}
            options={[{ value: ALL, label: t.common.activeFilter.all }, { value: "Active", label: t.common.activeFilter.Active }, { value: "Inactive", label: t.common.activeFilter.Inactive }]} />
        </FilterBar>
        <DataTable
          caption={t.users.caption}
          rows={rows}
          columns={columns}
          rowKey={(u) => u.id}
          rowLabel={(u) => u.name}
          actions={actions}
          initialSort={{ id: "name", dir: "asc" }}
          empty={<EmptyState title={t.users.emptyTitle} action={<Button variant="outline" onClick={clear}>{t.common.clear}</Button>} />}
        />
      </LoadGate>

      <FormDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === "new" ? t.users.addTitle : t.users.editTitle}
        description={editing === "new" ? t.users.addDesc : undefined}
        submitLabel={t.users.save}
        pending={saving}
        onSubmit={submit}
        error={errors._form}
      >
        <Field label={t.fields.fullName} required error={errors.name}>{(p) => <Input {...p} value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} />}</Field>
        <Field label={t.fields.email} required error={errors.email}>{(p) => <Input {...p} type="email" value={values.email} onChange={(e) => setValues({ ...values, email: e.target.value })} />}</Field>
        <Field label={t.fields.role} required hint={t.users.roleHint}>
          {(p) => <SelectField {...p} value={values.role} onChange={(v) => setValues({ ...values, role: v })} options={[{ value: "Staff", label: "Staff" }, { value: "Admin", label: "Admin" }]} />}
        </Field>
      </FormDialog>

      {confirm && pending && (
        <ConfirmDialog open onOpenChange={(o) => !o && setPending(null)} title={confirm.title} description={confirm.body} confirmLabel={confirm.label} destructive={confirm.destructive} onConfirm={runPending} />
      )}

      <Dialog open={temp !== null} onOpenChange={(o) => !o && setTemp(null)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">{t.users.tempTitle}</DialogTitle>
            <DialogDescription className="text-base">{temp && t.users.tempBody(temp.name)}</DialogDescription>
          </DialogHeader>
          <p className="tabular rounded-lg bg-muted px-4 py-3 text-center text-xl font-semibold tracking-wider select-all">{temp?.password}</p>
          <DialogFooter>
            <Button onClick={() => setTemp(null)}>{t.users.tempClose}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
