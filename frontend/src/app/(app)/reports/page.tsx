"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DownloadButton } from "@/components/shared/download-button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/shared/form-field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable, type Column } from "@/components/shared/data-table";
import { FilterBar, SearchBox } from "@/components/shared/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { SelectField } from "@/components/shared/select-field";
import { LoanBadge, StockBadge, TxTypeBadge } from "@/components/shared/status-badge";
import { EmptyState, LoadGate } from "@/components/shared/states";
import { api, tableProps, useGet, useListParams } from "@/lib/api";
import type { LoanReportRow, MovementRow, StockReportRow } from "@/lib/api/admin";
import type { CategoryOption } from "@/lib/api/master";
import { formatDate, formatNumber } from "@/lib/format";
import { t } from "@/lib/strings";

const ALL = "all";

type ListState = ReturnType<typeof useListParams>;

/** Clears search, sort, paging and the given filters but keeps the `tab` in the URL. */
const clearTab = (lp: ListState, filterKeys: string[]) => {
  lp.setSearch("");
  lp.set({ search: undefined, sort: undefined, pageSize: undefined, ...Object.fromEntries(filterKeys.map((k) => [k, undefined])) });
};

const NoRows = ({ onClear }: { onClear: () => void }) => (
  <EmptyState title={t.reports.emptyTitle} body={t.reports.emptyBody} action={<Button variant="outline" onClick={onClear}>{t.common.clear}</Button>} />
);

/** Row count and the Excel export of the report with the filters and sort on screen (PRD 4.9). */
function ReportHeader({ count, type, lp }: { count: number; type: "stock" | "movements" | "loans"; lp: ListState }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <p className="text-base text-muted-foreground" aria-live="polite">{t.reports.rows(count)}</p>
      <DownloadButton variant="outline" run={() => api.reports.export(type, lp.params)} label={t.common.exportExcel} busyLabel={t.common.exporting} />
    </div>
  );
}

/** From / To dates for the movement and loan reports. */
function DateRange({ lp }: { lp: ListState }) {
  return (
    <>
      <Field label={t.common.from} className="w-40">{(p) => <Input {...p} type="date" value={lp.filters.from} onChange={(e) => lp.set({ from: e.target.value })} />}</Field>
      <Field label={t.common.to} className="w-40">{(p) => <Input {...p} type="date" value={lp.filters.to} onChange={(e) => lp.set({ to: e.target.value })} />}</Field>
    </>
  );
}

function StockReport() {
  const lp = useListParams({ sort: "code:asc", filters: { categoryId: ALL, stockStatus: ALL } });
  const list = useGet<StockReportRow[]>("/reports/stock", lp.params);
  const categories = useGet<CategoryOption[]>("/categories", { status: "Active", pageSize: 500, sort: "name:asc" });
  const clear = () => clearTab(lp, ["categoryId", "stockStatus"]);
  const columns: Column<StockReportRow>[] = [
    { id: "code", header: t.reports.colCode, cell: (i) => <span className="tabular text-muted-foreground">{i.code}</span>, sortable: true },
    { id: "name", header: t.reports.colItem, cell: (i) => <Link href={`/items/view?id=${i.id}`} className="font-medium hover:text-link hover:underline">{i.name}</Link>, sortable: true },
    { id: "category", header: t.reports.colCategory, cell: (i) => i.categoryName, sortable: true, hideOnMobile: true },
    { id: "unit", header: t.reports.colUnit, cell: (i) => i.unit, hideOnMobile: true },
    { id: "stock", header: t.reports.colStock, cell: (i) => formatNumber(i.currentStock ?? 0), numeric: true, sortable: true },
    { id: "minimum", header: t.reports.colMinimum, cell: (i) => formatNumber(i.minimumStock ?? 0), numeric: true, sortable: true, hideOnMobile: true },
    { id: "status", header: t.reports.colStatus, cell: (i) => <StockBadge status={i.stockStatus} />, sortable: true },
  ];
  return (
    <>
      <FilterBar dirty={lp.dirty} onClear={clear}>
        <SearchBox value={lp.search} onChange={lp.setSearch} placeholder={t.reports.searchStock} />
        <SelectField className="w-48" aria-label={t.reports.colCategory} value={lp.filters.categoryId} onChange={(v) => lp.set({ categoryId: v })} options={[{ value: ALL, label: t.items.allCategories }, ...(categories.data ?? []).map((c) => ({ value: String(c.id), label: c.name }))]} />
        <SelectField className="w-52" aria-label={t.reports.colStatus} value={lp.filters.stockStatus} onChange={(v) => lp.set({ stockStatus: v })} options={[{ value: ALL, label: t.items.allStockStatus }, ...(["Safe", "Low", "Out"] as const).map((s) => ({ value: s, label: t.status.stockAdmin[s] }))]} />
      </FilterBar>
      <LoadGate load={list}>
        <ReportHeader count={list.meta?.total ?? 0} type="stock" lp={lp} />
        <DataTable caption={t.reports.stockCaption} {...tableProps(list, lp)} columns={columns} rowKey={(i) => i.id} rowLabel={(i) => i.name} empty={<NoRows onClear={clear} />} />
      </LoadGate>
    </>
  );
}

function MovementsReport() {
  const lp = useListParams({ sort: "date:desc", filters: { type: ALL, from: "", to: "" } });
  const list = useGet<MovementRow[]>("/reports/movements", lp.params);
  const clear = () => clearTab(lp, ["type", "from", "to"]);
  const columns: Column<MovementRow>[] = [
    { id: "date", header: t.reports.colDate, cell: (m) => <span className="tabular">{formatDate(m.date)}</span>, sortable: true },
    { id: "item", header: t.reports.colItem, cell: (m) => <span className="font-medium">{m.itemName}</span>, sortable: true },
    { id: "type", header: t.reports.colType, cell: (m) => <TxTypeBadge type={m.type} />, sortable: true },
    { id: "change", header: t.reports.colChange, cell: (m) => <span className={m.quantityChange < 0 ? "text-danger-icon" : "text-success-icon"}>{m.quantityChange > 0 ? "+" : ""}{formatNumber(m.quantityChange)}</span>, numeric: true, sortable: true },
    { id: "balance", header: t.reports.colBalance, cell: (m) => formatNumber(m.balanceAfter), numeric: true, sortable: true },
    { id: "user", header: t.reports.colUser, cell: (m) => m.userName, sortable: true, hideOnMobile: true },
    { id: "ref", header: t.reports.colRef, cell: (m) => <Link href={`/stock/view?id=${m.txId}`} className="text-link hover:underline">{m.number}</Link>, sortable: true },
  ];
  return (
    <>
      <FilterBar dirty={lp.dirty} onClear={clear}>
        <SearchBox value={lp.search} onChange={lp.setSearch} placeholder={t.reports.searchMovements} />
        <SelectField className="w-48" aria-label={t.reports.colType} value={lp.filters.type} onChange={(v) => lp.set({ type: v })}
          options={[{ value: ALL, label: t.stock.allTypes }, ...(Object.keys(t.status.txType) as (keyof typeof t.status.txType)[]).map((k) => ({ value: k, label: t.status.txType[k] }))]} />
        <DateRange lp={lp} />
      </FilterBar>
      <LoadGate load={list}>
        <ReportHeader count={list.meta?.total ?? 0} type="movements" lp={lp} />
        <DataTable caption={t.reports.movementsCaption} {...tableProps(list, lp)} columns={columns} rowKey={(m) => m.key} rowLabel={(m) => `${m.number} ${m.itemName}`} empty={<NoRows onClear={clear} />} />
      </LoadGate>
    </>
  );
}

function LoansReport() {
  const lp = useListParams({ sort: "number:desc", filters: { status: ALL, from: "", to: "" } });
  const list = useGet<LoanReportRow[]>("/reports/loans", lp.params);
  const clear = () => clearTab(lp, ["status", "from", "to"]);
  const columns: Column<LoanReportRow>[] = [
    { id: "number", header: t.reports.colLoan, cell: (l) => <Link href={`/loans/view?id=${l.id}`} className="font-medium text-link hover:underline">{l.number}</Link>, sortable: true },
    { id: "borrower", header: t.reports.colBorrower, cell: (l) => l.borrowerName, sortable: true },
    { id: "items", header: t.loans.colItems, cell: (l) => <span className="line-clamp-1 max-w-64 whitespace-normal">{l.summary}</span>, hideOnMobile: true },
    { id: "loanDate", header: t.reports.colLoanDate, cell: (l) => <span className="tabular">{formatDate(l.loanDate)}</span>, sortable: true, hideOnMobile: true },
    { id: "expected", header: t.reports.colExpected, cell: (l) => <span className="tabular">{formatDate(l.expectedReturnDate)}</span>, sortable: true },
    { id: "returned", header: t.reports.colReturned, cell: (l) => <span className="tabular">{formatDate(l.returnedAt)}</span>, sortable: true, hideOnMobile: true },
    { id: "status", header: t.reports.colStatus, cell: (l) => <LoanBadge status={l.status} />, sortable: true },
  ];
  return (
    <>
      <FilterBar dirty={lp.dirty} onClear={clear}>
        <SearchBox value={lp.search} onChange={lp.setSearch} placeholder={t.reports.searchLoans} />
        <SelectField className="w-52" aria-label={t.reports.colStatus} value={lp.filters.status} onChange={(v) => lp.set({ status: v })}
          options={[{ value: ALL, label: t.reports.allLoanStatuses }, ...(Object.keys(t.status.loan) as (keyof typeof t.status.loan)[]).map((k) => ({ value: k, label: t.status.loan[k] }))]} />
        <DateRange lp={lp} />
      </FilterBar>
      <LoadGate load={list}>
        <ReportHeader count={list.meta?.total ?? 0} type="loans" lp={lp} />
        <p className="mb-3 text-sm text-muted-foreground">{t.reports.overdueHighlight}</p>
        <DataTable caption={t.reports.loansCaption} {...tableProps(list, lp)} columns={columns} rowKey={(l) => l.id} rowLabel={(l) => l.number} empty={<NoRows onClear={clear} />} />
      </LoadGate>
    </>
  );
}

const TABS = ["stock", "movements", "loans"] as const;

export default function ReportsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const tab = TABS.find((x) => x === sp.get("tab")) ?? "stock";
  // Each report has its own search, sort and filters, so switching tabs starts a fresh URL.
  const open = (value: unknown) => router.replace(`${pathname}?tab=${String(value)}`, { scroll: false });
  return (
    <>
      <PageHeader title={t.reports.title} description={t.reports.description} />
      <Tabs value={tab} onValueChange={open}>
        <TabsList variant="line" className="mb-4 w-full justify-start overflow-x-auto">
          <TabsTrigger value="stock" className="h-10 flex-none px-4 text-base">{t.reports.tabStock}</TabsTrigger>
          <TabsTrigger value="movements" className="h-10 flex-none px-4 text-base">{t.reports.tabMovements}</TabsTrigger>
          <TabsTrigger value="loans" className="h-10 flex-none px-4 text-base">{t.reports.tabLoans}</TabsTrigger>
        </TabsList>
        <TabsContent value="stock">{tab === "stock" && <StockReport />}</TabsContent>
        <TabsContent value="movements">{tab === "movements" && <MovementsReport />}</TabsContent>
        <TabsContent value="loans">{tab === "loans" && <LoansReport />}</TabsContent>
      </Tabs>
    </>
  );
}
