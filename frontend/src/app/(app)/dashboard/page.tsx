"use client";

import Link from "next/link";
import { ClipboardCheck, HandHelping, Package, PackageX, TriangleAlert } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { DownloadButton } from "@/components/shared/download-button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiCard } from "@/components/shared/kpi-card";
import { PageHeader } from "@/components/shared/page-header";
import { LoanBadge, StockBadge } from "@/components/shared/status-badge";
import { EmptyState, LoadGate, TableSkeleton } from "@/components/shared/states";
import { api, useCurrentUser, useGet } from "@/lib/api";
import type { AdminDashboard, DashboardSummary, StaffDashboard } from "@/lib/api/admin";
import { formatDate, formatNumber } from "@/lib/format";
import { t } from "@/lib/strings";

// The needs-attention table shows 6 rows so the Admin dashboard fits one screen (PRD_REDESIGN.md 10.3).
const ATTENTION_ROWS = 6;

export default function DashboardPage() {
  const user = useCurrentUser();
  const load = useGet<DashboardSummary>("/dashboard/summary");
  if (!user) return null;
  return (
    <>
      <PageHeader
        title={t.dashboard.title}
        description={user.role === "Admin" ? t.dashboard.adminDesc : t.dashboard.staffDesc(user.name.split(" ")[0])}
        actions={
          user.role === "Admin" ? (
            <>
              <DownloadButton variant="outline" run={() => api.items.export({})} label={t.common.exportExcel} busyLabel={t.common.exporting} />
              <Link href="/loans/new" className={buttonVariants({ variant: "outline" })}>{t.dashboard.newLoan}</Link>
              <Link href="/items/new" className={buttonVariants({ variant: "outline" })}>{t.dashboard.addItem}</Link>
              <Link href="/stock/in" className={buttonVariants()}>{t.dashboard.incoming}</Link>
            </>
          ) : (
            <Link href="/loans/new" className={buttonVariants()}>{t.dashboard.newRequest}</Link>
          )
        }
      />
      <LoadGate load={load} skeleton={<DashboardSkeleton />}>
        {load.data?.admin && <AdminView data={load.data.admin} />}
        {load.data?.staff && <StaffView data={load.data.staff} />}
      </LoadGate>
    </>
  );
}

function AdminView({ data }: { data: AdminDashboard }) {
  const { stock } = data;
  const attention = data.needsAttention.slice(0, ATTENTION_ROWS);
  const total = stock.Safe + stock.Low + stock.Out;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label={t.dashboard.kpiTotal} value={formatNumber(total)} caption={t.dashboard.kpiTotalCaption} icon={Package} />
        <KpiCard
          label={t.dashboard.kpiStock}
          icon={PackageX}
          value={
            <span className="flex gap-6">
              <span className="inline-flex flex-col">
                <span className="text-danger-icon">{formatNumber(stock.Out)}</span>
                <span className="text-(length:--text-table) font-(weight:--weight-regular) text-muted-foreground">{t.dashboard.kpiStockOut}</span>
              </span>
              <span className="inline-flex flex-col">
                <span className="text-warning-icon">{formatNumber(stock.Low)}</span>
                <span className="text-(length:--text-table) font-(weight:--weight-regular) text-muted-foreground">{t.dashboard.kpiStockLow}</span>
              </span>
            </span>
          }
        />
        <KpiCard label={t.dashboard.kpiApprovals} value={formatNumber(data.pendingApprovals)} caption={t.dashboard.kpiApprovalsCaption} icon={ClipboardCheck} />
      </div>

      <Card className="gap-0 overflow-hidden p-0">
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="text-(length:--text-section) leading-tight font-(weight:--weight-strong)">{t.dashboard.needsAttention}</h2>
          <Link href="/items" className="text-(length:--text-label) font-(weight:--weight-strong) text-link hover:underline">{t.dashboard.viewAllItems}</Link>
        </div>
        {attention.length === 0 ? (
          <p className="border-t px-4 py-8 text-center text-(length:--text-body) text-muted-foreground">{t.dashboard.allGood}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-muted">
                <TableHead>{t.dashboard.colItem}</TableHead>
                <TableHead className="hidden sm:table-cell">{t.dashboard.colCategory}</TableHead>
                <TableHead className="text-right">{t.dashboard.colStock}</TableHead>
                <TableHead className="hidden text-right sm:table-cell">{t.dashboard.colMinimum}</TableHead>
                <TableHead>{t.dashboard.colStatus}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {attention.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-(weight:--weight-strong)">
                    <Link href={`/items/view?id=${i.id}`} className="hover:text-link hover:underline">{i.name}</Link>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{i.categoryName}</TableCell>
                  <TableCell className="tabular text-right">{formatNumber(i.currentStock)}</TableCell>
                  <TableCell className="tabular hidden text-right sm:table-cell">{formatNumber(i.minimumStock)}</TableCell>
                  <TableCell><StockBadge status={i.stockStatus} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function StaffView({ data }: { data: StaffDashboard }) {
  const { activeLoans, overdueFirst } = data;

  return (
    <div className="flex flex-col gap-6">
      {overdueFirst && (
        <div role="alert" className="flex items-start gap-3 rounded-xl bg-danger-soft px-4 py-3 text-(length:--text-body) text-foreground">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger-icon" aria-hidden="true" />
          <p>{t.dashboard.overdueAlert(overdueFirst.number, overdueFirst.summary, formatDate(overdueFirst.expectedReturnDate), overdueFirst.daysOverdue)}</p>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <KpiCard label={t.dashboard.myLoansKpi} value={activeLoans.length} caption={t.dashboard.myLoansCaption(data.overdueCount)} icon={HandHelping} />
        <KpiCard label={t.dashboard.availableKpi} value={data.requestable} caption={t.dashboard.availableCaption(data.activeItems)} icon={Package} />
      </div>
      {activeLoans.length === 0 ? (
        <EmptyState title={t.dashboard.noActiveLoans} body={t.dashboard.noActiveLoansBody} action={<Link href="/loans/new" className={buttonVariants()}>{t.dashboard.newRequest}</Link>} />
      ) : (
        <Card className="gap-0 overflow-hidden p-0">
          <div className="flex items-center justify-between px-4 py-3">
            <h2 className="text-(length:--text-section) leading-tight font-(weight:--weight-strong)">{t.dashboard.myActiveLoans}</h2>
            <Link href="/loans" className="text-(length:--text-label) font-(weight:--weight-strong) text-link hover:underline">{t.dashboard.viewMyLoans}</Link>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-muted">
                <TableHead>{t.dashboard.colLoan}</TableHead>
                <TableHead>{t.dashboard.colItems}</TableHead>
                <TableHead className="hidden sm:table-cell">{t.dashboard.colDue}</TableHead>
                <TableHead>{t.dashboard.colStatus}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeLoans.map((l) => (
                <TableRow key={l.id}>
                  <TableCell><Link href={`/loans/view?id=${l.id}`} className="font-(weight:--weight-strong) text-link hover:underline">{l.number}</Link></TableCell>
                  <TableCell className="max-w-64 truncate">{l.summary}</TableCell>
                  <TableCell className="tabular hidden sm:table-cell">{formatDate(l.expectedReturnDate)}</TableCell>
                  <TableCell><LoanBadge status={l.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-label={t.common.loading}>
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-28" />)}
      </div>
      <TableSkeleton rows={ATTENTION_ROWS} />
    </div>
  );
}
