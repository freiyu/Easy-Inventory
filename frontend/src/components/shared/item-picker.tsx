"use client";

import { useEffect, useState } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { ChevronDownIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useCurrentUser, useGet } from "@/lib/api/hooks";
import type { ItemDto } from "@/lib/api/master";
import { t } from "@/lib/strings";
import { cn } from "@/lib/utils";

const RESULTS = 20;

/**
 * Type-to-search item field for stock, loan and purchase lines. Searches active items on the server (name, and
 * code for Admin; Staff never see codes), so every item can be found, not only the first page.
 * `item` is the picked item; when only `value` (an id) is known, as on an edit form, the item is loaded and
 * handed back through `onChange`.
 */
export function ItemPicker({
  value, item, savedName, onChange, exclude, className, ...aria
}: {
  value: string;
  item?: ItemDto;
  /** Name saved on a draft line, shown when that item can no longer be loaded (inactive items are hidden from Staff). */
  savedName?: string;
  onChange: (item: ItemDto | null) => void;
  /** Ids already used on other lines. */
  exclude?: Set<string>;
  className?: string;
  id?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  "aria-required"?: boolean;
}) {
  const isAdmin = useCurrentUser()?.role === "Admin";
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const found = useGet<ItemDto[]>(open ? "/items" : null, { status: "Active", search, pageSize: RESULTS, sort: "name:asc" });
  const known = useGet<ItemDto>(value && !item ? `/items/${value}` : null);
  useEffect(() => {
    if (!item && known.data && String(known.data.id) === value) onChange(known.data);
  }, [item, known.data, value, onChange]);

  const results = (found.data ?? []).filter((i) => !exclude?.has(String(i.id)));
  // Items on other lines are left out of both numbers.
  const total = (found.meta?.total ?? 0) - ((found.data?.length ?? 0) - results.length);
  const label = (i: ItemDto) => (i.code ? `${i.name} (${i.code})` : i.name);
  // A saved line whose item was deactivated: Staff get no record (404), Admin get it with status Inactive.
  const missing = !!value && !item && known.status === "error";
  const unavailable = missing || item?.status === "Inactive";
  const shown = item && String(item.id) === value ? item : missing && savedName ? ({ id: Number(value), name: savedName } as ItemDto) : null;

  return (
    <Combobox.Root<ItemDto>
      items={results}
      filter={null}
      value={shown}
      onValueChange={(v) => onChange(v ?? null)}
      itemToStringLabel={label}
      isItemEqualToValue={(a, b) => a.id === b.id}
      onInputValueChange={(v, details) => details.reason === "input-change" && setQuery(v)}
      open={open}
      onOpenChange={setOpen}
    >
      <div className="relative">
        <Combobox.Input {...aria} render={<Input />} placeholder={isAdmin ? t.stock.searchItem : t.stock.searchItemByName} className={cn("pr-9", className)} />
        <Combobox.Trigger aria-label={t.stock.showItems} tabIndex={-1}
          className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground outline-none">
          <ChevronDownIcon className="size-4" aria-hidden="true" />
        </Combobox.Trigger>
      </div>
      {unavailable && (
        <p role="alert" className="mt-1.5 text-sm font-medium text-danger-icon">{t.stock.itemUnavailable(item?.name ?? savedName ?? value)}</p>
      )}
      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4} className="isolate z-50">
          <Combobox.Popup className="max-h-[min(var(--available-height),20rem)] w-(--anchor-width) min-w-56 overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10">
            <Combobox.Empty className="px-2 py-1.5 text-sm text-muted-foreground empty:hidden">
              {found.status === "error"
                ? <span role="alert" className="text-danger-icon">{found.error?.message}</span>
                : found.status === "loading" || found.refreshing ? t.stock.searchingItems : t.stock.noItemMatch}
            </Combobox.Empty>
            <Combobox.List>
              {(i: ItemDto) => (
                <Combobox.Item key={i.id} value={i}
                  className="flex cursor-default items-baseline justify-between gap-3 rounded-md px-2 py-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground">
                  <span>{i.name}</span>
                  {i.code && <span className="tabular shrink-0 text-muted-foreground">{i.code}</span>}
                </Combobox.Item>
              )}
            </Combobox.List>
            {total > results.length && (
              <p className="border-t px-2 pt-1.5 pb-1 text-sm text-muted-foreground">{t.stock.narrowSearch(results.length, total)}</p>
            )}
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
