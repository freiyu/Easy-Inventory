"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleX, Eye, Pencil, Power, PowerOff, SlidersHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DownloadButton } from "@/components/shared/download-button";
import { DataTable, type Column, type RowAction } from "@/components/shared/data-table";
import { ConfirmDialog } from "@/components/shared/dialogs";
import { FilterBar, SearchBox } from "@/components/shared/filter-bar";
import { Field } from "@/components/shared/form-field";
import { PageHeader } from "@/components/shared/page-header";
import { SelectField } from "@/components/shared/select-field";
import { StockBadge, StatusBadge } from "@/components/shared/status-badge";
import { EmptyState, LoadGate } from "@/components/shared/states";
import { api, tableProps, useCurrentUser, useGet, useListParams } from "@/lib/api";
import type { CategoryOption, ItemDto, SupplierDto } from "@/lib/api/master";
import { formatNumber } from "@/lib/format";
import { t } from "@/lib/strings";

type Pending = { kind: "deactivate" | "activate" | "delete"; item: ItemDto } | null;

const ALL = "all";

export default function ItemsPage() {
  const router = useRouter();
  const user = useCurrentUser();
  const isAdmin = user?.role === "Admin";
  const lp = useListParams({ sort: "name:asc", filters: { categoryId: ALL, subcategoryId: ALL, stockStatus: ALL, supplierId: ALL, location: ALL, status: "Active" } });
  const list = useGet<ItemDto[]>("/items", lp.params);
  const categories = useGet<CategoryOption[]>("/categories", { status: "Active", pageSize: 500, sort: "name:asc" });
  const subcategories = useGet<CategoryOption[]>("/subcategories", { status: "Active", pageSize: 500, sort: "name:asc" });
  const suppliers = useGet<SupplierDto[]>(isAdmin ? "/suppliers" : null, { pageSize: 500, sort: "name:asc" });
  const locations = useGet<string[]>(isAdmin ? "/items/locations" : null);
  const [pending, setPending] = useState<Pending>(null);

  if (!user) return null;
  const { filters } = lp;

  const nameCell = (i: ItemDto) => (
    <span className="flex flex-wrap items-center gap-2">
      <Link href={`/items/view?id=${i.id}`} className="font-(weight:--weight-strong) hover:text-link hover:underline">{i.name}</Link>
      {i.status === "Inactive" && <StatusBadge tone="neutral" icon={CircleX}>{t.items.inactiveTag}</StatusBadge>}
    </span>
  );

  const stock = (i: ItemDto) => <StockBadge status={i.stockStatus} role={user.role} />;
  const adminColumns: Column<ItemDto>[] = [
    { id: "code", header: t.items.colCode, cell: (i) => <span className="tabular text-muted-foreground">{i.code}</span>, sortable: true, hideOnMobile: true, defaultHidden: true },
    { id: "name", header: t.items.colName, cell: nameCell, sortable: true, primary: true, required: true },
    { id: "category", header: t.items.colCategory, cell: (i) => i.categoryName, sortable: true },
    { id: "subcategory", header: t.items.colSubcategory, cell: (i) => i.subcategoryName, sortable: true, hideOnMobile: true },
    { id: "stock", header: t.items.colStock, cell: (i) => <>{formatNumber(i.currentStock ?? 0)} <span className="text-muted-foreground">{i.unit}</span></>, numeric: true, sortable: true, required: true },
    { id: "minimum", header: t.items.colMinimum, cell: (i) => formatNumber(i.minimumStock ?? 0), numeric: true, sortable: true, hideOnMobile: true },
    { id: "supplier", header: t.items.colSupplier, cell: (i) => <span className="block max-w-44 truncate" title={i.supplierName}>{i.supplierName}</span>, sortable: true, hideOnMobile: true, defaultHidden: true },
    { id: "location", header: t.items.colLocation, cell: (i) => i.location || "-", sortable: true, hideOnMobile: true, defaultHidden: true },
    { id: "status", header: t.items.colStatus, cell: stock, sortable: true, required: true },
  ];
  const staffColumns: Column<ItemDto>[] = [
    { id: "name", header: t.items.colName, cell: nameCell, sortable: true, required: true },
    { id: "category", header: t.items.colCategory, cell: (i) => i.categoryName, sortable: true },
    { id: "subcategory", header: t.items.colSubcategory, cell: (i) => i.subcategoryName, sortable: true, hideOnMobile: true },
    { id: "unit", header: t.items.colUnit, cell: (i) => i.unit },
    { id: "availability", header: t.items.colAvailability, cell: stock, sortable: true, required: true },
  ];

  const actions = (i: ItemDto): RowAction[] => [
    { label: t.items.view, icon: Eye, onSelect: () => router.push(`/items/view?id=${i.id}`) },
    { label: t.items.edit, icon: Pencil, onSelect: () => router.push(`/items/edit?id=${i.id}`) },
    i.status === "Active"
      ? { label: t.items.deactivate, icon: PowerOff, onSelect: () => setPending({ kind: "deactivate", item: i }), separated: true }
      : { label: t.items.activate, icon: Power, onSelect: () => setPending({ kind: "activate", item: i }), separated: true },
    { label: t.items.delete, icon: Trash2, destructive: true, onSelect: () => setPending({ kind: "delete", item: i }) },
  ];

  const confirm = pending && {
    deactivate: { title: t.items.deactivateTitle(pending.item.name), body: t.items.deactivateBody, label: t.items.deactivate, run: () => api.items.setStatus(pending.item.id, "deactivate"), done: t.items.deactivated, destructive: false },
    activate: { title: t.items.activateTitle(pending.item.name), body: t.items.activateBody, label: t.items.activate, run: () => api.items.setStatus(pending.item.id, "activate"), done: t.items.activated, destructive: false },
    delete: { title: t.items.deleteTitle(pending.item.name), body: t.items.deleteBody, label: t.items.delete, run: () => api.items.remove(pending.item.id), done: t.items.deleted, destructive: true },
  }[pending.kind];

  const empty = !lp.dirty
    ? <EmptyState title={t.items.emptyTitle} body={isAdmin ? t.items.emptyBody : undefined} action={isAdmin ? <Link href="/items/new" className={buttonVariants()}>{t.items.add}</Link> : undefined} />
    : <EmptyState title={t.items.emptyFiltered} body={t.items.emptyFilteredBody} action={<Button variant="outline" onClick={lp.clear}>{t.common.clear}</Button>} />;

  // Secondary filters live behind one button; the number counts those that are not at their default.
  const moreActive = isAdmin ? [filters.supplierId !== ALL, filters.location !== ALL, filters.status !== "Active"].filter(Boolean).length : 0;
  const stockOptions = (["Safe", "Low", "Out"] as const).map((s) => ({ value: s, label: isAdmin ? t.status.stockAdmin[s] : t.status.stockStaff[s] }));

  return (
    <>
      <PageHeader
        title={t.items.title}
        description={isAdmin ? t.items.descAdmin : t.items.descStaff}
        actions={isAdmin && (
          <>
            <Link href="/items/import" className={buttonVariants({ variant: "outline" })}>{t.itemImport.button}</Link>
            <Link href="/items/new" className={buttonVariants()}>{t.items.add}</Link>
          </>
        )}
      />
      <FilterBar dirty={lp.dirty} onClear={lp.clear}>
        <SearchBox value={lp.search} onChange={lp.setSearch} placeholder={t.items.searchPlaceholder} />
        <SelectField className="w-48" aria-label={t.fields.category} value={filters.categoryId} onChange={(v) => lp.set({ categoryId: v })} options={[{ value: ALL, label: t.items.allCategories }, ...(categories.data ?? []).map((c) => ({ value: String(c.id), label: c.name }))]} />
        <SelectField className="w-48" aria-label={t.fields.subcategory} value={filters.subcategoryId} onChange={(v) => lp.set({ subcategoryId: v })} options={[{ value: ALL, label: t.items.allSubcategories }, ...(subcategories.data ?? []).map((c) => ({ value: String(c.id), label: c.name }))]} />
        <SelectField className={isAdmin ? "w-52" : "w-52 max-sm:col-span-2"} aria-label={isAdmin ? t.items.stockStatusFilter : t.items.availabilityFilter} value={filters.stockStatus} onChange={(v) => lp.set({ stockStatus: v })} options={[{ value: ALL, label: isAdmin ? t.items.allStockStatus : t.items.allAvailability }, ...stockOptions]} />
        {isAdmin && (
          <Popover>
            <PopoverTrigger render={<Button variant="outline" />}>
              <SlidersHorizontal className="size-4" aria-hidden="true" />
              {t.items.moreFilters(moreActive)}
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80">
              <Field label={t.fields.preferredSupplier}>
                {(p) => <SelectField {...p} value={filters.supplierId} onChange={(v) => lp.set({ supplierId: v })} options={[{ value: ALL, label: t.items.allSuppliers }, ...(suppliers.data ?? []).map((s) => ({ value: String(s.id), label: s.name }))]} />}
              </Field>
              <Field label={t.fields.location}>
                {(p) => <SelectField {...p} value={filters.location} onChange={(v) => lp.set({ location: v })} options={[{ value: ALL, label: t.items.allLocations }, ...(locations.data ?? []).map((l) => ({ value: l, label: l }))]} />}
              </Field>
              <Field label={t.items.recordStatusFilter}>
                {(p) => <SelectField {...p} value={filters.status} onChange={(v) => lp.set({ status: v })} options={[{ value: "Active", label: t.items.activeOnly }, { value: "Inactive", label: t.items.inactiveOnly }, { value: ALL, label: t.items.allRecords }]} />}
              </Field>
            </PopoverContent>
          </Popover>
        )}
      </FilterBar>
      <LoadGate load={list}>
        <DataTable
          columnsKey={isAdmin ? "items-admin" : "items-staff"}
          caption={t.items.caption}
          {...tableProps(list, lp)}
          columns={isAdmin ? adminColumns : staffColumns}
          rowKey={(i) => i.id}
          rowLabel={(i) => i.name}
          actions={isAdmin ? actions : undefined}
          toolbar={isAdmin ? <DownloadButton variant="outline" size="sm" run={() => api.items.export(lp.params)} label={t.common.exportExcel} busyLabel={t.common.exporting} /> : undefined}
          empty={empty}
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
            if (r.success) toast.success(confirm.done);
            return r;
          }}
        />
      )}
    </>
  );
}
