"use client";

import { LoanForm } from "@/components/loans/loan-form";
import { PageHeader } from "@/components/shared/page-header";
import { useCurrentUser } from "@/lib/api";
import { t } from "@/lib/strings";

export default function NewLoanPage() {
  const user = useCurrentUser();
  const title = user?.role === "Admin" ? t.loans.newTitle : t.loans.newRequestTitle;
  return (
    <>
      <PageHeader title={title} description={t.loans.formDesc} crumbs={[{ label: t.nav.loans, href: "/loans" }, { label: title }]} />
      <LoanForm />
    </>
  );
}
