"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/shared/dialogs";
import { PageHeader } from "@/components/shared/page-header";
import { ActiveBadge, StockBadge, TxTypeBadge } from "@/components/shared/status-badge";
import { LoadGate, RecordNotFound, TableSkeleton } from "@/components/shared/states";
import { useQueryId } from "@/hooks/use-query-id";
import { api, useCurrentUser, useGet } from "@/lib/api";
import type { ItemDto } from "@/lib/api/master";
import { formatDate, formatDateTime, formatIDR, formatNumber } from "@/lib/format";
import { t } from "@/lib/strings";
import type { Role } from "@/lib/types";

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-base font-medium">{children}</dd>
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
        <Card className="gap-4 lg:col-span-2">
          <h2 className="px-5 text-lg font-semibold">{t.items.detailsCard}</h2>
          <dl className="grid gap-x-6 gap-y-4 px-5 sm:grid-cols-2">
            <Detail label={t.fields.category}>{item.categoryName}</Detail>
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
        </Card>

        <Card className="gap-4">
          <h2 className="px-5 text-lg font-semibold">{t.items.stockCard}</h2>
          {isAdmin ? (
            <dl className="flex flex-col gap-3 px-5">
              <div>
                <dt className="text-sm text-muted-foreground">{t.items.currentStock}</dt>
                <dd className="tabular text-3xl font-semibold">{formatNumber(item.currentStock ?? 0)} <span className="text-base font-normal text-muted-foreground">{item.unit}</span></dd>
              </div>
              <Detail label={t.items.minimumStock}>{formatNumber(item.minimumStock ?? 0)}</Detail>
              <Detail label={t.items.reserved}>{formatNumber(reserved)}</Detail>
              <Detail label={t.items.availableForLoan}>{formatNumber(item.availableForLoan)}</Detail>
            </dl>
          ) : (
            <p className="px-5 text-base text-muted-foreground">{t.items.staffStockNote}</p>
          )}
        </Card>
      </div>

      {isAdmin && (
        <Card className="mt-6 gap-0 overflow-hidden p-0">
          <h2 className="px-5 py-4 text-lg font-semibold">{t.items.movements}</h2>
          {lines.length === 0 ? (
            <p className="border-t px-5 py-8 text-center text-base text-muted-foreground">{t.items.movementsEmpty}</p>
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
                    <TableCell className={`tabular text-right font-medium ${x.quantityChange < 0 ? "text-danger-icon" : "text-success-icon"}`}>
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
