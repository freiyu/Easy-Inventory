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
import { SelectField } from "@/components/shared/select-field";
import { RecordNotFound, TableSkeleton } from "@/components/shared/states";
import { PurchaseBadge } from "@/components/shared/status-badge";
import { useQueryId } from "@/hooks/use-query-id";
import { formatDate, formatDateTime, formatIDR, formatNumber, today } from "@/lib/format";
import { api, useCurrentUser, useStore } from "@/lib/mock/store";
import { byId, itemName, userName } from "@/lib/queries";
import { purchaseStep } from "@/lib/rules";
import { receiveSchema, validate, type FieldErrors } from "@/lib/schemas";
import { t } from "@/lib/strings";
import type { PurchaseRequest, Result } from "@/lib/types";
import { cn } from "@/lib/utils";

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-base font-medium">{children}</dd>
    </div>
  );
}

type Dialog = "reject" | "receive" | "cancel" | null;

function PurchaseView() {
  const id = useQueryId();
  const user = useCurrentUser();
  const { db } = useStore();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState("");
  const request = byId(db.purchaseRequests, id);
  if (!user) return null;
  const isAdmin = user.role === "Admin";
  if (!request || (!isAdmin && request.requesterId !== user.id)) return <RecordNotFound backHref="/purchases" backLabel={t.purchases.notFoundBack} />;

  const own = request.requesterId === user.id;
  const tx = byId(db.transactions, request.transactionId);

  const act = async (key: string, fn: () => Promise<Result<unknown>>, message: string) => {
    setBusy(key);
    const r = await fn();
    setBusy("");
    if (r.ok) toast.success(message);
    else toast.error(r.error.message);
  };

  const canCancel = isAdmin
    ? ["Draft", "Pending Approval", "Approved"].includes(request.status)
    : own && ["Draft", "Pending Approval"].includes(request.status);

  return (
    <>
      <PageHeader
        title={request.number}
        crumbs={[{ label: t.nav.purchases, href: "/purchases" }, { label: request.number }]}
        badge={<PurchaseBadge status={request.status} />}
        actions={
          <>
            {request.status === "Draft" && (own || isAdmin) && (
              <>
                <Link href={`/purchases/edit?id=${request.id}`} className={buttonVariants({ variant: "outline" })}>{t.purchases.editDraft}</Link>
                <Button disabled={!!busy} onClick={() => act("submit", () => api.purchases.submit(request.id), t.purchases.submitted)}>{busy === "submit" ? t.common.saving : t.purchases.submit}</Button>
              </>
            )}
            {canCancel && <Button variant="outline" disabled={!!busy} onClick={() => setDialog("cancel")}>{t.purchases.cancel}</Button>}
            {isAdmin && request.status === "Pending Approval" && !own && (
              <>
                <Button variant="outline" disabled={!!busy} onClick={() => setDialog("reject")}>{t.purchases.reject}</Button>
                <Button disabled={!!busy} onClick={() => act("approve", () => api.purchases.approve(request.id), t.purchases.approved)}>{busy === "approve" ? t.common.saving : t.purchases.approve}</Button>
              </>
            )}
            {isAdmin && request.status === "Approved" && <Button disabled={!!busy} onClick={() => setDialog("receive")}>{t.purchases.receive}</Button>}
          </>
        }
      />

      {isAdmin && request.status === "Pending Approval" && own && (
        <p role="note" className="mb-6 flex items-start gap-2 rounded-lg bg-warning-soft px-4 py-3 text-base text-foreground">
          <CircleAlert className="mt-0.5 size-5 shrink-0 text-warning-icon" aria-hidden="true" />
          {t.purchases.ownRequest}
        </p>
      )}
      {isAdmin && tx?.status === "Voided" && (
        <p role="note" className="mb-6 flex items-start gap-2 rounded-lg bg-warning-soft px-4 py-3 text-base text-foreground">
          <CircleAlert className="mt-0.5 size-5 shrink-0 text-warning-icon" aria-hidden="true" />
          {t.purchases.receiptVoided}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card className="gap-4">
            <h2 className="px-5 text-lg font-semibold">{t.purchases.detailTitle}</h2>
            <dl className="grid gap-x-6 gap-y-4 px-5 sm:grid-cols-2">
              <Detail label={t.fields.requester}>{userName(db, request.requesterId)}</Detail>
              <Detail label={t.purchases.createdOn}>{formatDateTime(request.createdAt)}</Detail>
              <Detail label={t.purchases.neededBy}>{formatDate(request.neededBy)}</Detail>
              <div className="sm:col-span-2"><Detail label={t.purchases.reason}>{request.reason}</Detail></div>
              {request.notes && <div className="sm:col-span-2"><Detail label={t.purchases.note}>{request.notes}</Detail></div>}
              {request.approvedBy && <Detail label={request.status === "Rejected" ? t.purchases.rejectedBy : t.purchases.approvedBy}>{userName(db, request.approvedBy)} · {formatDate(request.approvedAt)}</Detail>}
              {request.rejectReason && <div className="sm:col-span-2"><Detail label={t.purchases.rejectReason}>{request.rejectReason}</Detail></div>}
              {request.receivedAt && <Detail label={t.purchases.receivedOn}>{formatDate(request.receivedAt)}</Detail>}
              {request.receivedBy && <Detail label={t.purchases.receivedBy}>{userName(db, request.receivedBy)}</Detail>}
              {isAdmin && tx && (
                <Detail label={t.purchases.transaction}>
                  <Link href={`/stock/view?id=${tx.id}`} className="text-link hover:underline">{tx.number}</Link>
                </Detail>
              )}
            </dl>
          </Card>

          <Card className="gap-0 overflow-hidden p-0">
            <h2 className="px-5 py-4 text-lg font-semibold">{t.purchases.itemsCard}</h2>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-muted">
                  <TableHead>{t.purchases.colItem}</TableHead>
                  <TableHead className="text-right">{t.purchases.colQty}</TableHead>
                  {isAdmin && <TableHead className="text-right">{t.purchases.colStockNow}</TableHead>}
                  {isAdmin && <TableHead className="text-right">{t.purchases.colMinimum}</TableHead>}
                  {isAdmin && <TableHead className="text-right">{t.purchases.colLastPrice}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {request.lines.map((l) => {
                  const item = byId(db.items, l.itemId);
                  return (
                    <TableRow key={l.itemId}>
                      <TableCell className="font-medium">{itemName(db, l.itemId)}</TableCell>
                      <TableCell className="tabular text-right">{formatNumber(l.quantity)} {item?.unit}</TableCell>
                      {isAdmin && <TableCell className="tabular text-right">{item ? formatNumber(item.currentStock) : "-"}</TableCell>}
                      {isAdmin && <TableCell className="tabular text-right">{item ? formatNumber(item.minimumStock) : "-"}</TableCell>}
                      {isAdmin && <TableCell className="tabular text-right">{item ? formatIDR(item.lastPurchasePrice) : "-"}</TableCell>}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Progress request={request} who={userName(db, request.requesterId)} />
          {isAdmin && request.status === "Pending Approval" && !own && (
            <p className="flex items-start gap-2 rounded-lg bg-info-soft px-4 py-3 text-base text-foreground">
              <Info className="mt-0.5 size-5 shrink-0 text-info-icon" aria-hidden="true" />
              {t.purchases.approveInfo}
            </p>
          )}
        </div>
      </div>

      {dialog === "reject" && (
        <ReasonDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          title={t.purchases.rejectTitle(request.number)}
          description={t.purchases.rejectBody}
          confirmLabel={t.purchases.rejectConfirm}
          onConfirm={async (reason) => {
            const r = await api.purchases.reject(request.id, reason);
            if (r.ok) toast.success(t.purchases.rejected);
            return r;
          }}
        />
      )}
      {dialog === "cancel" && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          title={t.purchases.cancelTitle(request.number)}
          description={t.purchases.cancelBody}
          confirmLabel={t.purchases.cancel}
          destructive
          onConfirm={async () => {
            const r = await api.purchases.cancel(request.id);
            if (r.ok) toast.success(t.purchases.cancelled);
            return r;
          }}
        />
      )}
      {dialog === "receive" && <ReceiveDialog request={request} onClose={() => setDialog(null)} />}
    </>
  );
}

function ReceiveDialog({ request, onClose }: { request: PurchaseRequest; onClose: () => void }) {
  const { db } = useStore();
  const preferred = byId(db.items, request.lines[0]?.itemId)?.supplierId;
  const [date, setDate] = useState(today());
  const [supplierId, setSupplierId] = useState(preferred ? String(preferred) : "");
  const [prices, setPrices] = useState<Record<number, string>>(() =>
    Object.fromEntries(request.lines.map((l) => [l.itemId, String(byId(db.items, l.itemId)?.lastPurchasePrice ?? 0)])));
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);

  const total = request.lines.reduce((n, l) => n + l.quantity * (/^\d+$/.test(prices[l.itemId]) ? Number(prices[l.itemId]) : 0), 0);

  const submit = async () => {
    const v = validate(receiveSchema, {
      date, supplierId, notes,
      lines: request.lines.map((l) => ({ itemId: String(l.itemId), unitPrice: prices[l.itemId] })),
    });
    setErrors(v.ok ? {} : v.errors);
    if (!v.ok) return;
    setPending(true);
    const r = await api.purchases.receive(request.id, v.data);
    setPending(false);
    if (!r.ok) return setErrors({ ...(r.error.fields ?? {}), _form: r.error.message });
    toast.success(t.purchases.received);
    onClose();
  };

  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t.purchases.receiveTitle(request.number)}
      description={t.purchases.receiveBody}
      submitLabel={t.purchases.receiveConfirm}
      pending={pending}
      onSubmit={submit}
      error={errors._form}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.fields.receivedDate} required error={errors.date}>
          {(p) => <Input {...p} type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} />}
        </Field>
        <Field label={t.fields.supplier} required error={errors.supplierId}>
          {(p) => <SelectField {...p} value={supplierId} onChange={setSupplierId} placeholder={t.validation.selectSupplier}
            options={db.suppliers.filter((s) => s.status === "Active").map((s) => ({ value: String(s.id), label: s.name }))} />}
        </Field>
      </div>
      {request.lines.map((l, i) => (
        <Field key={l.itemId} label={t.fields.unitPrice} hint={t.purchases.receivePriceFor(itemName(db, l.itemId), l.quantity)} required error={errors[`lines.${i}.unitPrice`]}>
          {(p) => <Input {...p} inputMode="numeric" value={prices[l.itemId]} onChange={(e) => setPrices({ ...prices, [l.itemId]: e.target.value })} />}
        </Field>
      ))}
      <p className="flex justify-between rounded-lg bg-muted px-4 py-3 text-base">
        <span className="text-muted-foreground">{t.purchases.receiveTotal}</span>
        <span className="tabular font-semibold">{formatIDR(total)}</span>
      </p>
      <Field label={t.common.notes}>
        {(p) => <Textarea {...p} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />}
      </Field>
    </FormDialog>
  );
}

function Progress({ request, who }: { request: PurchaseRequest; who: string }) {
  const step = purchaseStep(request.status);
  const steps = [
    { title: t.purchases.stepSubmitted, body: t.purchases.stepSubmittedBody(who, formatDate(request.createdAt)) },
    { title: t.purchases.stepApproved, body: t.purchases.stepApprovedBody },
    { title: t.purchases.stepReceived, body: t.purchases.stepReceivedBody },
  ];
  // Submitted counts as done once the request leaves Draft.
  const done = (i: number) => (i === 0 ? request.status !== "Draft" : step > i || (request.status === "Received" && i === 2));
  const closed = request.status === "Rejected" || request.status === "Cancelled";
  const note = request.status === "Rejected" ? t.purchases.rejectedNote : request.status === "Cancelled" ? t.purchases.cancelledNote : request.status === "Draft" ? t.purchases.draftNote : null;

  return (
    <Card className="gap-4">
      <h2 className="px-5 text-lg font-semibold">{t.purchases.progress}</h2>
      <ol className="flex flex-col gap-4 px-5">
        {steps.map((s, i) => {
          const isDone = done(i);
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
                  <span className="sr-only">{isDone ? t.purchases.stepDone : current ? t.purchases.stepCurrent : t.purchases.stepUpcoming}</span>
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

export default function PurchaseViewPage() {
  return <Suspense fallback={<TableSkeleton />}><PurchaseView /></Suspense>;
}
