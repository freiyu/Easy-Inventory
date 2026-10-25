"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/shared/data-table";
import { FilterBar, SearchBox } from "@/components/shared/filter-bar";
import { FilterChips } from "@/components/shared/filter-chips";
import { PageHeader } from "@/components/shared/page-header";
import { SelectField } from "@/components/shared/select-field";
import { LoanBadge } from "@/components/shared/status-badge";
import { EmptyState, LoadGate } from "@/components/shared/states";
import { usePageLoad } from "@/hooks/use-page-load";
import { formatDate } from "@/lib/format";
import { useCurrentUser, useStore } from "@/lib/mock/store";
import { lineSummary, matches, userName, visibleLoans } from "@/lib/queries";
import { loanDisplayStatus } from "@/lib/rules";
import { t } from "@/lib/strings";
import type { Loan, LoanDisplayStatus } from "@/lib/types";

const ALL = "all";
const CLOSED = "closed";
const TABS: LoanDisplayStatus[] = ["Pending Approval", "Approved", "Borrowed", "Overdue", "Completed"];

export default function LoansPage() {
  const user = useCurrentUser();
  const { db } = useStore();
  const load = usePageLoad("loans");
  const [tab, setTab] = useState(ALL);
  const [query, setQuery] = useState("");
  const [borrower, setBorrower] = useState(ALL);

  const mine = useMemo(() => (user ? visibleLoans(db, user) : []), [db, user]);
  const isAdmin = user?.role === "Admin";
  const inTab = (l: Loan, v: string) => {
    const s = loanDisplayStatus(l);
    if (v === ALL) return true;
    if (v === CLOSED) return s === "Rejected" || s === "Cancelled";
    // "Borrowed" tab includes loans that are borrowed and overdue
    if (v === "Borrowed") return s === "Borrowed" || s === "Overdue";
    return s === v;
  };
  const rows = useMemo(() => mine.filter((l) =>
    inTab(l, tab) && (borrower === ALL || String(l.borrowerId) === borrower) &&
    matches(query, l.number, userName(db, l.borrowerId), lineSummary(db, l), l.purpose),
  ), [mine, tab, borrower, query, db]);

  if (!user) return null;
  const clear = () => { setQuery(""); setBorrower(ALL); setTab(ALL); };
  const dirty = query !== "" || borrower !== ALL || tab !== ALL;
  const newLink = <Link href="/loans/new" className={buttonVariants()}>{isAdmin ? t.loans.newAdmin : t.loans.newStaff}</Link>;

  const columns: Column<Loan>[] = [
    { id: "number", header: t.loans.colNumber, cell: (l) => <Link href={`/loans/view?id=${l.id}`} className="font-medium text-link hover:underline">{l.number}</Link>, sortValue: (l) => l.number },
    ...(isAdmin ? [{ id: "borrower", header: t.loans.colBorrower, cell: (l: Loan) => userName(db, l.borrowerId), sortValue: (l: Loan) => userName(db, l.borrowerId) }] : []),
    { id: "items", header: t.loans.colItems, cell: (l) => <span className="line-clamp-1 max-w-72 whitespace-normal">{lineSummary(db, l)}</span>, hideOnMobile: true },
    { id: "loanDate", header: t.loans.colLoanDate, cell: (l) => <span className="tabular">{formatDate(l.loanDate)}</span>, sortValue: (l) => l.loanDate, hideOnMobile: true },
    { id: "expected", header: t.loans.colExpected, cell: (l) => <span className="tabular">{formatDate(l.expectedReturnDate)}</span>, sortValue: (l) => l.expectedReturnDate },
    { id: "status", header: t.loans.colStatus, cell: (l) => <LoanBadge status={loanDisplayStatus(l)} />, sortValue: (l) => loanDisplayStatus(l) },
  ];

  return (
    <>
      <PageHeader title={t.loans.title} description={isAdmin ? t.loans.descAdmin : t.loans.descStaff} actions={newLink} />
      <LoadGate load={load}>
        <FilterChips
          label={t.loans.colStatus}
          value={tab}
          onChange={setTab}
          chips={[
            { value: ALL, label: t.loans.tabAll, count: mine.length },
            ...TABS.map((s) => ({ value: s, label: t.status.loan[s], count: mine.filter((l) => inTab(l, s)).length })),
            { value: CLOSED, label: t.loans.tabClosed, count: mine.filter((l) => inTab(l, CLOSED)).length },
          ]}
        />
        <FilterBar dirty={dirty} onClear={clear}>
          <SearchBox value={query} onChange={setQuery} placeholder={t.loans.searchPlaceholder} />
          {isAdmin && (
            <SelectField className="w-56" aria-label={t.loans.colBorrower} value={borrower} onChange={setBorrower}
              options={[{ value: ALL, label: t.loans.allBorrowers }, ...db.users.filter((u) => db.loans.some((l) => l.borrowerId === u.id)).map((u) => ({ value: String(u.id), label: u.name }))]} />
          )}
        </FilterBar>
        <DataTable
          caption={t.loans.caption}
          rows={rows}
          columns={columns}
          rowKey={(l) => l.id}
          rowLabel={(l) => l.number}
          initialSort={{ id: "number", dir: "desc" }}
          empty={dirty
            ? <EmptyState title={t.loans.emptyFiltered} action={<Button variant="outline" onClick={clear}>{t.common.clear}</Button>} />
            : <EmptyState title={t.loans.emptyTitle} body={isAdmin ? t.loans.emptyAdminBody : t.loans.emptyStaffBody} action={newLink} />}
        />
      </LoadGate>
    </>
  );
}
