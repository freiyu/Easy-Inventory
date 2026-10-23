"use client";

import { ItemForm } from "@/components/items/item-form";
import { PageHeader } from "@/components/shared/page-header";
import { t } from "@/lib/strings";

export default function NewItemPage() {
  return (
    <>
      <PageHeader title={t.items.addTitle} description={t.items.addDesc} crumbs={[{ label: t.nav.items, href: "/items" }, { label: t.items.addTitle }]} />
      <ItemForm />
    </>
  );
}
