"use client";

import { DataTable, type Column } from "@/components/shared/data-table";
import { FilterBar, SearchBox } from "@/components/shared/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { SelectField } from "@/components/shared/select-field";
import { EmptyState, LoadGate } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { tableProps, useGet, useListParams } from "@/lib/api";
import type { ActivityRow } from "@/lib/api/admin";
import { formatDateTime } from "@/lib/format";
import { t } from "@/lib/strings";
import type { User } from "@/lib/types";

const ALL = "all";

export default function ActivityLogPage() {
  const lp = useListParams({ sort: "time:desc", filters: { module: ALL, userId: ALL, from: "", to: "" } });
  const list = useGet<ActivityRow[]>("/activity-log", lp.params);
  const modules = useGet<string[]>("/activity-log/modules");
  const users = useGet<User[]>("/users", { pageSize: 500, sort: "name:asc" });
  const { dirty, clear } = lp;

  const columns: Column<ActivityRow>[] = [
    { id: "time", header: t.activity.colTime, cell: (a) => <span className="tabular">{formatDateTime(a.createdAt)}</span>, sortable: true },
    { id: "user", header: t.activity.colUser, cell: (a) => a.userName ?? t.activity.system, sortable: true },
    { id: "action", header: t.activity.colAction, cell: (a) => <span className="font-medium">{a.action}</span>, sortable: true },
    { id: "module", header: t.activity.colModule, cell: (a) => a.module, sortable: true, hideOnMobile: true },
    { id: "ref", header: t.activity.colRef, cell: (a) => <span className="tabular break-all">{a.reference || "-"}</span>, hideOnMobile: true },
    { id: "details", header: t.activity.colDetails, cell: (a) => <span className="line-clamp-1 max-w-72 whitespace-normal">{a.metadata || "-"}</span>, hideOnMobile: true },
  ];

  return (
    <>
      <PageHeader title={t.activity.title} description={t.activity.description} />
      <LoadGate load={list}>
        <FilterBar dirty={dirty} onClear={clear}>
          <SearchBox value={lp.search} onChange={lp.setSearch} placeholder={t.activity.searchPlaceholder} />
          <SelectField className="w-48" aria-label={t.activity.colModule} value={lp.filters.module} onChange={(v) => lp.set({ module: v })} options={[{ value: ALL, label: t.activity.allModules }, ...(modules.data ?? []).map((m) => ({ value: m, label: m }))]} />
          <SelectField className="w-52" aria-label={t.activity.colUser} value={lp.filters.userId} onChange={(v) => lp.set({ userId: v })} options={[{ value: ALL, label: t.activity.allUsers }, ...(users.data ?? []).map((u) => ({ value: String(u.id), label: u.name }))]} />
          <Input type="date" className="w-40" aria-label={t.expenses.from} value={lp.filters.from} onChange={(e) => lp.set({ from: e.target.value })} />
          <Input type="date" className="w-40" aria-label={t.expenses.to} value={lp.filters.to} onChange={(e) => lp.set({ to: e.target.value })} />
        </FilterBar>
        <DataTable
          caption={t.activity.caption}
          {...tableProps(list, lp)}
          columns={columns}
          rowKey={(a) => a.id}
          rowLabel={(a) => a.action}
          empty={dirty
            ? <EmptyState title={t.activity.emptyFiltered} action={<Button variant="outline" onClick={clear}>{t.common.clear}</Button>} />
            : <EmptyState title={t.activity.emptyTitle} />}
        />
      </LoadGate>
    </>
  );
}
