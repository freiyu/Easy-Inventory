"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/shared/data-table";
import { FilterBar, SearchBox } from "@/components/shared/filter-bar";
import { FilterChips } from "@/components/shared/filter-chips";
import { PageHeader } from "@/components/shared/page-header";
import { SelectField } from "@/components/shared/select-field";
import { PurchaseBadge } from "@/components/shared/status-badge";
import { EmptyState, LoadGate } from "@/components/shared/states";
import { usePageLoad } from "@/hooks/use-page-load";
import { formatDate } from "@/lib/format";
import { useCurrentUser, useStore } from "@/lib/mock/store";
import { lineSummary, matches, userName, visiblePurchases } from "@/lib/queries";
import { t } from "@/lib/strings";
import type { PurchaseRequest, PurchaseStatus } from "@/lib/types";

const ALL = "all";
const CLOSED = "closed";
const TABS: PurchaseStatus[] = ["Pending Approval", "Approved", "Received"];

export default function PurchasesPage() {
  const user = useCurrentUser();
  const { db } = useStore();
  const load = usePageLoad("purchases");
  const [tab, setTab] = useState(ALL);
  const [query, setQuery] = useState("");
  const [requester, setRequester] = useState(ALL);

  const mine = useMemo(() => (user ? visiblePurchases(db, user) : []), [db, user]);
  const isAdmin = user?.role === "Admin";
  const inTab = (p: PurchaseRequest, v: string) =>
    v === ALL || (v === CLOSED ? p.status === "Rejected" || p.status === "Cancelled" : p.status === v);
  const rows = useMemo(() => mine.filter((p) =>
    inTab(p, tab) && (requester === ALL || String(p.requesterId) === requester) &&
    matches(query, p.number, userName(db, p.requesterId), lineSummary(db, p), p.reason),
  ), [mine, tab, requester, query, db]);

  if (!user) return null;
  const clear = () => { setQuery(""); setRequester(ALL); setTab(ALL); };
  const dirty = query !== "" || requester !== ALL || tab !== ALL;
  const newLink = <Link href="/purchases/new" className={buttonVariants()}>{t.purchases.new}</Link>;

  const columns: Column<PurchaseRequest>[] = [
    { id: "number", header: t.purchases.colNumber, cell: (p) => <Link href={`/purchases/view?id=${p.id}`} className="font-medium text-link hover:underline">{p.number}</Link>, sortValue: (p) => p.number },
    ...(isAdmin ? [{ id: "requester", header: t.purchases.colRequester, cell: (p: PurchaseRequest) => userName(db, p.requesterId), sortValue: (p: PurchaseRequest) => userName(db, p.requesterId) }] : []),
    { id: "items", header: t.purchases.colItems, cell: (p) => <span className="line-clamp-1 max-w-72 whitespace-normal">{lineSummary(db, p)}</span>, hideOnMobile: true },
    { id: "neededBy", header: t.purchases.colNeededBy, cell: (p) => <span className="tabular">{formatDate(p.neededBy)}</span>, sortValue: (p) => p.neededBy },
    { id: "status", header: t.purchases.colStatus, cell: (p) => <PurchaseBadge status={p.status} />, sortValue: (p) => p.status },
  ];

  return (
    <>
      <PageHeader title={t.purchases.title} description={isAdmin ? t.purchases.descAdmin : t.purchases.descStaff} actions={newLink} />
      <LoadGate load={load}>
        <FilterChips
          label={t.purchases.colStatus}
          value={tab}
          onChange={setTab}
          chips={[
            { value: ALL, label: t.purchases.tabAll, count: mine.length },
            ...TABS.map((s) => ({ value: s, label: t.status.purchase[s], count: mine.filter((p) => inTab(p, s)).length })),
            { value: CLOSED, label: t.purchases.tabClosed, count: mine.filter((p) => inTab(p, CLOSED)).length },
          ]}
        />
        <FilterBar dirty={dirty} onClear={clear}>
          <SearchBox value={query} onChange={setQuery} placeholder={t.purchases.searchPlaceholder} />
          {isAdmin && (
            <SelectField className="w-56" aria-label={t.purchases.colRequester} value={requester} onChange={setRequester}
              options={[{ value: ALL, label: t.purchases.allRequesters }, ...db.users.filter((u) => db.purchaseRequests.some((p) => p.requesterId === u.id)).map((u) => ({ value: String(u.id), label: u.name }))]} />
          )}
        </FilterBar>
        <DataTable
          caption={t.purchases.caption}
          rows={rows}
          columns={columns}
          rowKey={(p) => p.id}
          rowLabel={(p) => p.number}
          initialSort={{ id: "number", dir: "desc" }}
          empty={dirty
            ? <EmptyState title={t.purchases.emptyFiltered} action={<Button variant="outline" onClick={clear}>{t.common.clear}</Button>} />
            : <EmptyState title={t.purchases.emptyTitle} body={isAdmin ? t.purchases.emptyAdminBody : t.purchases.emptyStaffBody} action={newLink} />}
        />
      </LoadGate>
    </>
  );
}
