"use client";

import { Suspense } from "react";
import { PurchaseForm } from "@/components/purchases/purchase-form";
import { PageHeader } from "@/components/shared/page-header";
import { RecordNotFound, TableSkeleton } from "@/components/shared/states";
import { useQueryId } from "@/hooks/use-query-id";
import { useCurrentUser, useStore } from "@/lib/mock/store";
import { byId } from "@/lib/queries";
import { t } from "@/lib/strings";

function EditPurchase() {
  const id = useQueryId();
  const user = useCurrentUser();
  const { db } = useStore();
  const request = byId(db.purchaseRequests, id);
  const allowed = request && user && request.status === "Draft" && (user.role === "Admin" || request.requesterId === user.id);
  if (!request || !allowed) return <RecordNotFound backHref="/purchases" backLabel={t.purchases.notFoundBack} />;
  return (
    <>
      <PageHeader title={t.purchases.editTitle} description={t.purchases.formDesc} crumbs={[{ label: t.nav.purchases, href: "/purchases" }, { label: request.number, href: `/purchases/view?id=${request.id}` }, { label: t.purchases.editTitle }]} />
      <PurchaseForm request={request} />
    </>
  );
}

export default function EditPurchasePage() {
  return <Suspense fallback={<TableSkeleton />}><EditPurchase /></Suspense>;
}
