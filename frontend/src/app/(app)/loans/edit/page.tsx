"use client";

import { Suspense } from "react";
import { LoanForm } from "@/components/loans/loan-form";
import { PageHeader } from "@/components/shared/page-header";
import { LoadGate, RecordNotFound, TableSkeleton } from "@/components/shared/states";
import { useQueryId } from "@/hooks/use-query-id";
import { useGet } from "@/lib/api";
import type { LoanDto } from "@/lib/api/loans";
import { t } from "@/lib/strings";

function EditLoan() {
  const id = useQueryId();
  const load = useGet<LoanDto>(id ? `/loans/${id}` : null);
  const loan = load.data;
  if (load.errorStatus === 404 || (loan && !loan.allowedActions.includes("edit"))) return <RecordNotFound backHref="/loans" backLabel={t.loans.notFoundBack} />;
  return (
    <LoadGate load={load} skeleton={<TableSkeleton />}>
      {loan && (
        <>
          <PageHeader title={t.loans.editTitle} description={t.loans.formDesc} crumbs={[{ label: t.nav.loans, href: "/loans" }, { label: loan.number, href: `/loans/view?id=${loan.id}` }, { label: t.loans.editTitle }]} />
          <LoanForm loan={loan} />
        </>
      )}
    </LoadGate>
  );
}

export default function EditLoanPage() {
  return <Suspense fallback={<TableSkeleton />}><EditLoan /></Suspense>;
}
