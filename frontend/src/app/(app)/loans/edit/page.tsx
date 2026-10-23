"use client";

import { Suspense } from "react";
import { LoanForm } from "@/components/loans/loan-form";
import { PageHeader } from "@/components/shared/page-header";
import { RecordNotFound, TableSkeleton } from "@/components/shared/states";
import { useQueryId } from "@/hooks/use-query-id";
import { useCurrentUser, useStore } from "@/lib/mock/store";
import { byId } from "@/lib/queries";
import { t } from "@/lib/strings";

function EditLoan() {
  const id = useQueryId();
  const user = useCurrentUser();
  const { db } = useStore();
  const loan = byId(db.loans, id);
  const allowed = loan && user && loan.status === "Draft" && (user.role === "Admin" || loan.borrowerId === user.id);
  if (!loan || !allowed) return <RecordNotFound backHref="/loans" backLabel={t.loans.notFoundBack} />;
  return (
    <>
      <PageHeader title={t.loans.editTitle} description={t.loans.formDesc} crumbs={[{ label: t.nav.loans, href: "/loans" }, { label: loan.number, href: `/loans/view?id=${loan.id}` }, { label: t.loans.editTitle }]} />
      <LoanForm loan={loan} />
    </>
  );
}

export default function EditLoanPage() {
  return <Suspense fallback={<TableSkeleton />}><EditLoan /></Suspense>;
}
