"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable, type Column } from "@/components/shared/data-table";
import { FilterBar, SearchBox } from "@/components/shared/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { SelectField } from "@/components/shared/select-field";
import { LoanBadge, StockBadge, TxTypeBadge } from "@/components/shared/status-badge";
import { EmptyState, LoadGate } from "@/components/shared/states";
import { usePageLoad } from "@/hooks/use-page-load";
import { formatDate, formatNumber } from "@/lib/format";
import { useStore } from "@/lib/mock/store";
import type { DB } from "@/lib/mock/ops";
import { categoryName, itemName, lineSummary, matches, userName } from "@/lib/queries";
import { loanDisplayStatus, stockStatus } from "@/lib/rules";
import { t } from "@/lib/strings";
import type { Item, Loan, StockLine, StockTransaction } from "@/lib/types";

const ALL = "all";
const exportMock = () => toast.info(t.common.exportMocked);

const NoRows = ({ onClear }: { onClear: () => void }) => (
  <EmptyState title={t.reports.emptyTitle} body={t.reports.emptyBody} action={<Button variant="outline" onClick={onClear}>{t.common.clear}</Button>} />
);

function ReportHeader({ count }: { count: number }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <p className="text-base text-muted-foreground" aria-live="polite">{t.reports.rows(count)}</p>
      <Button variant="outline" onClick={exportMock}>{t.reports.exportReport}</Button>
    </div>
  );
}

function StockReport({ db }: { db: DB }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const clear = () => { setQuery(""); setCategory(ALL); setStatus(ALL); };
  const rows = useMemo(() => db.items.filter((i) =>
    i.status === "Active" && (category === ALL || String(i.categoryId) === category) &&
    (status === ALL || stockStatus(i.currentStock, i.minimumStock) === status) && matches(query, i.name, i.code)), [db.items, query, category, status]);
  const columns: Column<Item>[] = [
    { id: "code", header: t.reports.colCode, cell: (i) => <span className="tabular text-muted-foreground">{i.code}</span>, sortValue: (i) => i.code },
    { id: "name", header: t.reports.colItem, cell: (i) => <Link href={`/items/view?id=${i.id}`} className="font-medium hover:text-link hover:underline">{i.name}</Link>, sortValue: (i) => i.name },
    { id: "category", header: t.reports.colCategory, cell: (i) => categoryName(db, i.categoryId), sortValue: (i) => categoryName(db, i.categoryId), hideOnMobile: true },
    { id: "unit", header: t.reports.colUnit, cell: (i) => i.unit, hideOnMobile: true },
    { id: "stock", header: t.reports.colStock, cell: (i) => formatNumber(i.currentStock), numeric: true, sortValue: (i) => i.currentStock },
    { id: "minimum", header: t.reports.colMinimum, cell: (i) => formatNumber(i.minimumStock), numeric: true, sortValue: (i) => i.minimumStock, hideOnMobile: true },
    { id: "status", header: t.reports.colStatus, cell: (i) => <StockBadge status={stockStatus(i.currentStock, i.minimumStock)} />, sortValue: (i) => stockStatus(i.currentStock, i.minimumStock) },
  ];
  return (
    <>
      <FilterBar dirty={query !== "" || category !== ALL || status !== ALL} onClear={clear}>
        <SearchBox value={query} onChange={setQuery} placeholder={t.reports.searchStock} />
        <SelectField className="w-48" aria-label={t.reports.colCategory} value={category} onChange={setCategory} options={[{ value: ALL, label: t.items.allCategories }, ...db.categories.map((c) => ({ value: String(c.id), label: c.name }))]} />
        <SelectField className="w-52" aria-label={t.reports.colStatus} value={status} onChange={setStatus} options={[{ value: ALL, label: t.items.allStockStatus }, ...(["Safe", "Low", "Out"] as const).map((s) => ({ value: s, label: s }))]} />
      </FilterBar>
      <ReportHeader count={rows.length} />
      <DataTable caption={t.reports.stockCaption} rows={rows} columns={columns} rowKey={(i) => i.id} rowLabel={(i) => i.name} initialSort={{ id: "code", dir: "asc" }} empty={<NoRows onClear={clear} />} />
    </>
  );
}

interface Movement { tx: StockTransaction; line: StockLine; key: string }

function MovementsReport({ db }: { db: DB }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState(ALL);
  const clear = () => { setQuery(""); setType(ALL); };
  const rows = useMemo<Movement[]>(() => db.transactions.flatMap((tx) => tx.lines.map((line) => ({ tx, line, key: `${tx.id}-${line.itemId}` })))
    .filter((m) => (type === ALL || m.tx.type === type) && matches(query, itemName(db, m.line.itemId), m.tx.number, userName(db, m.tx.userId))), [db, query, type]);
  const columns: Column<Movement>[] = [
    { id: "date", header: t.reports.colDate, cell: (m) => <span className="tabular">{formatDate(m.tx.date)}</span>, sortValue: (m) => `${m.tx.date}${String(m.tx.id).padStart(6, "0")}` },
    { id: "item", header: t.reports.colItem, cell: (m) => <span className="font-medium">{itemName(db, m.line.itemId)}</span>, sortValue: (m) => itemName(db, m.line.itemId) },
    { id: "type", header: t.reports.colType, cell: (m) => <TxTypeBadge type={m.tx.type} />, sortValue: (m) => m.tx.type },
    { id: "change", header: t.reports.colChange, cell: (m) => <span className={m.line.quantityChange < 0 ? "text-danger-icon" : "text-success-icon"}>{m.line.quantityChange > 0 ? "+" : ""}{formatNumber(m.line.quantityChange)}</span>, numeric: true, sortValue: (m) => m.line.quantityChange },
    { id: "balance", header: t.reports.colBalance, cell: (m) => formatNumber(m.line.balanceAfter), numeric: true, sortValue: (m) => m.line.balanceAfter },
    { id: "user", header: t.reports.colUser, cell: (m) => userName(db, m.tx.userId), hideOnMobile: true },
    { id: "ref", header: t.reports.colRef, cell: (m) => <Link href={`/stock/view?id=${m.tx.id}`} className="text-link hover:underline">{m.tx.number}</Link>, sortValue: (m) => m.tx.number },
  ];
  return (
    <>
      <FilterBar dirty={query !== "" || type !== ALL} onClear={clear}>
        <SearchBox value={query} onChange={setQuery} placeholder={t.reports.searchMovements} />
        <SelectField className="w-48" aria-label={t.reports.colType} value={type} onChange={setType}
          options={[{ value: ALL, label: t.stock.allTypes }, ...(Object.keys(t.status.txType) as (keyof typeof t.status.txType)[]).map((k) => ({ value: k, label: t.status.txType[k] }))]} />
      </FilterBar>
      <ReportHeader count={rows.length} />
      <DataTable caption={t.reports.movementsCaption} rows={rows} columns={columns} rowKey={(m) => m.key} rowLabel={(m) => `${m.tx.number} ${itemName(db, m.line.itemId)}`} initialSort={{ id: "date", dir: "desc" }} empty={<NoRows onClear={clear} />} />
    </>
  );
}

function LoansReport({ db }: { db: DB }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState(ALL);
  const clear = () => { setQuery(""); setStatus(ALL); };
  const rows = useMemo(() => db.loans.filter((l) => (status === ALL || loanDisplayStatus(l) === status) &&
    matches(query, l.number, userName(db, l.borrowerId), lineSummary(db, l))), [db, query, status]);
  const columns: Column<Loan>[] = [
    { id: "number", header: t.reports.colLoan, cell: (l) => <Link href={`/loans/view?id=${l.id}`} className="font-medium text-link hover:underline">{l.number}</Link>, sortValue: (l) => l.number },
    { id: "borrower", header: t.reports.colBorrower, cell: (l) => userName(db, l.borrowerId), sortValue: (l) => userName(db, l.borrowerId) },
    { id: "items", header: t.loans.colItems, cell: (l) => <span className="line-clamp-1 max-w-64 whitespace-normal">{lineSummary(db, l)}</span>, hideOnMobile: true },
    { id: "loanDate", header: t.reports.colLoanDate, cell: (l) => <span className="tabular">{formatDate(l.loanDate)}</span>, sortValue: (l) => l.loanDate, hideOnMobile: true },
    { id: "expected", header: t.reports.colExpected, cell: (l) => <span className="tabular">{formatDate(l.expectedReturnDate)}</span>, sortValue: (l) => l.expectedReturnDate },
    { id: "returned", header: t.reports.colReturned, cell: (l) => <span className="tabular">{formatDate(l.returnedAt)}</span>, sortValue: (l) => l.returnedAt ?? "", hideOnMobile: true },
    { id: "status", header: t.reports.colStatus, cell: (l) => <LoanBadge status={loanDisplayStatus(l)} />, sortValue: (l) => loanDisplayStatus(l) },
  ];
  return (
    <>
      <FilterBar dirty={query !== "" || status !== ALL} onClear={clear}>
        <SearchBox value={query} onChange={setQuery} placeholder={t.reports.searchLoans} />
        <SelectField className="w-52" aria-label={t.reports.colStatus} value={status} onChange={setStatus}
          options={[{ value: ALL, label: t.reports.allLoanStatuses }, ...(Object.keys(t.status.loan) as (keyof typeof t.status.loan)[]).map((k) => ({ value: k, label: t.status.loan[k] }))]} />
      </FilterBar>
      <ReportHeader count={rows.length} />
      <p className="mb-3 text-sm text-muted-foreground">{t.reports.overdueHighlight}</p>
      <DataTable caption={t.reports.loansCaption} rows={rows} columns={columns} rowKey={(l) => l.id} rowLabel={(l) => l.number} initialSort={{ id: "number", dir: "desc" }} empty={<NoRows onClear={clear} />} />
    </>
  );
}

export default function ReportsPage() {
  const { db } = useStore();
  const load = usePageLoad("reports");
  return (
    <>
      <PageHeader title={t.reports.title} description={t.reports.description} />
      <LoadGate load={load}>
        <Tabs defaultValue="stock">
          <TabsList variant="line" className="mb-4 w-full justify-start overflow-x-auto">
            <TabsTrigger value="stock" className="h-10 flex-none px-4 text-base">{t.reports.tabStock}</TabsTrigger>
            <TabsTrigger value="movements" className="h-10 flex-none px-4 text-base">{t.reports.tabMovements}</TabsTrigger>
            <TabsTrigger value="loans" className="h-10 flex-none px-4 text-base">{t.reports.tabLoans}</TabsTrigger>
          </TabsList>
          <TabsContent value="stock"><StockReport db={db} /></TabsContent>
          <TabsContent value="movements"><MovementsReport db={db} /></TabsContent>
          <TabsContent value="loans"><LoansReport db={db} /></TabsContent>
        </Tabs>
      </LoadGate>
    </>
  );
}
