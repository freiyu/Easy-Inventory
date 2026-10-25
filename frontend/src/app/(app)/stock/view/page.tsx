"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReasonDialog } from "@/components/shared/dialogs";
import { PageHeader } from "@/components/shared/page-header";
import { LoadGate, RecordNotFound, TableSkeleton } from "@/components/shared/states";
import { TxStatusBadge, TxTypeBadge } from "@/components/shared/status-badge";
import { useQueryId } from "@/hooks/use-query-id";
import { formatDate, formatDateTime, formatIDR, formatNumber } from "@/lib/format";
import { api, useGet } from "@/lib/api";
import type { StockTxDto } from "@/lib/api/stock";
import { t } from "@/lib/strings";

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-base font-medium">{children}</dd>
    </div>
  );
}

function TransactionView() {
  const id = useQueryId();
  const load = useGet<StockTxDto>(id ? `/stock/transactions/${id}` : null);
  if (load.errorStatus === 404) return <RecordNotFound backHref="/stock" backLabel={t.stock.notFoundBack} />;
  return <LoadGate load={load} skeleton={<TableSkeleton />}>{load.data && <TransactionDetail tx={load.data} />}</LoadGate>;
}

function TransactionDetail({ tx }: { tx: StockTxDto }) {
  const [voiding, setVoiding] = useState(false);
  const isIn = tx.type === "IN";

  return (
    <>
      <PageHeader
        title={t.stock.detailTitle(tx.number)}
        crumbs={[{ label: t.nav.stock, href: "/stock" }, { label: tx.number }]}
        badge={<><TxTypeBadge type={tx.type} /><TxStatusBadge status={tx.status} /></>}
        actions={tx.allowedActions.includes("void") && <Button variant="destructive" onClick={() => setVoiding(true)}>{t.stock.void}</Button>}
      />
      <Card className="gap-4">
        <h2 className="px-5 text-lg font-semibold">{t.stock.detailsCard}</h2>
        <dl className="grid gap-x-6 gap-y-4 px-5 sm:grid-cols-2 lg:grid-cols-3">
          <Detail label={t.fields.date}>{formatDate(tx.date)}</Detail>
          <Detail label={t.stock.colUser}>{tx.userName}</Detail>
          <Detail label={t.stock.colParty}>{tx.party || "-"}</Detail>
          <Detail label={t.stock.noteField}>{tx.notes || "-"}</Detail>
          <Detail label={t.stock.recordedAt}>{formatDateTime(tx.createdAt)}</Detail>
          {tx.reason && <Detail label={t.stock.reasonLabel}>{tx.reason}</Detail>}
          {tx.voidedById && <Detail label={t.stock.voidedBy}><Link href={`/stock/view?id=${tx.voidedById}`} className="text-link hover:underline">{tx.voidedByNumber}</Link></Detail>}
          {tx.reversalOfId && <Detail label={t.stock.reversalOf}><Link href={`/stock/view?id=${tx.reversalOfId}`} className="text-link hover:underline">{tx.reversalOfNumber}</Link></Detail>}
          {tx.loanId && <Detail label={t.stock.linkedLoan}><Link href={`/loans/view?id=${tx.loanId}`} className="text-link hover:underline">{tx.loanNumber}</Link></Detail>}
        </dl>
      </Card>

      <Card className="mt-6 gap-0 overflow-hidden p-0">
        <h2 className="px-5 py-4 text-lg font-semibold">{t.stock.linesCard}</h2>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-muted">
              <TableHead>{t.stock.colItem}</TableHead>
              <TableHead className="text-right">{t.stock.colChange}</TableHead>
              <TableHead className="text-right">{t.stock.colBalance}</TableHead>
              {isIn && <TableHead className="text-right">{t.stock.colUnitPrice}</TableHead>}
              {isIn && <TableHead className="text-right">{t.stock.colLineTotal}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {tx.lines.map((l) => (
              <TableRow key={l.itemId}>
                <TableCell className="font-medium"><Link href={`/items/view?id=${l.itemId}`} className="hover:text-link hover:underline">{l.itemName}</Link></TableCell>
                <TableCell className={`tabular text-right font-medium ${l.quantityChange < 0 ? "text-danger-icon" : "text-success-icon"}`}>{l.quantityChange > 0 ? "+" : ""}{formatNumber(l.quantityChange)}</TableCell>
                <TableCell className="tabular text-right">{formatNumber(l.balanceAfter)}</TableCell>
                {isIn && <TableCell className="tabular text-right">{formatIDR(l.unitPrice ?? 0)}</TableCell>}
                {isIn && <TableCell className="tabular text-right">{formatIDR(l.total ?? 0)}</TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {voiding && (
        <ReasonDialog
          open
          onOpenChange={(o) => !o && setVoiding(false)}
          title={t.stock.voidTitle(tx.number)}
          description={t.stock.voidBody}
          confirmLabel={t.stock.voidConfirm}
          onConfirm={async (reason) => {
            const r = await api.stock.void(tx.id, reason);
            if (r.success) toast.success(t.stock.voided);
            return r;
          }}
        />
      )}
    </>
  );
}

export default function TransactionViewPage() {
  return <Suspense fallback={<TableSkeleton />}><TransactionView /></Suspense>;
}
