"use client";

import { useMemo, useState } from "react";
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
import { usePageLoad } from "@/hooks/use-page-load";
import { formatIDR, formatNumber, monthKey, monthLabel, today } from "@/lib/format";
import { useStore } from "@/lib/mock/store";
import { t } from "@/lib/strings";

const firstDayMonthsBack = (n: number): string => {
  const [y, m] = today().split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 - n, 1));
  return d.toISOString().slice(0, 10);
};

const monthsBetween = (from: string, to: string): string[] => {
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    if (++m > 12) { m = 1; y++; }
  }
  return out;
};

export default function ExpensesPage() {
  const { db } = useStore();
  const load = usePageLoad("expenses");
  const monthStart = () => `${monthKey(today())}-01`;
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);

  const error = !from || !to ? "" : to < from ? t.expenses.rangeInvalid : monthsBetween(monthKey(from), monthKey(to)).length > 12 ? t.expenses.rangeTooLong : "";

  const { rows, total, count } = useMemo(() => {
    if (error || !from || !to) return { rows: [], total: 0, count: 0 };
    // Formula (PRD 4.7): sum of line totals of posted, non-voided IN transactions in the period.
    const ins = db.transactions.filter((x) => x.type === "IN" && x.status === "Posted" && x.date >= from && x.date <= to);
    const rows = monthsBetween(monthKey(from), monthKey(to)).map((k) => {
      const inMonth = ins.filter((x) => monthKey(x.date) === k);
      return { key: k, count: inMonth.length, value: inMonth.reduce((n, x) => n + x.lines.reduce((m, l) => m + (l.total ?? 0), 0), 0) };
    });
    return { rows, total: rows.reduce((n, r) => n + r.value, 0), count: ins.length };
  }, [db.transactions, from, to, error]);

  return (
    <>
      <PageHeader title={t.expenses.title} description={t.expenses.description} />
      <LoadGate load={load} skeleton={<CardsSkeleton />}>
        <div className="mb-6 flex flex-wrap items-end gap-3">
          <Field label={t.expenses.from} className="w-44">{(p) => <Input {...p} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
          <Field label={t.expenses.to} className="w-44">{(p) => <Input {...p} type="date" value={to} onChange={(e) => setTo(e.target.value)} />}</Field>
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
                      <TableRow key={r.key}>
                        <TableCell className="font-medium">{monthLabel(r.key)}</TableCell>
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
