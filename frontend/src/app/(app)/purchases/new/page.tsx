"use client";

import { PurchaseForm } from "@/components/purchases/purchase-form";
import { PageHeader } from "@/components/shared/page-header";
import { t } from "@/lib/strings";

export default function NewPurchasePage() {
  return (
    <>
      <PageHeader title={t.purchases.newTitle} description={t.purchases.formDesc} crumbs={[{ label: t.nav.purchases, href: "/purchases" }, { label: t.purchases.newTitle }]} />
      <PurchaseForm />
    </>
  );
}
