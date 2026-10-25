"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, Eye } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { DataTable, type Column, type RowAction } from "@/components/shared/data-table";
import { ReasonDialog } from "@/components/shared/dialogs";
import { FilterBar, SearchBox } from "@/components/shared/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { SelectField } from "@/components/shared/select-field";
import { TxStatusBadge, TxTypeBadge } from "@/components/shared/status-badge";
import { EmptyState, LoadGate } from "@/components/shared/states";
import { api, tableProps, useGet, useListParams } from "@/lib/api";
import type { StockTxDto } from "@/lib/api/stock";
import { formatDate, formatIDR } from "@/lib/format";
import { t } from "@/lib/strings";

const ALL = "all";
export default function StockPage() {
  const router = useRouter();
  const lp = useListParams({ sort: "date:desc", filters: { type: ALL, status: ALL } });
  const list = useGet<StockTxDto[]>("/stock/transactions", lp.params);
  const [voiding, setVoiding] = useState<StockTxDto | null>(null);

  const itemsCell = (x: StockTxDto) => (
    <span>
      {x.lines[0].itemName}
      {x.lines.length > 1 && <span className="text-muted-foreground"> {t.stock.moreItems(x.lines.length - 1)}</span>}
    </span>
  );

  const columns: Column<StockTxDto>[] = [
    { id: "number", header: t.stock.colNumber, cell: (x) => <Link href={`/stock/view?id=${x.id}`} className="font-medium text-link hover:underline">{x.number}</Link>, sortable: true },
    { id: "date", header: t.stock.colDate, cell: (x) => <span className="tabular">{formatDate(x.date)}</span>, sortable: true },
    { id: "type", header: t.stock.colType, cell: (x) => <TxTypeBadge type={x.type} />, sortable: true },
    { id: "items", header: t.stock.colItems, cell: itemsCell, hideOnMobile: true },
    { id: "party", header: t.stock.colParty, cell: (x) => <span className="line-clamp-1 whitespace-normal">{x.party || "-"}</span>, sortable: true, hideOnMobile: true },
    { id: "total", header: t.stock.colTotal, cell: (x) => (x.type === "IN" ? formatIDR(x.total) : "-"), numeric: true, sortable: true, hideOnMobile: true },
    { id: "user", header: t.stock.colUser, cell: (x) => x.userName, sortable: true, hideOnMobile: true },
    { id: "status", header: t.stock.colStatus, cell: (x) => <TxStatusBadge status={x.status} />, sortable: true },
  ];
  const actions = (x: StockTxDto): RowAction[] => [
    { label: t.stock.view, icon: Eye, onSelect: () => router.push(`/stock/view?id=${x.id}`) },
    { label: t.stock.void, icon: Ban, destructive: true, separated: true, hidden: !x.allowedActions.includes("void"), onSelect: () => setVoiding(x) },
  ];

  return (
    <>
      <PageHeader
        title={t.stock.title}
        description={t.stock.description}
        actions={
          <>
            <Link href="/stock/adjustment" className={buttonVariants({ variant: "outline" })}>{t.stock.adjustment}</Link>
            <Link href="/stock/out" className={buttonVariants({ variant: "outline" })}>{t.stock.outgoing}</Link>
            <Link href="/stock/in" className={buttonVariants()}>{t.stock.incoming}</Link>
          </>
        }
      />
      <LoadGate load={list}>
        <FilterBar dirty={lp.dirty} onClear={lp.clear}>
          <SearchBox value={lp.search} onChange={lp.setSearch} placeholder={t.stock.searchPlaceholder} />
          <SelectField className="w-48" aria-label={t.stock.colType} value={lp.filters.type} onChange={(v) => lp.set({ type: v })}
            options={[{ value: ALL, label: t.stock.allTypes }, ...(Object.keys(t.status.txType) as (keyof typeof t.status.txType)[]).map((k) => ({ value: k, label: t.status.txType[k] }))]} />
          <SelectField className="w-44" aria-label={t.stock.colStatus} value={lp.filters.status} onChange={(v) => lp.set({ status: v })}
            options={[{ value: ALL, label: t.stock.allStatuses }, { value: "Posted", label: t.status.txStatus.Posted }, { value: "Voided", label: t.status.txStatus.Voided }]} />
        </FilterBar>
        <DataTable
          caption={t.stock.caption}
          {...tableProps(list, lp)}
          columns={columns}
          rowKey={(x) => x.id}
          rowLabel={(x) => x.number}
          actions={actions}
          minWidth="1000px"
          empty={lp.dirty
            ? <EmptyState title={t.stock.emptyFiltered} action={<Button variant="outline" onClick={lp.clear}>{t.common.clear}</Button>} />
            : <EmptyState title={t.stock.emptyTitle} body={t.stock.emptyBody} action={<Link href="/stock/in" className={buttonVariants()}>{t.stock.incoming}</Link>} />}
        />
      </LoadGate>
      {voiding && (
        <ReasonDialog
          open
          onOpenChange={(o) => !o && setVoiding(null)}
          title={t.stock.voidTitle(voiding.number)}
          description={t.stock.voidBody}
          confirmLabel={t.stock.voidConfirm}
          onConfirm={async (reason) => {
            const r = await api.stock.void(voiding.id, reason);
            if (r.success) toast.success(t.stock.voided);
            return r;
          }}
        />
      )}
    </>
  );
}
