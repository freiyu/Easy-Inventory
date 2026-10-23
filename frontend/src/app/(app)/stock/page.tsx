"use client";

import { useMemo, useState } from "react";
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
import { usePageLoad } from "@/hooks/use-page-load";
import { formatDate, formatIDR } from "@/lib/format";
import { api, useStore } from "@/lib/mock/store";
import { canVoid, itemName, matches, party, userName } from "@/lib/queries";
import { t } from "@/lib/strings";
import type { StockTransaction } from "@/lib/types";

const ALL = "all";
export default function StockPage() {
  const router = useRouter();
  const { db } = useStore();
  const load = usePageLoad("stock");
  const [query, setQuery] = useState("");
  const [type, setType] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [voiding, setVoiding] = useState<StockTransaction | null>(null);

  const clear = () => { setQuery(""); setType(ALL); setStatus(ALL); };
  const dirty = query !== "" || type !== ALL || status !== ALL;

  const rows = useMemo(() => db.transactions.filter((x) =>
    (type === ALL || x.type === type) && (status === ALL || x.status === status) &&
    matches(query, x.number, party(db, x), ...x.lines.map((l) => itemName(db, l.itemId))),
  ), [db, query, type, status]);

  const itemsCell = (x: StockTransaction) => (
    <span>
      {itemName(db, x.lines[0].itemId)}
      {x.lines.length > 1 && <span className="text-muted-foreground"> {t.stock.moreItems(x.lines.length - 1)}</span>}
    </span>
  );

  const columns: Column<StockTransaction>[] = [
    { id: "number", header: t.stock.colNumber, cell: (x) => <Link href={`/stock/view?id=${x.id}`} className="font-medium text-link hover:underline">{x.number}</Link>, sortValue: (x) => x.number },
    { id: "date", header: t.stock.colDate, cell: (x) => <span className="tabular">{formatDate(x.date)}</span>, sortValue: (x) => `${x.date}${String(x.id).padStart(6, "0")}` },
    { id: "type", header: t.stock.colType, cell: (x) => <TxTypeBadge type={x.type} />, sortValue: (x) => x.type },
    { id: "items", header: t.stock.colItems, cell: itemsCell, hideOnMobile: true },
    { id: "party", header: t.stock.colParty, cell: (x) => <span className="line-clamp-1 whitespace-normal">{party(db, x) || "-"}</span>, hideOnMobile: true },
    { id: "total", header: t.stock.colTotal, cell: (x) => (x.type === "IN" ? formatIDR(x.lines.reduce((n, l) => n + (l.total ?? 0), 0)) : "-"), numeric: true, sortValue: (x) => x.lines.reduce((n, l) => n + (l.total ?? 0), 0), hideOnMobile: true },
    { id: "user", header: t.stock.colUser, cell: (x) => userName(db, x.userId), hideOnMobile: true },
    { id: "status", header: t.stock.colStatus, cell: (x) => <TxStatusBadge status={x.status} />, sortValue: (x) => x.status },
  ];
  const actions = (x: StockTransaction): RowAction[] => [
    { label: t.stock.view, icon: Eye, onSelect: () => router.push(`/stock/view?id=${x.id}`) },
    { label: t.stock.void, icon: Ban, destructive: true, separated: true, hidden: !canVoid(x), onSelect: () => setVoiding(x) },
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
      <LoadGate load={load}>
        <FilterBar dirty={dirty} onClear={clear}>
          <SearchBox value={query} onChange={setQuery} placeholder={t.stock.searchPlaceholder} />
          <SelectField className="w-48" aria-label={t.stock.colType} value={type} onChange={setType}
            options={[{ value: ALL, label: t.stock.allTypes }, ...(Object.keys(t.status.txType) as (keyof typeof t.status.txType)[]).map((k) => ({ value: k, label: t.status.txType[k] }))]} />
          <SelectField className="w-44" aria-label={t.stock.colStatus} value={status} onChange={setStatus}
            options={[{ value: ALL, label: t.stock.allStatuses }, { value: "Posted", label: t.status.txStatus.Posted }, { value: "Voided", label: t.status.txStatus.Voided }]} />
        </FilterBar>
        <DataTable
          caption={t.stock.caption}
          rows={rows}
          columns={columns}
          rowKey={(x) => x.id}
          rowLabel={(x) => x.number}
          actions={actions}
          initialSort={{ id: "date", dir: "desc" }}
          minWidth="1000px"
          empty={dirty
            ? <EmptyState title={t.stock.emptyFiltered} action={<Button variant="outline" onClick={clear}>{t.common.clear}</Button>} />
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
            if (r.ok) toast.success(t.stock.voided);
            return r;
          }}
        />
      )}
    </>
  );
}
