"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Barcode } from "@/components/shared/barcode";
import { ItemPhoto } from "@/components/items/item-photo";
import { ConfirmDialog } from "@/components/shared/dialogs";
import { PageHeader } from "@/components/shared/page-header";
import { ActiveBadge, StockBadge, TxTypeBadge } from "@/components/shared/status-badge";
import { LoadGate, RecordNotFound, TableSkeleton } from "@/components/shared/states";
import { useQueryId } from "@/hooks/use-query-id";
import { api, useCurrentUser, useGet } from "@/lib/api";
import type { ItemDto } from "@/lib/api/master";
import { downloadBarcodePng } from "@/lib/barcode-png";
import { formatDate, formatDateTime, formatIDR, formatNumber } from "@/lib/format";
import { t } from "@/lib/strings";
import type { Role } from "@/lib/types";

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-(length:--text-table) text-muted-foreground">{label}</dt>
      <dd className="text-(length:--text-body) font-(weight:--weight-strong)">{children}</dd>
    </div>
  );
}

function ItemView() {
  const id = useQueryId();
  const user = useCurrentUser();
  const load = useGet<ItemDto>(id ? `/items/${id}` : null);
  if (!user) return null;
  if (load.errorStatus === 404) return <RecordNotFound backHref="/items" backLabel={t.items.notFoundBack} />;
  return <LoadGate load={load} skeleton={<TableSkeleton />}>{load.data && <ItemDetail item={load.data} role={user.role} />}</LoadGate>;
}

function ItemDetail({ item, role }: { item: ItemDto; role: Role }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<"toggle" | "delete" | null>(null);
  const isAdmin = role === "Admin";
  const lines = item.movements ?? [];
  const reserved = item.reserved ?? 0;
  const active = item.status === "Active";
  const barcodeValue = isAdmin ? item.code : item.barcode;

  return (
    <>
      <PageHeader
        title={item.name}
        crumbs={[{ label: t.nav.items, href: "/items" }, { label: isAdmin ? (item.code ?? item.name) : item.name }]}
        badge={<><StockBadge status={item.stockStatus} role={role} />{isAdmin && !active && <ActiveBadge status="Inactive" />}</>}
        description={isAdmin ? `${item.code} · ${item.categoryName}` : item.categoryName}
        actions={isAdmin && (
          <>
            <Link href={`/items/edit?id=${item.id}`} className={buttonVariants({ variant: "outline" })}>{t.items.edit}</Link>
            <Button variant="outline" onClick={() => setConfirm("toggle")}>{active ? t.items.deactivate : t.items.activate}</Button>
            <Button variant="destructive" onClick={() => setConfirm("delete")}>{t.items.delete}</Button>
          </>
        )}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card size="sm" className="gap-4 lg:col-span-2">
          <h2 className="px-4 text-(length:--text-section) leading-tight font-(weight:--weight-strong)">{t.items.detailsCard}</h2>
          <div className="flex flex-col gap-4 px-4 sm:flex-row sm:items-start">
          <ItemPhoto id={item.id} name={item.name} version={item.photoVersion} emptyLabel={t.items.photoNone} className="sm:order-2" />
          <dl className="grid min-w-0 flex-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            <Detail label={t.fields.category}>{item.categoryName}</Detail>
            <Detail label={t.fields.subcategory}>{item.subcategoryName}</Detail>
            <Detail label={t.fields.unit}>{item.unit}</Detail>
            {isAdmin && (
              <>
                <Detail label={t.fields.preferredSupplier}>{item.supplierName ?? "-"}</Detail>
                <Detail label={t.items.lastPrice}>{formatIDR(item.lastPurchasePrice ?? 0)}</Detail>
                <Detail label={t.fields.location}>{item.location || "-"}</Detail>
                <Detail label={t.common.status}><ActiveBadge status={item.status} /></Detail>
                <Detail label={t.items.createdAt}>{item.createdAt ? formatDateTime(item.createdAt) : "-"}</Detail>
                <Detail label={t.items.updatedAt}>{item.updatedAt ? formatDateTime(item.updatedAt) : "-"}</Detail>
                {item.notes && <div className="sm:col-span-2"><Detail label={t.common.notes}>{item.notes}</Detail></div>}
              </>
            )}
          </dl>
          </div>
        </Card>

        <div className="flex flex-col gap-6">
        <Card size="sm" className="gap-4">
          <h2 className="px-4 text-(length:--text-section) leading-tight font-(weight:--weight-strong)">{t.items.stockCard}</h2>
          {isAdmin ? (
            <dl className="flex flex-col gap-3 px-4">
              <div>
                <dt className="text-(length:--text-table) text-muted-foreground">{t.items.currentStock}</dt>
                <dd className="tabular text-(length:--text-kpi) font-(weight:--weight-strong)">{formatNumber(item.currentStock ?? 0)} <span className="text-(length:--text-body) font-(weight:--weight-regular) text-muted-foreground">{item.unit}</span></dd>
              </div>
              <Detail label={t.items.minimumStock}>{formatNumber(item.minimumStock ?? 0)}</Detail>
              <Detail label={t.items.reserved}>{formatNumber(reserved)}</Detail>
              <Detail label={t.items.availableForLoan}>{formatNumber(item.availableForLoan)}</Detail>
            </dl>
          ) : (
            <p className="px-4 text-(length:--text-body) text-muted-foreground">{t.items.staffStockNote}</p>
          )}
        </Card>

        {barcodeValue && (
          <Card size="sm" className="print-label gap-3">
            <h2 className="px-4 text-(length:--text-section) leading-tight font-(weight:--weight-strong) print:hidden">{t.items.barcodeCard}</h2>
            <div className="flex flex-col items-start gap-3 px-4">
              <p className="hidden text-(length:--text-body) font-(weight:--weight-strong) print:block">{item.name}</p>
              {/* Staff scan the bars but never read the code: no printed code line for them. */}
              <Barcode value={barcodeValue} showText={isAdmin} label={`${t.items.barcodeCard}: ${item.name}`} className="w-full max-w-72" />
              <div className="flex flex-wrap gap-2 print:hidden">
                <Button variant="outline" onClick={() => window.print()}>{t.items.printLabel}</Button>
                {/* The file name uses the item name, never the code: Staff must not learn the code from it. */}
                <Button variant="outline" onClick={() => downloadBarcodePng(barcodeValue, `barcode-${item.name}.png`, isAdmin ? barcodeValue : undefined)}>{t.items.barcodeDownload}</Button>
              </div>
            </div>
          </Card>
        )}
        </div>
      </div>

      {isAdmin && (
        <Card size="sm" className="mt-6 gap-0 overflow-hidden p-0">
          <h2 className="px-4 py-4 text-(length:--text-section) leading-tight font-(weight:--weight-strong)">{t.items.movements}</h2>
          {lines.length === 0 ? (
            <p className="border-t px-4 py-8 text-center text-(length:--text-body) text-muted-foreground">{t.items.movementsEmpty}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-muted">
                  <TableHead>{t.items.colDate}</TableHead>
                  <TableHead>{t.items.colType}</TableHead>
                  <TableHead className="text-right">{t.items.colChange}</TableHead>
                  <TableHead className="text-right">{t.items.colBalance}</TableHead>
                  <TableHead>{t.items.colRef}</TableHead>
                  <TableHead className="hidden md:table-cell">{t.items.colUser}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((x) => (
                  <TableRow key={x.id}>
                    <TableCell className="tabular">{formatDate(x.date)}</TableCell>
                    <TableCell><TxTypeBadge type={x.type} /></TableCell>
                    <TableCell className={`tabular text-right font-(weight:--weight-strong) ${x.quantityChange < 0 ? "text-danger-icon" : "text-success-icon"}`}>
                      {x.quantityChange > 0 ? "+" : ""}{formatNumber(x.quantityChange)}
                    </TableCell>
                    <TableCell className="tabular text-right">{formatNumber(x.balanceAfter)}</TableCell>
                    <TableCell><Link href={`/stock/view?id=${x.id}`} className="text-link hover:underline">{x.number}</Link></TableCell>
                    <TableCell className="hidden md:table-cell">{x.userName}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      )}

      <ConfirmDialog
        open={confirm === "toggle"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={active ? t.items.deactivateTitle(item.name) : t.items.activateTitle(item.name)}
        description={active ? t.items.deactivateBody : t.items.activateBody}
        confirmLabel={active ? t.items.deactivate : t.items.activate}
        onConfirm={async () => {
          const r = await api.items.setStatus(item.id, active ? "deactivate" : "activate");
          if (r.success) toast.success(active ? t.items.deactivated : t.items.activated);
          return r;
        }}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t.items.deleteTitle(item.name)}
        description={t.items.deleteBody}
        confirmLabel={t.items.delete}
        destructive
        onConfirm={async () => {
          const r = await api.items.remove(item.id);
          if (r.success) { toast.success(t.items.deleted); router.replace("/items"); }
          return r;
        }}
      />
    </>
  );
}

export default function ItemViewPage() {
  return <Suspense fallback={<TableSkeleton />}><ItemView /></Suspense>;
}
