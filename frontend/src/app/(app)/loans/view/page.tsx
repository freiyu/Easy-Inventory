"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { Check, Circle, CircleAlert, Info } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog, FormDialog, ReasonDialog } from "@/components/shared/dialogs";
import { Field } from "@/components/shared/form-field";
import { PageHeader } from "@/components/shared/page-header";
import { LoadGate, RecordNotFound, TableSkeleton } from "@/components/shared/states";
import { LoanBadge } from "@/components/shared/status-badge";
import { useQueryId } from "@/hooks/use-query-id";
import { api, useCurrentUser, useGet, type Envelope } from "@/lib/api";
import type { LoanDto } from "@/lib/api/loans";
import { formatDate, formatDateTime, formatNumber, today } from "@/lib/format";
import { loanStep } from "@/lib/steps";
import { returnSchema, validate, type FieldErrors } from "@/lib/schemas";
import { t } from "@/lib/strings";
import { cn } from "@/lib/utils";

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-base font-medium">{children}</dd>
    </div>
  );
}

type Dialog = "reject" | "issue" | "return" | "cancel" | null;

function LoanView() {
  const id = useQueryId();
  const user = useCurrentUser();
  const load = useGet<LoanDto>(id ? `/loans/${id}` : null);
  if (!user) return null;
  if (load.errorStatus === 404) return <RecordNotFound backHref="/loans" backLabel={t.loans.notFoundBack} />;
  return <LoadGate load={load} skeleton={<TableSkeleton />}>{load.data && <LoanDetail loan={load.data} userId={user.id} userName={user.name} isAdmin={user.role === "Admin"} />}</LoadGate>;
}

function LoanDetail({ loan, userId, userName, isAdmin }: { loan: LoanDto; userId: number; userName: string; isAdmin: boolean }) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState("");
  const status = loan.displayStatus;
  const own = loan.borrowerId === userId;
  const totalQty = loan.lines.reduce((n, l) => n + l.quantity, 0);
  const can = (a: LoanDto["allowedActions"][number]) => loan.allowedActions.includes(a);

  const act = async (key: string, fn: () => Promise<Envelope<unknown>>, message: string) => {
    setBusy(key);
    const r = await fn();
    setBusy("");
    if (r.success) toast.success(message);
    else toast.error(r.error.message);
  };

  return (
    <>
      <PageHeader
        title={loan.number}
        crumbs={[{ label: t.nav.loans, href: "/loans" }, { label: loan.number }]}
        badge={<LoanBadge status={status} />}
        actions={
          <>
            {can("edit") && (
              <>
                <Link href={`/loans/edit?id=${loan.id}`} className={buttonVariants({ variant: "outline" })}>{t.loans.editDraft}</Link>
                <Button disabled={!!busy} onClick={() => act("submit", () => api.loans.submit(loan.id), t.loans.submitted)}>{busy === "submit" ? t.common.saving : t.loans.submit}</Button>
              </>
            )}
            {can("cancel") && (
              <Button variant="outline" disabled={!!busy} onClick={() => setDialog("cancel")}>
                {loan.status === "Pending Approval" && !isAdmin ? t.loans.cancelRequest : t.loans.cancel}
              </Button>
            )}
            {can("approve") && (
              <>
                <Button variant="outline" disabled={!!busy} onClick={() => setDialog("reject")}>{t.loans.reject}</Button>
                <Button disabled={!!busy} onClick={() => act("approve", () => api.loans.approve(loan.id), t.loans.approved)}>{busy === "approve" ? t.common.saving : t.loans.approve}</Button>
              </>
            )}
            {can("issue") && <Button disabled={!!busy} onClick={() => setDialog("issue")}>{t.loans.issue}</Button>}
            {can("return") && <Button disabled={!!busy} onClick={() => setDialog("return")}>{t.loans.recordReturn}</Button>}
          </>
        }
      />

      {isAdmin && loan.status === "Pending Approval" && own && (
        <p role="note" className="mb-6 flex items-start gap-2 rounded-lg bg-warning-soft px-4 py-3 text-base text-foreground">
          <CircleAlert className="mt-0.5 size-5 shrink-0 text-warning-icon" aria-hidden="true" />
          {t.loans.ownRequest}
        </p>
      )}
      {status === "Overdue" && (
        <p role="note" className="mb-6 flex items-start gap-2 rounded-lg bg-danger-soft px-4 py-3 text-base text-foreground">
          <CircleAlert className="mt-0.5 size-5 shrink-0 text-danger-icon" aria-hidden="true" />
          {t.loans.overdueNote(loan.daysOverdue)}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card className="gap-4">
            <h2 className="px-5 text-lg font-semibold">{t.loans.detailTitle}</h2>
            <dl className="grid gap-x-6 gap-y-4 px-5 sm:grid-cols-2">
              <Detail label={t.loans.borrower}>{loan.borrowerName}</Detail>
              <Detail label={t.loans.requestedOn}>{formatDateTime(loan.createdAt)}</Detail>
              <Detail label={t.loans.loanDate}>{formatDate(loan.loanDate)}</Detail>
              <Detail label={t.loans.expectedReturn}>{formatDate(loan.expectedReturnDate)}</Detail>
              <div className="sm:col-span-2"><Detail label={t.loans.purpose}>{loan.purpose}</Detail></div>
              {loan.notes && <div className="sm:col-span-2"><Detail label={t.loans.note}>{loan.notes}</Detail></div>}
              {loan.approvedBy && <Detail label={loan.status === "Rejected" ? t.loans.rejectedBy : t.loans.approvedBy}>{loan.approvedByName} · {formatDate(loan.approvedAt)}</Detail>}
              {loan.rejectReason && <div className="sm:col-span-2"><Detail label={t.loans.rejectReason}>{loan.rejectReason}</Detail></div>}
              {loan.issuedBy && <Detail label={t.loans.issuedBy}>{loan.issuedByName} · {formatDate(loan.issuedAt)}</Detail>}
              {loan.returnedAt && <Detail label={t.loans.returnedOn}>{formatDate(loan.returnedAt)}</Detail>}
              {loan.receivedBy && <Detail label={t.loans.receivedBy}>{loan.receivedByName}</Detail>}
              {loan.returnNotes && <div className="sm:col-span-2"><Detail label={t.loans.returnNote}>{loan.returnNotes}</Detail></div>}
            </dl>
          </Card>

          <Card className="gap-0 overflow-hidden p-0">
            <h2 className="px-5 py-4 text-lg font-semibold">{t.loans.itemsCard}</h2>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-muted">
                  <TableHead>{t.loans.colItem}</TableHead>
                  <TableHead className="text-right">{t.loans.colQty}</TableHead>
                  {isAdmin && <TableHead className="text-right">{t.loans.colStockNow}</TableHead>}
                  {isAdmin && <TableHead className="text-right">{t.loans.colAvailable}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loan.lines.map((l) => (
                  <TableRow key={l.itemId}>
                    <TableCell className="font-medium">{l.itemName}</TableCell>
                    <TableCell className="tabular text-right">{formatNumber(l.quantity)} {l.unit}</TableCell>
                    {isAdmin && <TableCell className="tabular text-right">{l.currentStock !== undefined ? formatNumber(l.currentStock) : "-"}</TableCell>}
                    {isAdmin && <TableCell className="tabular text-right">{l.availableForLoan !== undefined ? formatNumber(l.availableForLoan) : "-"}</TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Progress loan={loan} who={loan.borrowerName} />
          {can("approve") && (
            <p className="flex items-start gap-2 rounded-lg bg-info-soft px-4 py-3 text-base text-foreground">
              <Info className="mt-0.5 size-5 shrink-0 text-info-icon" aria-hidden="true" />
              {t.loans.approveInfo(totalQty)}
            </p>
          )}
        </div>
      </div>

      {dialog === "reject" && (
        <ReasonDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          title={t.loans.rejectTitle(loan.number)}
          description={t.loans.rejectBody}
          confirmLabel={t.loans.rejectConfirm}
          onConfirm={async (reason) => {
            const r = await api.loans.reject(loan.id, reason);
            if (r.success) toast.success(t.loans.rejected);
            return r;
          }}
        />
      )}
      {dialog === "issue" && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          title={t.loans.issueTitle(loan.number)}
          description={t.loans.issueBody}
          confirmLabel={t.loans.issueConfirm}
          onConfirm={async () => {
            const r = await api.loans.issue(loan.id);
            if (r.success) toast.success(t.loans.issued);
            return r;
          }}
        >
          <ul className="rounded-lg bg-muted px-4 py-3 text-base">
            {loan.lines.map((l) => <li key={l.itemId}>{l.itemName} × {l.quantity}</li>)}
          </ul>
        </ConfirmDialog>
      )}
      {dialog === "cancel" && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          title={t.loans.cancelTitle(loan.number)}
          description={t.loans.cancelBody}
          confirmLabel={t.loans.cancel}
          destructive
          onConfirm={async () => {
            const r = await api.loans.cancel(loan.id);
            if (r.success) toast.success(t.loans.cancelled);
            return r;
          }}
        />
      )}
      {dialog === "return" && <ReturnDialog loan={loan} receiver={userName} onClose={() => setDialog(null)} />}
    </>
  );
}

function ReturnDialog({ loan, receiver, onClose }: { loan: LoanDto; receiver: string; onClose: () => void }) {
  const [returnDate, setReturnDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);

  const submit = async () => {
    const v = validate(returnSchema, { returnDate, notes });
    setErrors(v.ok ? {} : v.errors);
    if (!v.ok) return;
    setPending(true);
    const r = await api.loans.return(loan.id, v.data);
    setPending(false);
    if (!r.success) return setErrors({ ...(r.error.fields ?? {}), _form: r.error.message });
    toast.success(t.loans.returned);
    onClose();
  };

  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t.loans.returnTitle(loan.number)}
      description={t.loans.returnBody}
      submitLabel={t.loans.returnConfirm}
      pending={pending}
      onSubmit={submit}
      error={errors._form}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.fields.returnDate} required error={errors.returnDate}>
          {(p) => <Input {...p} type="date" min={loan.returnFloor} max={today()} value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />}
        </Field>
        <Field label={t.loans.receivedBy}>
          {(p) => <Input {...p} readOnly disabled value={receiver} />}
        </Field>
      </div>
      <Field label={t.fields.returnNote}>
        {(p) => <Textarea {...p} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />}
      </Field>
    </FormDialog>
  );
}

function Progress({ loan, who }: { loan: LoanDto; who: string }) {
  const step = loanStep(loan.status);
  const steps = [
    { title: t.loans.stepSubmitted, body: t.loans.stepSubmittedBody(who, formatDate(loan.createdAt)) },
    { title: t.loans.stepApproved, body: t.loans.stepApprovedBody },
    { title: t.loans.stepBorrowed, body: t.loans.stepBorrowedBody },
    { title: t.loans.stepCompleted, body: t.loans.stepCompletedBody },
  ];
  // Submitted counts as done once the request leaves Draft.
  const done = (i: number) => (i === 0 ? loan.status !== "Draft" && step >= 0 : step > i);
  const closed = loan.status === "Rejected" || loan.status === "Cancelled";
  const note = loan.status === "Rejected" ? t.loans.rejectedNote : loan.status === "Cancelled" ? t.loans.cancelledNote : loan.status === "Draft" ? t.loans.draftNote : null;

  return (
    <Card className="gap-4">
      <h2 className="px-5 text-lg font-semibold">{t.loans.progress}</h2>
      <ol className="flex flex-col gap-4 px-5">
        {steps.map((s, i) => {
          const isDone = done(i) || (loan.status === "Completed" && i === 3);
          const current = !closed && !isDone && step === i;
          return (
            <li key={s.title} className="flex gap-3" aria-current={current ? "step" : undefined}>
              <span
                className={cn(
                  "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2",
                  isDone ? "border-success-icon bg-success-soft text-success-icon" : current ? "border-primary text-primary" : "border-border text-muted-foreground",
                )}
              >
                {isDone ? <Check className="size-3.5" aria-hidden="true" /> : <Circle className="size-2 fill-current" aria-hidden="true" />}
              </span>
              <div>
                <p className={cn("text-base font-semibold", !isDone && !current && "text-muted-foreground")}>
                  {s.title}
                  <span className="sr-only">{isDone ? t.loans.stepDone : current ? t.loans.stepCurrent : t.loans.stepUpcoming}</span>
                </p>
                <p className="text-sm text-muted-foreground">{s.body}</p>
              </div>
            </li>
          );
        })}
      </ol>
      {note && <p className="mx-5 rounded-lg bg-muted px-3 py-2 text-sm text-foreground">{note}</p>}
    </Card>
  );
}

export default function LoanViewPage() {
  return <Suspense fallback={<TableSkeleton />}><LoanView /></Suspense>;
}
