"use client";

import { useMemo, useState } from "react";
import { DataTable, type Column } from "@/components/shared/data-table";
import { FilterBar, SearchBox } from "@/components/shared/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { SelectField } from "@/components/shared/select-field";
import { EmptyState, LoadGate } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { usePageLoad } from "@/hooks/use-page-load";
import { formatDateTime } from "@/lib/format";
import { useStore } from "@/lib/mock/store";
import { matches, userName } from "@/lib/queries";
import { t } from "@/lib/strings";
import type { ActivityEntry } from "@/lib/types";

const ALL = "all";

export default function ActivityLogPage() {
  const { db } = useStore();
  const load = usePageLoad("activity");
  const [query, setQuery] = useState("");
  const [module, setModule] = useState(ALL);
  const [user, setUser] = useState(ALL);
  const clear = () => { setQuery(""); setModule(ALL); setUser(ALL); };
  const dirty = query !== "" || module !== ALL || user !== ALL;
  const modules = useMemo(() => [...new Set(db.activity.map((a) => a.module))].sort(), [db.activity]);

  const rows = useMemo(() => db.activity.filter((a) =>
    (module === ALL || a.module === module) && (user === ALL || String(a.userId) === user) &&
    matches(query, a.action, a.reference, a.metadata, userName(db, a.userId))), [db, query, module, user]);

  const columns: Column<ActivityEntry>[] = [
    { id: "time", header: t.activity.colTime, cell: (a) => <span className="tabular">{formatDateTime(a.createdAt)}</span>, sortValue: (a) => `${a.createdAt}${String(a.id).padStart(8, "0")}` },
    { id: "user", header: t.activity.colUser, cell: (a) => (a.userId ? userName(db, a.userId) : t.activity.system), sortValue: (a) => userName(db, a.userId) },
    { id: "action", header: t.activity.colAction, cell: (a) => <span className="font-medium">{a.action}</span>, sortValue: (a) => a.action },
    { id: "module", header: t.activity.colModule, cell: (a) => a.module, sortValue: (a) => a.module, hideOnMobile: true },
    { id: "ref", header: t.activity.colRef, cell: (a) => <span className="tabular break-all">{a.reference || "-"}</span>, hideOnMobile: true },
    { id: "details", header: t.activity.colDetails, cell: (a) => <span className="line-clamp-1 max-w-72 whitespace-normal">{a.metadata || "-"}</span>, hideOnMobile: true },
  ];

  return (
    <>
      <PageHeader title={t.activity.title} description={t.activity.description} />
      <LoadGate load={load}>
        <FilterBar dirty={dirty} onClear={clear}>
          <SearchBox value={query} onChange={setQuery} placeholder={t.activity.searchPlaceholder} />
          <SelectField className="w-48" aria-label={t.activity.colModule} value={module} onChange={setModule} options={[{ value: ALL, label: t.activity.allModules }, ...modules.map((m) => ({ value: m, label: m }))]} />
          <SelectField className="w-52" aria-label={t.activity.colUser} value={user} onChange={setUser} options={[{ value: ALL, label: t.activity.allUsers }, ...db.users.map((u) => ({ value: String(u.id), label: u.name }))]} />
        </FilterBar>
        <DataTable
          caption={t.activity.caption}
          rows={rows}
          columns={columns}
          rowKey={(a) => a.id}
          rowLabel={(a) => a.action}
          initialSort={{ id: "time", dir: "desc" }}
          empty={dirty
            ? <EmptyState title={t.activity.emptyFiltered} action={<Button variant="outline" onClick={clear}>{t.common.clear}</Button>} />
            : <EmptyState title={t.activity.emptyTitle} />}
        />
      </LoadGate>
    </>
  );
}
