"use client";

import { Suspense } from "react";
import { ItemForm } from "@/components/items/item-form";
import { PageHeader } from "@/components/shared/page-header";
import { RecordNotFound, TableSkeleton } from "@/components/shared/states";
import { useQueryId } from "@/hooks/use-query-id";
import { useStore } from "@/lib/mock/store";
import { byId } from "@/lib/queries";
import { t } from "@/lib/strings";

function EditItem() {
  const id = useQueryId();
  const { db } = useStore();
  const item = byId(db.items, id);
  if (!item) return <RecordNotFound backHref="/items" backLabel={t.items.notFoundBack} />;
  return (
    <>
      <PageHeader title={t.items.editTitle} description={t.items.editDesc} crumbs={[{ label: t.nav.items, href: "/items" }, { label: item.name, href: `/items/view?id=${item.id}` }, { label: t.items.editTitle }]} />
      <ItemForm item={item} />
    </>
  );
}

export default function EditItemPage() {
  return <Suspense fallback={<TableSkeleton />}><EditItem /></Suspense>;
}
