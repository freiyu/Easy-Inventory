"use client";

import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/shared/data-table";
import { FilterBar, SearchBox } from "@/components/shared/filter-bar";
import { FilterChips } from "@/components/shared/filter-chips";
import { PageHeader } from "@/components/shared/page-header";
import { SelectField } from "@/components/shared/select-field";
import { PurchaseBadge } from "@/components/shared/status-badge";
import { EmptyState, LoadGate } from "@/components/shared/states";
import { tableProps, useCurrentUser, useGet, useListParams } from "@/lib/api";
import type { PurchaseDto } from "@/lib/api/purchases";
import { formatDate } from "@/lib/format";
import { t } from "@/lib/strings";
import type { PurchaseStatus } from "@/lib/types";

const ALL = "all";
const CLOSED = "Rejected,Cancelled"; // the "Closed" tab is two statuses (PRD 6.6 status filter takes a comma list)
const TABS: PurchaseStatus[] = ["Pending Approval", "Approved", "Received"];

/** Number of requests in a tab, from the list's own meta (one row per request is enough). */
const useCount = (status: string) => useGet<PurchaseDto[]>("/purchase-requests", { pageSize: 1, status }).meta?.total;

export default function PurchasesPage() {
  const user = useCurrentUser();
  const lp = useListParams({ sort: "number:desc", filters: { status: ALL, requesterId: ALL } });
  const list = useGet<PurchaseDto[]>("/purchase-requests", lp.params);
  const requesters = useGet<{ id: number; name: string }[]>(user?.role === "Admin" ? "/users" : null, { pageSize: 500, sort: "name:asc" });
  const counts = { [ALL]: useCount(ALL), [TABS[0]]: useCount(TABS[0]), [TABS[1]]: useCount(TABS[1]), [TABS[2]]: useCount(TABS[2]), [CLOSED]: useCount(CLOSED) };

  if (!user) return null;
  const isAdmin = user.role === "Admin";
  const newLink = <Link href="/purchases/new" className={buttonVariants()}>{t.purchases.new}</Link>;

  const columns: Column<PurchaseDto>[] = [
    { id: "number", header: t.purchases.colNumber, cell: (p) => <Link href={`/purchases/view?id=${p.id}`} className="font-medium text-link hover:underline">{p.number}</Link>, sortable: true },
    ...(isAdmin ? [{ id: "requester", header: t.purchases.colRequester, cell: (p: PurchaseDto) => p.requesterName, sortable: true }] : []),
    { id: "items", header: t.purchases.colItems, cell: (p) => <span className="line-clamp-1 max-w-72 whitespace-normal">{p.lineSummary}</span>, hideOnMobile: true },
    { id: "neededBy", header: t.purchases.colNeededBy, cell: (p) => <span className="tabular">{formatDate(p.neededBy)}</span>, sortable: true },
    { id: "status", header: t.purchases.colStatus, cell: (p) => <PurchaseBadge status={p.status} />, sortable: true },
  ];

  return (
    <>
      <PageHeader title={t.purchases.title} description={isAdmin ? t.purchases.descAdmin : t.purchases.descStaff} actions={newLink} />
      <LoadGate load={list}>
        <FilterChips
          label={t.purchases.colStatus}
          value={lp.filters.status}
          onChange={(v) => lp.set({ status: v })}
          chips={[
            { value: ALL, label: t.purchases.tabAll, count: counts[ALL] },
            ...TABS.map((s) => ({ value: s, label: t.status.purchase[s], count: counts[s] })),
            { value: CLOSED, label: t.purchases.tabClosed, count: counts[CLOSED] },
          ]}
        />
        <FilterBar dirty={lp.dirty} onClear={lp.clear}>
          <SearchBox value={lp.search} onChange={lp.setSearch} placeholder={t.purchases.searchPlaceholder} />
          {isAdmin && (
            <SelectField className="w-56" aria-label={t.purchases.colRequester} value={lp.filters.requesterId} onChange={(v) => lp.set({ requesterId: v })}
              options={[{ value: ALL, label: t.purchases.allRequesters }, ...(requesters.data ?? []).map((u) => ({ value: String(u.id), label: u.name }))]} />
          )}
        </FilterBar>
        <DataTable
          caption={t.purchases.caption}
          {...tableProps(list, lp)}
          columns={columns}
          rowKey={(p) => p.id}
          rowLabel={(p) => p.number}
          empty={lp.dirty
            ? <EmptyState title={t.purchases.emptyFiltered} action={<Button variant="outline" onClick={lp.clear}>{t.common.clear}</Button>} />
            : <EmptyState title={t.purchases.emptyTitle} body={isAdmin ? t.purchases.emptyAdminBody : t.purchases.emptyStaffBody} action={newLink} />}
        />
      </LoadGate>
    </>
  );
}
