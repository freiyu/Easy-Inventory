"use client";

import { Suspense } from "react";
import { ItemForm } from "@/components/items/item-form";
import { PageHeader } from "@/components/shared/page-header";
import { LoadGate, RecordNotFound, TableSkeleton } from "@/components/shared/states";
import { useQueryId } from "@/hooks/use-query-id";
import { useGet } from "@/lib/api";
import type { ItemDto } from "@/lib/api/master";
import { t } from "@/lib/strings";

function EditItem() {
  const id = useQueryId();
  const load = useGet<ItemDto>(id ? `/items/${id}` : null);
  if (load.errorStatus === 404) return <RecordNotFound backHref="/items" backLabel={t.items.notFoundBack} />;
  const item = load.data;
  return (
    <LoadGate load={load} skeleton={<TableSkeleton />}>
      {item && (
        <>
          <PageHeader title={t.items.editTitle} description={t.items.editDesc} crumbs={[{ label: t.nav.items, href: "/items" }, { label: item.name, href: `/items/view?id=${item.id}` }, { label: t.items.editTitle }]} />
          <ItemForm item={item} />
        </>
      )}
    </LoadGate>
  );
}

export default function EditItemPage() {
  return <Suspense fallback={<TableSkeleton />}><EditItem /></Suspense>;
}
