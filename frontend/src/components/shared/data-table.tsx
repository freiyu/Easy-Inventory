"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, EllipsisVertical, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SelectField } from "@/components/shared/select-field";
import { t } from "@/lib/strings";
import { cn } from "@/lib/utils";

export interface Column<T> {
  id: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  /** Makes the column sortable. */
  sortValue?: (row: T) => string | number;
  /** Right-aligned with tabular figures (PRD 5.5, DESIGN.md). */
  numeric?: boolean;
  hideOnMobile?: boolean;
  /** Used as the card title on mobile; defaults to the first column. */
  primary?: boolean;
  className?: string;
}

export interface RowAction {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  destructive?: boolean;
  hidden?: boolean;
  /** Draws a divider above this action. */
  separated?: boolean;
}

const PAGE_SIZES = [10, 25, 50, 100];

/** Search, filter and paging controls live on the page; this does sorting, paging, and the mobile card layout. */
export function DataTable<T>({
  rows, columns, rowKey, rowLabel, actions, empty, initialSort, caption, minWidth,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string | number;
  rowLabel: (row: T) => string;
  actions?: (row: T) => RowAction[];
  empty: React.ReactNode;
  initialSort?: { id: string; dir: "asc" | "desc" };
  caption: string;
  minWidth?: string;
}) {
  const [sort, setSort] = useState(initialSort ?? null);
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.id === sort?.id);
    if (!col?.sortValue || !sort) return rows;
    const get = col.sortValue;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = get(a), y = get(b);
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * dir;
    });
  }, [rows, columns, sort]);

  if (rows.length === 0) return <>{empty}</>;

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pageCount);
  const start = (current - 1) * pageSize;
  const visible = sorted.slice(start, start + pageSize);

  const toggleSort = (id: string) =>
    setSort((s) => (s?.id === id ? { id, dir: s.dir === "asc" ? "desc" : "asc" } : { id, dir: "asc" }));

  const pages = Array.from({ length: pageCount }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === pageCount || Math.abs(p - current) <= 1,
  );

  return (
    <div className="flex flex-col gap-3">
      <Card className="hidden gap-0 overflow-hidden p-0 md:flex">
        <Table style={minWidth ? { minWidth } : undefined}>
          <caption className="sr-only">{caption}</caption>
          <TableHeader>
            <TableRow className="hover:bg-muted">
              {columns.map((c) => (
                <TableHead
                  key={c.id}
                  className={cn(c.numeric && "text-right", c.className)}
                  aria-sort={sort?.id === c.id ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                >
                  {c.sortValue ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(c.id)}
                      aria-label={t.common.sortBy(c.header)}
                      className={cn("inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none", c.numeric && "flex-row-reverse")}
                    >
                      {c.header}
                      {sort?.id === c.id ? (sort.dir === "asc" ? <ArrowUp className="size-4" aria-hidden="true" /> : <ArrowDown className="size-4" aria-hidden="true" />) : <ChevronsUpDown className="size-4 text-muted-foreground" aria-hidden="true" />}
                    </button>
                  ) : c.header}
                </TableHead>
              ))}
              {actions && <TableHead className="w-12"><span className="sr-only">{t.common.actions}</span></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((row) => (
              <TableRow key={rowKey(row)}>
                {columns.map((c) => (
                  <TableCell key={c.id} className={cn(c.numeric && "tabular text-right", c.className)}>{c.cell(row)}</TableCell>
                ))}
                {actions && (
                  <TableCell className="w-12 py-1"><RowMenu label={rowLabel(row)} actions={actions(row)} /></TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <ul className="flex flex-col gap-3 md:hidden" aria-label={caption}>
        {visible.map((row) => {
          const first = columns.find((c) => c.primary) ?? columns[0];
          const rest = columns.filter((c) => c !== first);
          return (
            <li key={rowKey(row)}>
              <Card className="gap-3">
                <div className="flex items-start justify-between gap-2 px-5">
                  <div className="min-w-0 font-medium text-foreground">{first.cell(row)}</div>
                  {actions && <RowMenu label={rowLabel(row)} actions={actions(row)} />}
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 px-5 text-sm">
                  {rest.filter((c) => !c.hideOnMobile).map((c) => (
                    <div key={c.id} className="col-span-2 grid grid-cols-subgrid items-center">
                      <dt className="text-muted-foreground">{c.header}</dt>
                      <dd className={cn("min-w-0 text-right text-foreground", c.numeric && "tabular")}>{c.cell(row)}</dd>
                    </div>
                  ))}
                </dl>
              </Card>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col items-center justify-between gap-3 text-sm text-muted-foreground sm:flex-row">
        <p aria-live="polite">{t.common.showing(start + 1, Math.min(start + pageSize, sorted.length), sorted.length)}</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <label className="flex items-center gap-2">
            <span>{t.common.rowsPerPage}</span>
            <SelectField
              size="sm"
              className="w-20"
              value={String(pageSize)}
              onChange={(v) => { setPageSize(Number(v)); setPage(1); }}
              options={PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) }))}
              aria-label={t.common.rowsPerPage}
            />
          </label>
          <nav className="flex items-center gap-1" aria-label={t.nav.pagination}>
            <Button variant="outline" size="sm" disabled={current === 1} onClick={() => setPage(current - 1)}>{t.common.previous}</Button>
            {pages.map((p, i) => (
              <span key={p} className="flex items-center gap-1">
                {i > 0 && p - pages[i - 1] > 1 && <span aria-hidden="true">…</span>}
                <Button
                  variant={p === current ? "default" : "outline"}
                  size="sm"
                  aria-current={p === current ? "page" : undefined}
                  aria-label={t.common.page(p)}
                  onClick={() => setPage(p)}
                >{p}</Button>
              </span>
            ))}
            <Button variant="outline" size="sm" disabled={current === pageCount} onClick={() => setPage(current + 1)}>{t.common.next}</Button>
          </nav>
        </div>
      </div>
    </div>
  );
}

function RowMenu({ label, actions }: { label: string; actions: RowAction[] }) {
  const items = actions.filter((a) => !a.hidden);
  if (items.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`${t.common.actions}: ${label}`} />}>
        <EllipsisVertical className="size-4" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {items.map((a) => (
          <span key={a.label}>
            {a.separated && <DropdownMenuSeparator />}
            <DropdownMenuItem onClick={a.onSelect} className={a.destructive ? "text-danger-icon focus:text-danger-icon" : undefined}>
              {a.icon && <a.icon className="size-4" aria-hidden="true" />}
              {a.label}
            </DropdownMenuItem>
          </span>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
