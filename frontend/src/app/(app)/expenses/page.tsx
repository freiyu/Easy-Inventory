"use client";

import { useState } from "react";
import Link from "next/link";
import { Receipt, ShoppingCart } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Field } from "@/components/shared/form-field";
import { KpiCard } from "@/components/shared/kpi-card";
import { PageHeader } from "@/components/shared/page-header";
import { CardsSkeleton, EmptyState, LoadGate } from "@/components/shared/states";
import { useGet } from "@/lib/api";
import type { ExpenseSummary } from "@/lib/api/admin";
import { formatIDR, formatNumber, monthKey, monthLabel, today } from "@/lib/format";
import { t } from "@/lib/strings";

const firstDayMonthsBack = (n: number): string => {
  const [y, m] = today().split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 - n, 1));
  return d.toISOString().slice(0, 10);
};

// Friendly check before asking; the server repeats it (PRD 6.5).
const rangeError = (from: string, to: string): string => {
  if (!from || !to) return "";
  if (to < from) return t.expenses.rangeInvalid;
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm) >= 12 ? t.expenses.rangeTooLong : "";
};

export default function ExpensesPage() {
  const monthStart = () => `${monthKey(today())}-01`;
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);

  const error = rangeError(from, to);
  // Total and month rows are computed by the server (PRD 4.7).
  const load = useGet<ExpenseSummary>(error || !from || !to ? null : "/expenses/summary", { from, to });
  const { months: rows = [], total = 0, count = 0 } = load.data ?? {};

  return (
    <>
      <PageHeader title={t.expenses.title} description={t.expenses.description} />
      <LoadGate load={error ? { status: "ready", retry: load.retry } : load} skeleton={<CardsSkeleton />}>
        <div className="mb-6 flex flex-wrap items-end gap-3">
          <Field label={t.common.from} className="w-44">{(p) => <Input {...p} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
          <Field label={t.common.to} className="w-44">{(p) => <Input {...p} type="date" value={to} onChange={(e) => setTo(e.target.value)} />}</Field>
          <Button variant="outline" onClick={() => { setFrom(monthStart()); setTo(today()); }}>{t.expenses.thisMonth}</Button>
          <Button variant="outline" onClick={() => { setFrom(firstDayMonthsBack(11)); setTo(today()); }}>{t.expenses.last12}</Button>
        </div>
        {error && <p role="alert" className="mb-6 rounded-lg bg-danger-soft px-4 py-3 text-base font-medium text-foreground">{error}</p>}
        {!error && (
          <div className="flex flex-col gap-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <KpiCard label={t.expenses.totalValue} value={formatIDR(total)} caption={t.expenses.totalCaption} icon={Receipt} />
              <KpiCard label={t.expenses.purchaseCount} value={formatNumber(count)} caption={t.expenses.purchaseCaption} icon={ShoppingCart} />
            </div>
            {count === 0 ? (
              <EmptyState title={t.expenses.emptyTitle} body={t.expenses.emptyBody} action={<Link href="/stock/in" className={buttonVariants()}>{t.expenses.emptyAction}</Link>} />
            ) : (
              <Card className="gap-0 overflow-hidden p-0">
                <h2 className="px-5 py-4 text-lg font-semibold">{t.expenses.byMonth}</h2>
                <Table>
                  <caption className="sr-only">{t.expenses.caption}</caption>
                  <TableHeader>
                    <TableRow className="hover:bg-muted">
                      <TableHead>{t.expenses.colMonth}</TableHead>
                      <TableHead className="text-right">{t.expenses.colPurchases}</TableHead>
                      <TableHead className="text-right">{t.expenses.colValue}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.month}>
                        <TableCell className="font-medium">{monthLabel(r.month)}</TableCell>
                        <TableCell className="tabular text-right">{r.count}</TableCell>
                        <TableCell className="tabular text-right">{formatIDR(r.value)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell className="font-semibold">{t.common.total}</TableCell>
                      <TableCell className="tabular text-right font-semibold">{count}</TableCell>
                      <TableCell className="tabular text-right font-semibold">{formatIDR(total)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </Card>
            )}
          </div>
        )}
      </LoadGate>
    </>
  );
}
