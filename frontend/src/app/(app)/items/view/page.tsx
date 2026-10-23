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
import { RecordNotFound, TableSkeleton } from "@/components/shared/states";
import { useQueryId } from "@/hooks/use-query-id";
import { formatDate, formatDateTime, formatIDR, formatNumber } from "@/lib/format";
import { api, useCurrentUser, useStore } from "@/lib/mock/store";
import { byId, categoryName, supplierName, userName } from "@/lib/queries";
import { availableForLoan, reservedQuantity, stockStatus } from "@/lib/rules";
import { t } from "@/lib/strings";

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
  const router = useRouter();
  const user = useCurrentUser();
  const { db } = useStore();
  const item = byId(db.items, id);
  const [confirm, setConfirm] = useState<"toggle" | "delete" | null>(null);
  if (!user) return null;
  const isAdmin = user.role === "Admin";
  if (!item || (!isAdmin && item.status !== "Active")) return <RecordNotFound backHref="/items" backLabel={t.items.notFoundBack} />;

  const status = stockStatus(item.currentStock, item.minimumStock);
  const reserved = reservedQuantity(db.loans, item.id);
  const lines = db.transactions
    .filter((x) => x.lines.some((l) => l.itemId === item.id))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 10);
  const active = item.status === "Active";

  return (
    <>
      <PageHeader
        title={item.name}
        crumbs={[{ label: t.nav.items, href: "/items" }, { label: isAdmin ? item.code : item.name }]}
        badge={<><StockBadge status={status} role={user.role} />{isAdmin && !active && <ActiveBadge status="Inactive" />}</>}
        description={isAdmin ? `${item.code} · ${categoryName(db, item.categoryId)}` : categoryName(db, item.categoryId)}
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
            <Detail label={t.fields.category}>{categoryName(db, item.categoryId)}</Detail>
            <Detail label={t.fields.unit}>{item.unit}</Detail>
            {isAdmin && (
              <>
                <Detail label={t.fields.preferredSupplier}>{supplierName(db, item.supplierId)}</Detail>
                <Detail label={t.items.lastPrice}>{formatIDR(item.lastPurchasePrice)}</Detail>
                <Detail label={t.fields.location}>{item.location || "-"}</Detail>
                <Detail label={t.common.status}><ActiveBadge status={item.status} /></Detail>
                <Detail label={t.items.createdAt}>{formatDateTime(item.createdAt)}</Detail>
                <Detail label={t.items.updatedAt}>{formatDateTime(item.updatedAt)}</Detail>
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
                <dd className="tabular text-3xl font-semibold">{formatNumber(item.currentStock)} <span className="text-base font-normal text-muted-foreground">{item.unit}</span></dd>
              </div>
              <Detail label={t.items.minimumStock}>{formatNumber(item.minimumStock)}</Detail>
              <Detail label={t.items.reserved}>{formatNumber(reserved)}</Detail>
              <Detail label={t.items.availableForLoan}>{formatNumber(availableForLoan(item, db.loans))}</Detail>
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
                {lines.map((x) => {
                  const l = x.lines.find((y) => y.itemId === item.id)!;
                  return (
                    <TableRow key={x.id}>
                      <TableCell className="tabular">{formatDate(x.date)}</TableCell>
                      <TableCell><TxTypeBadge type={x.type} /></TableCell>
                      <TableCell className={`tabular text-right font-medium ${l.quantityChange < 0 ? "text-danger-icon" : "text-success-icon"}`}>
                        {l.quantityChange > 0 ? "+" : ""}{formatNumber(l.quantityChange)}
                      </TableCell>
                      <TableCell className="tabular text-right">{formatNumber(l.balanceAfter)}</TableCell>
                      <TableCell><Link href={`/stock/view?id=${x.id}`} className="text-link hover:underline">{x.number}</Link></TableCell>
                      <TableCell className="hidden md:table-cell">{userName(db, x.userId)}</TableCell>
                    </TableRow>
                  );
                })}
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
          const r = await (active ? api.items.deactivate(item.id) : api.items.activate(item.id));
          if (r.ok) toast.success(active ? t.items.deactivated : t.items.activated);
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
          if (r.ok) { toast.success(t.items.deleted); router.replace("/items"); }
          return r;
        }}
      />
    </>
  );
}

export default function ItemViewPage() {
  return <Suspense fallback={<TableSkeleton />}><ItemView /></Suspense>;
}
