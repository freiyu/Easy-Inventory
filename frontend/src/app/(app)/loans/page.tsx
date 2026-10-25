"use client";

import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/shared/data-table";
import { FilterBar, SearchBox } from "@/components/shared/filter-bar";
import { FilterChips } from "@/components/shared/filter-chips";
import { PageHeader } from "@/components/shared/page-header";
import { SelectField } from "@/components/shared/select-field";
import { LoanBadge } from "@/components/shared/status-badge";
import { EmptyState, LoadGate } from "@/components/shared/states";
import { tableProps, useCurrentUser, useGet, useListParams } from "@/lib/api";
import type { LoanDto } from "@/lib/api/loans";
import { formatDate } from "@/lib/format";
import { t } from "@/lib/strings";
import type { LoanDisplayStatus } from "@/lib/types";

const ALL = "all";
const CLOSED = "closed";
const TABS: LoanDisplayStatus[] = ["Pending Approval", "Approved", "Borrowed", "Overdue", "Completed"];

export default function LoansPage() {
  const user = useCurrentUser();
  const isAdmin = user?.role === "Admin";
  const lp = useListParams({ sort: "number:desc", filters: { status: ALL, borrowerId: ALL } });
  const list = useGet<LoanDto[]>("/loans", lp.params);
  // Chip counts and borrower choices come from one unfiltered read.
  // shortcut: counts cover the newest 500 loans, upgrade with a counts endpoint if a site outgrows that.
  const everything = useGet<LoanDto[]>("/loans", { pageSize: 500 });
  const mine = everything.data ?? [];
  const count = (v: string) => mine.filter((l) => (v === ALL ? true : v === CLOSED ? l.displayStatus === "Rejected" || l.displayStatus === "Cancelled" : v === "Borrowed" ? l.displayStatus === "Borrowed" || l.displayStatus === "Overdue" : l.displayStatus === v)).length;
  const borrowers = [...new Map(mine.map((l) => [l.borrowerId, l.borrowerName])).entries()];

  if (!user) return null;
  const newLink = <Link href="/loans/new" className={buttonVariants()}>{isAdmin ? t.loans.newAdmin : t.loans.newStaff}</Link>;

  const columns: Column<LoanDto>[] = [
    { id: "number", header: t.loans.colNumber, cell: (l) => <Link href={`/loans/view?id=${l.id}`} className="font-medium text-link hover:underline">{l.number}</Link>, sortable: true },
    ...(isAdmin ? [{ id: "borrower", header: t.loans.colBorrower, cell: (l: LoanDto) => l.borrowerName, sortable: true }] : []),
    { id: "items", header: t.loans.colItems, cell: (l) => <span className="line-clamp-1 max-w-72 whitespace-normal">{l.itemsSummary}</span>, hideOnMobile: true },
    { id: "loanDate", header: t.loans.colLoanDate, cell: (l) => <span className="tabular">{formatDate(l.loanDate)}</span>, sortable: true, hideOnMobile: true },
    { id: "expected", header: t.loans.colExpected, cell: (l) => <span className="tabular">{formatDate(l.expectedReturnDate)}</span>, sortable: true },
    { id: "status", header: t.loans.colStatus, cell: (l) => <LoanBadge status={l.displayStatus} />, sortable: true },
  ];

  return (
    <>
      <PageHeader title={t.loans.title} description={isAdmin ? t.loans.descAdmin : t.loans.descStaff} actions={newLink} />
      <FilterChips
        label={t.loans.colStatus}
        value={lp.filters.status}
        onChange={(v) => lp.set({ status: v })}
        chips={[
          { value: ALL, label: t.loans.tabAll, count: mine.length },
          ...TABS.map((s) => ({ value: s, label: t.status.loan[s], count: count(s) })),
          { value: CLOSED, label: t.loans.tabClosed, count: count(CLOSED) },
        ]}
      />
      <FilterBar dirty={lp.dirty} onClear={lp.clear}>
        <SearchBox value={lp.search} onChange={lp.setSearch} placeholder={t.loans.searchPlaceholder} />
        {isAdmin && (
          <SelectField className="w-56" aria-label={t.loans.colBorrower} value={lp.filters.borrowerId} onChange={(v) => lp.set({ borrowerId: v })}
            options={[{ value: ALL, label: t.loans.allBorrowers }, ...borrowers.map(([id, name]) => ({ value: String(id), label: name }))]} />
        )}
      </FilterBar>
      <LoadGate load={list}>
        <DataTable
          caption={t.loans.caption}
          {...tableProps(list, lp)}
          columns={columns}
          rowKey={(l) => l.id}
          rowLabel={(l) => l.number}
          empty={lp.dirty
            ? <EmptyState title={t.loans.emptyFiltered} action={<Button variant="outline" onClick={lp.clear}>{t.common.clear}</Button>} />
            : <EmptyState title={t.loans.emptyTitle} body={isAdmin ? t.loans.emptyAdminBody : t.loans.emptyStaffBody} action={newLink} />}
        />
      </LoadGate>
    </>
  );
}
