"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown, EllipsisVertical, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SelectField } from "@/components/shared/select-field";
import type { ListMeta } from "@/lib/api";
import { t } from "@/lib/strings";
import { cn } from "@/lib/utils";

export interface Column<T> {
  id: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  /** Makes the column sortable. The column id is the `sort` field sent to the API. */
  sortable?: boolean;
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

/**
 * Shows one page of rows that the API already searched, filtered, sorted and paged (PRD 6.6).
 * Search and filter controls live on the page (see useListParams); this draws the table, the sort
 * buttons, the pager and the mobile card layout, and reports clicks through the on* callbacks.
 */
export function DataTable<T>({
  rows, meta, sort, onSortChange, onPageChange, onPageSizeChange, columns, rowKey, rowLabel, actions, empty, caption, minWidth, busy,
}: {
  rows: T[];
  meta: ListMeta;
  /** Current sort as sent to the API, "field:asc" or "field:desc". */
  sort: string;
  onSortChange: (sort: string) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  columns: Column<T>[];
  rowKey: (row: T) => string | number;
  rowLabel: (row: T) => string;
  actions?: (row: T) => RowAction[];
  empty: React.ReactNode;
  caption: string;
  minWidth?: string;
  /** A newer query is loading; the rows shown belong to the previous one. */
  busy?: boolean;
}) {
  if (meta.total === 0) return <>{empty}</>;

  const [sortField, sortDir] = sort.split(":");
  const { pageSize, total } = meta;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = meta.page; // the server clamps a page past the end, so the rows always belong to this page
  const start = (current - 1) * pageSize;

  const toggleSort = (id: string) => onSortChange(`${id}:${sortField === id && sortDir === "asc" ? "desc" : "asc"}`);

  const pages = Array.from({ length: pageCount }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === pageCount || Math.abs(p - current) <= 1,
  );

  return (
    <div className={cn("flex flex-col gap-3", busy && "opacity-60 transition-opacity")} aria-busy={busy}>
      <Card className="hidden gap-0 overflow-hidden p-0 md:flex">
        <Table style={minWidth ? { minWidth } : undefined}>
          <caption className="sr-only">{caption}</caption>
          <TableHeader>
            <TableRow className="hover:bg-muted">
              {columns.map((c) => (
                <TableHead
                  key={c.id}
                  className={cn(c.numeric && "text-right", c.className)}
                  aria-sort={sortField === c.id ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
                >
                  {c.sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(c.id)}
                      aria-label={t.common.sortBy(c.header)}
                      className={cn("inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none", c.numeric && "flex-row-reverse")}
                    >
                      {c.header}
                      {sortField === c.id ? (sortDir === "asc" ? <ArrowUp className="size-4" aria-hidden="true" /> : <ArrowDown className="size-4" aria-hidden="true" />) : <ChevronsUpDown className="size-4 text-muted-foreground" aria-hidden="true" />}
                    </button>
                  ) : c.header}
                </TableHead>
              ))}
              {actions && <TableHead className="w-12"><span className="sr-only">{t.common.actions}</span></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
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
        {rows.map((row) => {
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
        <p aria-live="polite">{t.common.showing(start + 1, Math.min(start + pageSize, total), total)}</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <div className="flex items-center gap-2">
            <span aria-hidden="true">{t.common.rowsPerPage}</span>
            <SelectField
              size="sm"
              className="w-20"
              value={String(pageSize)}
              onChange={(v) => onPageSizeChange(Number(v))}
              options={PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) }))}
              aria-label={t.common.rowsPerPage}
            />
          </div>
          <nav className="flex items-center gap-1" aria-label={t.nav.pagination}>
            <Button variant="outline" size="sm" disabled={current === 1} onClick={() => onPageChange(current - 1)}>{t.common.previous}</Button>
            {pages.map((p, i) => (
              <span key={p} className="flex items-center gap-1">
                {i > 0 && p - pages[i - 1] > 1 && <span aria-hidden="true">…</span>}
                <Button
                  variant={p === current ? "default" : "outline"}
                  size="sm"
                  aria-current={p === current ? "page" : undefined}
                  aria-label={t.common.page(p)}
                  onClick={() => onPageChange(p)}
                >{p}</Button>
              </span>
            ))}
            <Button variant="outline" size="sm" disabled={current === pageCount} onClick={() => onPageChange(current + 1)}>{t.common.next}</Button>
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
