"use client";

import { Suspense } from "react";
import { PurchaseForm } from "@/components/purchases/purchase-form";
import { PageHeader } from "@/components/shared/page-header";
import { LoadGate, RecordNotFound, TableSkeleton } from "@/components/shared/states";
import { useQueryId } from "@/hooks/use-query-id";
import { useGet } from "@/lib/api";
import type { PurchaseDto } from "@/lib/api/purchases";
import { t } from "@/lib/strings";

function EditPurchase() {
  const id = useQueryId();
  const load = useGet<PurchaseDto>(id ? `/purchase-requests/${id}` : null);
  const request = load.data;
  // The server says whether this user may edit it (draft, own or Admin).
  if (load.errorStatus === 404 || (request && !request.allowedActions.includes("edit"))) return <RecordNotFound backHref="/purchases" backLabel={t.purchases.notFoundBack} />;
  return (
    <LoadGate load={load} skeleton={<TableSkeleton />}>
      {request && (
        <>
          <PageHeader title={t.purchases.editTitle} description={t.purchases.formDesc} crumbs={[{ label: t.nav.purchases, href: "/purchases" }, { label: request.number, href: `/purchases/view?id=${request.id}` }, { label: t.purchases.editTitle }]} />
          <PurchaseForm request={request} />
        </>
      )}
    </LoadGate>
  );
}

export default function EditPurchasePage() {
  return <Suspense fallback={<TableSkeleton />}><EditPurchase /></Suspense>;
}
