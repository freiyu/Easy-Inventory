"use client";

import Link from "next/link";
import { AlertTriangle, Boxes, HandHelping, Package, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KpiCard } from "@/components/shared/kpi-card";
import { PageHeader } from "@/components/shared/page-header";
import { LoanBadge, StockBadge } from "@/components/shared/status-badge";
import { CardsSkeleton, EmptyState, LoadGate } from "@/components/shared/states";
import { usePageLoad } from "@/hooks/use-page-load";
import { formatDate, formatNumber } from "@/lib/format";
import { useCurrentUser, useStore } from "@/lib/mock/store";
import { categoryName, loanCounts, lineSummary, stockCounts, visibleLoans } from "@/lib/queries";
import { availableForLoan, daysOverdue, loanDisplayStatus, stockStatus } from "@/lib/rules";
import { t } from "@/lib/strings";

export default function DashboardPage() {
  const user = useCurrentUser();
  const load = usePageLoad("dashboard");
  if (!user) return null;
  return (
    <>
      <PageHeader
        title={t.dashboard.title}
        description={user.role === "Admin" ? t.dashboard.adminDesc : t.dashboard.staffDesc(user.name.split(" ")[0])}
        actions={
          user.role === "Admin" ? (
            <>
              <Button variant="outline" onClick={() => toast.info(t.common.exportMocked)}>{t.common.exportExcel}</Button>
              <Link href="/loans/new" className={buttonVariants({ variant: "outline" })}>{t.dashboard.newLoan}</Link>
              <Link href="/items/new" className={buttonVariants({ variant: "outline" })}>{t.dashboard.addItem}</Link>
              <Link href="/stock/in" className={buttonVariants()}>{t.dashboard.incoming}</Link>
            </>
          ) : (
            <Link href="/loans/new" className={buttonVariants()}>{t.dashboard.newRequest}</Link>
          )
        }
      />
      <LoadGate load={load} skeleton={<CardsSkeleton />}>
        {user.role === "Admin" ? <AdminDashboard /> : <StaffDashboard userId={user.id} />}
      </LoadGate>
    </>
  );
}

function AdminDashboard() {
  const { db } = useStore();
  const stock = stockCounts(db);
  const loans = loanCounts(db);
  const active = db.items.filter((i) => i.status === "Active");
  const attention = active
    .filter((i) => stockStatus(i.currentStock, i.minimumStock) !== "Safe")
    .sort((a, b) => a.currentStock - b.currentStock)
    .slice(0, 6);
  const overdue = db.loans.filter((l) => loanDisplayStatus(l) === "Overdue");

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label={t.dashboard.kpiItemTypes} value={formatNumber(active.length)} caption={t.dashboard.kpiItemTypesCaption} icon={Package} />
        <KpiCard label={t.dashboard.kpiStock} value={formatNumber(active.reduce((n, i) => n + i.currentStock, 0))} caption={t.dashboard.kpiStockCaption} icon={Boxes} />
        <KpiCard label={t.dashboard.kpiLow} value={formatNumber(stock.attention)} caption={t.dashboard.kpiLowCaption(stock.Low, stock.Out)} icon={TriangleAlert} />
        <KpiCard label={t.dashboard.kpiLoans} value={formatNumber(loans.active)} caption={t.dashboard.kpiLoansCaption(loans.overdue)} icon={HandHelping} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="gap-0 overflow-hidden p-0 lg:col-span-2">
          <div className="flex items-center justify-between px-5 py-4">
            <h2 className="text-lg font-semibold">{t.dashboard.needsAttention}</h2>
            <Link href="/items" className="text-base font-medium text-link hover:underline">{t.dashboard.viewAllItems}</Link>
          </div>
          {attention.length === 0 ? (
            <p className="border-t px-5 py-8 text-center text-base text-muted-foreground">{t.dashboard.allGood}</p>
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
                    <TableCell className="font-medium">
                      <Link href={`/items/view?id=${i.id}`} className="hover:text-link hover:underline">{i.name}</Link>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{categoryName(db, i.categoryId)}</TableCell>
                    <TableCell className="tabular text-right">{formatNumber(i.currentStock)}</TableCell>
                    <TableCell className="tabular hidden text-right sm:table-cell">{formatNumber(i.minimumStock)}</TableCell>
                    <TableCell><StockBadge status={stockStatus(i.currentStock, i.minimumStock)} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        <div className="flex flex-col gap-6">
          <Card className="gap-3">
            <h2 className="px-5 text-lg font-semibold">{t.dashboard.stockStatus}</h2>
            <ul className="flex flex-col gap-2 px-5">
              {(["Safe", "Low", "Out"] as const).map((s) => (
                <li key={s} className="flex items-center justify-between">
                  <StockBadge status={s} />
                  <span className="tabular text-base font-semibold">{stock[s]}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="gap-3">
            <div className="flex items-center justify-between px-5">
              <h2 className="text-lg font-semibold">{t.dashboard.loansCard}</h2>
              <Link href="/loans" className="text-base font-medium text-link hover:underline">{t.dashboard.viewAllLoans}</Link>
            </div>
            <dl className="flex flex-col gap-1.5 px-5 text-base">
              {[
                [t.dashboard.pendingApproval, loans.pending],
                [t.dashboard.currentlyBorrowed, loans.borrowed],
                [t.dashboard.overdue, loans.overdue],
              ].map(([label, n]) => (
                <div key={label} className="flex justify-between"><dt className="text-muted-foreground">{label}</dt><dd className="tabular font-semibold">{n}</dd></div>
              ))}
            </dl>
            <ul className="flex flex-col gap-2 border-t px-5 pt-3">
              {overdue.length === 0 && <li className="text-sm text-muted-foreground">{t.dashboard.noOverdue}</li>}
              {overdue.slice(0, 3).map((l) => (
                <li key={l.id} className="flex items-start justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <Link href={`/loans/view?id=${l.id}`} className="font-medium text-link hover:underline">{l.number}</Link>
                    <span className="block truncate text-muted-foreground">{lineSummary(db, l)}</span>
                  </span>
                  <span className="shrink-0 font-medium text-danger-icon">{t.dashboard.daysOverdue(daysOverdue(l))}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StaffDashboard({ userId }: { userId: number }) {
  const { db } = useStore();
  const user = db.users.find((u) => u.id === userId)!;
  const mine = visibleLoans(db, user);
  const activeLoans = mine.filter((l) => ["Pending Approval", "Approved", "Borrowed"].includes(l.status));
  const overdue = mine.filter((l) => loanDisplayStatus(l) === "Overdue");
  const activeItems = db.items.filter((i) => i.status === "Active");
  const requestable = activeItems.filter((i) => availableForLoan(i, db.loans) > 0).length;

  return (
    <div className="flex flex-col gap-6">
      {overdue.length > 0 && (
        <div role="alert" className="flex items-start gap-3 rounded-xl bg-danger-soft px-4 py-3 text-base text-foreground">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger-icon" aria-hidden="true" />
          <p>{t.dashboard.overdueAlert(overdue[0].number, lineSummary(db, overdue[0]), formatDate(overdue[0].expectedReturnDate), daysOverdue(overdue[0]))}</p>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <KpiCard label={t.dashboard.myLoansKpi} value={activeLoans.length} caption={t.dashboard.myLoansCaption(overdue.length)} icon={HandHelping} />
        <KpiCard label={t.dashboard.availableKpi} value={requestable} caption={t.dashboard.availableCaption(activeItems.length)} icon={Package} />
      </div>
      {activeLoans.length === 0 ? (
        <EmptyState title={t.dashboard.noActiveLoans} body={t.dashboard.noActiveLoansBody} action={<Link href="/loans/new" className={buttonVariants()}>{t.dashboard.newRequest}</Link>} />
      ) : (
        <Card className="gap-0 overflow-hidden p-0">
          <div className="flex items-center justify-between px-5 py-4">
            <h2 className="text-lg font-semibold">{t.dashboard.myActiveLoans}</h2>
            <Link href="/loans" className="text-base font-medium text-link hover:underline">{t.dashboard.viewMyLoans}</Link>
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
                  <TableCell><Link href={`/loans/view?id=${l.id}`} className="font-medium text-link hover:underline">{l.number}</Link></TableCell>
                  <TableCell className="max-w-64 truncate">{lineSummary(db, l)}</TableCell>
                  <TableCell className="tabular hidden sm:table-cell">{formatDate(l.expectedReturnDate)}</TableCell>
                  <TableCell><LoanBadge status={loanDisplayStatus(l)} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
