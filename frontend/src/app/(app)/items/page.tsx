"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, Pencil, Power, PowerOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { DataTable, type Column, type RowAction } from "@/components/shared/data-table";
import { ConfirmDialog } from "@/components/shared/dialogs";
import { FilterBar, SearchBox } from "@/components/shared/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { SelectField } from "@/components/shared/select-field";
import { StockBadge, StatusBadge } from "@/components/shared/status-badge";
import { EmptyState, LoadGate } from "@/components/shared/states";
import { usePageLoad } from "@/hooks/use-page-load";
import { formatNumber } from "@/lib/format";
import { api, useCurrentUser, useStore } from "@/lib/mock/store";
import { categoryName, matches, supplierName } from "@/lib/queries";
import { stockStatus } from "@/lib/rules";
import { t } from "@/lib/strings";
import type { Item } from "@/lib/types";
import { CircleX } from "lucide-react";

type Pending = { kind: "deactivate" | "activate" | "delete"; item: Item } | null;

const ALL = "all";

export default function ItemsPage() {
  const router = useRouter();
  const user = useCurrentUser();
  const { db } = useStore();
  const load = usePageLoad("items");
  const isAdmin = user?.role === "Admin";

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [supplier, setSupplier] = useState(ALL);
  const [location, setLocation] = useState(ALL);
  const [record, setRecord] = useState("Active");
  const [pending, setPending] = useState<Pending>(null);

  const dirty = query !== "" || category !== ALL || status !== ALL || supplier !== ALL || location !== ALL || record !== "Active";
  const clear = () => { setQuery(""); setCategory(ALL); setStatus(ALL); setSupplier(ALL); setLocation(ALL); setRecord("Active"); };

  const locations = useMemo(() => [...new Set(db.items.map((i) => i.location).filter(Boolean))].sort(), [db.items]);

  const rows = useMemo(() => db.items.filter((i) => {
    if (!isAdmin && i.status !== "Active") return false; // inactive items are never shown to Staff
    if (isAdmin && record !== ALL && i.status !== record) return false;
    if (category !== ALL && String(i.categoryId) !== category) return false;
    if (status !== ALL && stockStatus(i.currentStock, i.minimumStock) !== status) return false;
    if (isAdmin && supplier !== ALL && String(i.supplierId ?? "") !== supplier) return false;
    if (isAdmin && location !== ALL && i.location !== location) return false;
    return matches(query, i.name, ...(isAdmin ? [i.code, i.location] : []));
  }), [db.items, isAdmin, record, category, status, supplier, location, query]);

  if (!user) return null;

  const nameCell = (i: Item) => (
    <span className="flex flex-wrap items-center gap-2">
      <Link href={`/items/view?id=${i.id}`} className="font-medium hover:text-link hover:underline">{i.name}</Link>
      {i.status === "Inactive" && <StatusBadge tone="neutral" icon={CircleX}>{t.items.inactiveTag}</StatusBadge>}
    </span>
  );

  const adminColumns: Column<Item>[] = [
    { id: "code", header: t.items.colCode, cell: (i) => <span className="tabular text-muted-foreground">{i.code}</span>, sortValue: (i) => i.code, hideOnMobile: true },
    { id: "name", header: t.items.colName, cell: nameCell, sortValue: (i) => i.name, primary: true },
    { id: "category", header: t.items.colCategory, cell: (i) => categoryName(db, i.categoryId), sortValue: (i) => categoryName(db, i.categoryId) },
    { id: "stock", header: t.items.colStock, cell: (i) => <>{formatNumber(i.currentStock)} <span className="text-muted-foreground">{i.unit}</span></>, numeric: true, sortValue: (i) => i.currentStock },
    { id: "minimum", header: t.items.colMinimum, cell: (i) => formatNumber(i.minimumStock), numeric: true, sortValue: (i) => i.minimumStock, hideOnMobile: true },
    { id: "supplier", header: t.items.colSupplier, cell: (i) => <span className="block max-w-44 truncate" title={supplierName(db, i.supplierId)}>{supplierName(db, i.supplierId)}</span>, sortValue: (i) => supplierName(db, i.supplierId), hideOnMobile: true },
    { id: "location", header: t.items.colLocation, cell: (i) => i.location || "-", sortValue: (i) => i.location, hideOnMobile: true },
    { id: "status", header: t.items.colStatus, cell: (i) => <StockBadge status={stockStatus(i.currentStock, i.minimumStock)} />, sortValue: (i) => stockStatus(i.currentStock, i.minimumStock) },
  ];
  const staffColumns: Column<Item>[] = [
    { id: "name", header: t.items.colName, cell: nameCell, sortValue: (i) => i.name },
    { id: "category", header: t.items.colCategory, cell: (i) => categoryName(db, i.categoryId), sortValue: (i) => categoryName(db, i.categoryId) },
    { id: "unit", header: t.items.colUnit, cell: (i) => i.unit },
    { id: "availability", header: t.items.colAvailability, cell: (i) => <StockBadge status={stockStatus(i.currentStock, i.minimumStock)} role="Staff" />, sortValue: (i) => stockStatus(i.currentStock, i.minimumStock) },
  ];

  const actions = (i: Item): RowAction[] => [
    { label: t.items.view, icon: Eye, onSelect: () => router.push(`/items/view?id=${i.id}`) },
    { label: t.items.edit, icon: Pencil, onSelect: () => router.push(`/items/edit?id=${i.id}`) },
    i.status === "Active"
      ? { label: t.items.deactivate, icon: PowerOff, onSelect: () => setPending({ kind: "deactivate", item: i }), separated: true }
      : { label: t.items.activate, icon: Power, onSelect: () => setPending({ kind: "activate", item: i }), separated: true },
    { label: t.items.delete, icon: Trash2, destructive: true, onSelect: () => setPending({ kind: "delete", item: i }) },
  ];

  const confirm = pending && {
    deactivate: { title: t.items.deactivateTitle(pending.item.name), body: t.items.deactivateBody, label: t.items.deactivate, run: () => api.items.deactivate(pending.item.id), done: t.items.deactivated, destructive: false },
    activate: { title: t.items.activateTitle(pending.item.name), body: t.items.activateBody, label: t.items.activate, run: () => api.items.activate(pending.item.id), done: t.items.activated, destructive: false },
    delete: { title: t.items.deleteTitle(pending.item.name), body: t.items.deleteBody, label: t.items.delete, run: () => api.items.remove(pending.item.id), done: t.items.deleted, destructive: true },
  }[pending.kind];

  const empty = db.items.length === 0 || !dirty
    ? <EmptyState title={t.items.emptyTitle} body={isAdmin ? t.items.emptyBody : undefined} action={isAdmin ? <Link href="/items/new" className={buttonVariants()}>{t.items.add}</Link> : undefined} />
    : <EmptyState title={t.items.emptyFiltered} body={t.items.emptyFilteredBody} action={<Button variant="outline" onClick={clear}>{t.common.clear}</Button>} />;

  const stockOptions = (["Safe", "Low", "Out"] as const).map((s) => ({ value: s, label: isAdmin ? t.status.stockAdmin[s] : t.status.stockStaff[s] }));

  return (
    <>
      <PageHeader
        title={t.items.title}
        description={isAdmin ? t.items.descAdmin : t.items.descStaff}
        actions={isAdmin && (
          <>
            <Button variant="outline" onClick={() => toast.info(t.common.exportMocked)}>{t.common.exportExcel}</Button>
            <Link href="/items/new" className={buttonVariants()}>{t.items.add}</Link>
          </>
        )}
      />
      <LoadGate load={load}>
        <FilterBar dirty={dirty} onClear={clear}>
          <SearchBox value={query} onChange={setQuery} placeholder={t.items.searchPlaceholder} />
          <SelectField className="w-48" aria-label={t.fields.category} value={category} onChange={setCategory} options={[{ value: ALL, label: t.items.allCategories }, ...db.categories.map((c) => ({ value: String(c.id), label: c.name }))]} />
          <SelectField className="w-52" aria-label={t.fields.status} value={status} onChange={setStatus} options={[{ value: ALL, label: isAdmin ? t.items.allStockStatus : t.items.allAvailability }, ...stockOptions]} />
          {isAdmin && (
            <>
              <SelectField className="w-56" aria-label={t.fields.preferredSupplier} value={supplier} onChange={setSupplier} options={[{ value: ALL, label: t.items.allSuppliers }, ...db.suppliers.map((s) => ({ value: String(s.id), label: s.name }))]} />
              <SelectField className="w-48" aria-label={t.fields.location} value={location} onChange={setLocation} options={[{ value: ALL, label: t.items.allLocations }, ...locations.map((l) => ({ value: l, label: l }))]} />
              <SelectField className="w-48" aria-label={t.common.status} value={record} onChange={setRecord} options={[{ value: "Active", label: t.items.activeOnly }, { value: "Inactive", label: t.items.inactiveOnly }, { value: ALL, label: t.items.allRecords }]} />
            </>
          )}
        </FilterBar>
        <DataTable
          caption={t.items.caption}
          rows={rows}
          columns={isAdmin ? adminColumns : staffColumns}
          rowKey={(i) => i.id}
          rowLabel={(i) => i.name}
          actions={isAdmin ? actions : undefined}
          empty={empty}
          initialSort={{ id: "name", dir: "asc" }}
          minWidth="880px"
        />
      </LoadGate>
      {confirm && pending && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setPending(null)}
          title={confirm.title}
          description={confirm.body}
          confirmLabel={confirm.label}
          destructive={confirm.destructive}
          onConfirm={async () => {
            const r = await confirm.run();
            if (r.ok) toast.success(confirm.done);
            return r;
          }}
        />
      )}
    </>
  );
}
