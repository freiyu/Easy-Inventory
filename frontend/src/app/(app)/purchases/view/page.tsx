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
import { LoadGate, RecordNotFound, TableSkeleton } from "@/components/shared/states";
import { PurchaseBadge } from "@/components/shared/status-badge";
import { useQueryId } from "@/hooks/use-query-id";
import { api, useCurrentUser, useGet, type Envelope } from "@/lib/api";
import type { SupplierDto } from "@/lib/api/master";
import type { PurchaseDto } from "@/lib/api/purchases";
import { formatDate, formatDateTime, formatIDR, formatNumber, today } from "@/lib/format";
import { purchaseStep } from "@/lib/steps";
import { receiveSchema, validate, type FieldErrors } from "@/lib/schemas";
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

type Dialog = "reject" | "receive" | "cancel" | null;

function PurchaseView() {
  const id = useQueryId();
  const user = useCurrentUser();
  const load = useGet<PurchaseDto>(id ? `/purchase-requests/${id}` : null);
  if (!user) return null;
  // Staff asking for someone else's request get a 404 from the server, same as a missing one.
  if (load.errorStatus === 404) return <RecordNotFound backHref="/purchases" backLabel={t.purchases.notFoundBack} />;
  return <LoadGate load={load} skeleton={<TableSkeleton />}>{load.data && <PurchaseDetail request={load.data} userId={user.id} isAdmin={user.role === "Admin"} />}</LoadGate>;
}

function PurchaseDetail({ request, userId, isAdmin }: { request: PurchaseDto; userId: number; isAdmin: boolean }) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState("");
  const own = request.requesterId === userId;
  const can = (a: PurchaseDto["allowedActions"][number]) => request.allowedActions.includes(a);

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
        title={request.number}
        crumbs={[{ label: t.nav.purchases, href: "/purchases" }, { label: request.number }]}
        badge={<PurchaseBadge status={request.status} />}
        actions={
          <>
            {can("edit") && <Link href={`/purchases/edit?id=${request.id}`} className={buttonVariants({ variant: "outline" })}>{t.purchases.editDraft}</Link>}
            {can("submit") && <Button disabled={!!busy} onClick={() => act("submit", () => api.purchases.submit(request.id), t.purchases.submitted)}>{busy === "submit" ? t.common.saving : t.purchases.submit}</Button>}
            {can("cancel") && <Button variant="outline" disabled={!!busy} onClick={() => setDialog("cancel")}>{t.purchases.cancel}</Button>}
            {can("reject") && <Button variant="outline" disabled={!!busy} onClick={() => setDialog("reject")}>{t.purchases.reject}</Button>}
            {can("approve") && <Button disabled={!!busy} onClick={() => act("approve", () => api.purchases.approve(request.id), t.purchases.approved)}>{busy === "approve" ? t.common.saving : t.purchases.approve}</Button>}
            {can("receive") && <Button disabled={!!busy} onClick={() => setDialog("receive")}>{t.purchases.receive}</Button>}
          </>
        }
      />

      {isAdmin && request.status === "Pending Approval" && own && (
        <p role="note" className="mb-6 flex items-start gap-2 rounded-lg bg-warning-soft px-4 py-3 text-base text-foreground">
          <CircleAlert className="mt-0.5 size-5 shrink-0 text-warning-icon" aria-hidden="true" />
          {t.purchases.ownRequest}
        </p>
      )}
      {isAdmin && request.receiptVoided && (
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
              <Detail label={t.fields.requester}>{request.requesterName}</Detail>
              <Detail label={t.purchases.createdOn}>{formatDateTime(request.createdAt)}</Detail>
              <Detail label={t.purchases.neededBy}>{formatDate(request.neededBy)}</Detail>
              <div className="sm:col-span-2"><Detail label={t.purchases.reason}>{request.reason}</Detail></div>
              {request.notes && <div className="sm:col-span-2"><Detail label={t.purchases.note}>{request.notes}</Detail></div>}
              {request.approvedBy && <Detail label={request.status === "Rejected" ? t.purchases.rejectedBy : t.purchases.approvedBy}>{request.approvedByName} · {formatDate(request.approvedAt)}</Detail>}
              {request.rejectReason && <div className="sm:col-span-2"><Detail label={t.purchases.rejectReason}>{request.rejectReason}</Detail></div>}
              {request.receivedAt && <Detail label={t.purchases.receivedOn}>{formatDate(request.receivedAt)}</Detail>}
              {request.receivedBy && <Detail label={t.purchases.receivedBy}>{request.receivedByName}</Detail>}
              {isAdmin && request.transactionId && (
                <Detail label={t.purchases.transaction}>
                  <Link href={`/stock/view?id=${request.transactionId}`} className="text-link hover:underline">{request.transactionNumber}</Link>
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
                {request.lines.map((l, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">
                      {l.itemName}
                      {l.itemId === null && <span className="ml-2 text-sm font-normal text-muted-foreground">{t.purchases.newItemTag}</span>}
                    </TableCell>
                    <TableCell className="tabular text-right">{formatNumber(l.quantity)} {l.unit}</TableCell>
                    {isAdmin && <TableCell className="tabular text-right">{l.currentStock !== undefined ? formatNumber(l.currentStock) : "-"}</TableCell>}
                    {isAdmin && <TableCell className="tabular text-right">{l.minimumStock !== undefined ? formatNumber(l.minimumStock) : "-"}</TableCell>}
                    {isAdmin && <TableCell className="tabular text-right">{l.lastPurchasePrice !== undefined ? formatIDR(l.lastPurchasePrice) : "-"}</TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Progress request={request} who={request.requesterName} />
          {can("approve") && (
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
            if (r.success) toast.success(t.purchases.rejected);
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
            if (r.success) toast.success(t.purchases.cancelled);
            return r;
          }}
        />
      )}
      {dialog === "receive" && <ReceiveDialog request={request} onClose={() => setDialog(null)} />}
    </>
  );
}

function ReceiveDialog({ request, onClose }: { request: PurchaseDto; onClose: () => void }) {
  const suppliers = useGet<SupplierDto[]>("/suppliers", { status: "Active", pageSize: 500, sort: "name:asc" });
  const preferred = request.lines.map((l) => l.preferredSupplierId).find(Boolean);
  const hasNew = request.lines.some((l) => l.newItem);
  const [date, setDate] = useState(today());
  const [supplierId, setSupplierId] = useState(preferred ? String(preferred) : "");
  // One entry per request line, in the same order. New items start without a price.
  const [prices, setPrices] = useState<string[]>(() => request.lines.map((l) => (l.newItem ? "" : String(l.lastPurchasePrice ?? 0))));
  const [minimums, setMinimums] = useState<string[]>(() => request.lines.map(() => ""));
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);

  const total = request.lines.reduce((n, l, i) => n + l.quantity * (/^\d+$/.test(prices[i]) ? Number(prices[i]) : 0), 0);
  const setAt = (list: string[], set: (v: string[]) => void, i: number, v: string) => set(list.map((x, j) => (j === i ? v : x)));

  const submit = async () => {
    const v = validate(receiveSchema, {
      date, supplierId, notes,
      lines: request.lines.map((l, i) => ({ isNew: !!l.newItem, unitPrice: prices[i], minimumStock: minimums[i] })),
    });
    setErrors(v.ok ? {} : v.errors);
    if (!v.ok) return;
    setPending(true);
    const r = await api.purchases.receive(request.id, v.data);
    setPending(false);
    if (!r.success) return setErrors({ ...(r.error.fields ?? {}), _form: r.error.message });
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
            options={(suppliers.data ?? []).map((s) => ({ value: String(s.id), label: s.name }))} />}
        </Field>
      </div>
      {hasNew && (
        <p className="flex items-start gap-2 rounded-lg bg-info-soft px-4 py-3 text-base text-foreground">
          <Info className="mt-0.5 size-5 shrink-0 text-info-icon" aria-hidden="true" />
          {t.purchases.receiveNewItemsNote}
        </p>
      )}
      {request.lines.map((l, i) => (
        <fieldset key={i} className="flex flex-col gap-3 rounded-lg border p-3">
          <legend className="px-1 text-base font-medium">{t.purchases.receiveLineName(l.itemName, l.quantity, l.unit)}</legend>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {l.newItem && (
              <Field label={t.fields.minimumStock} hint={t.items.minimumHint} required error={errors[`lines.${i}.minimumStock`]}>
                {(p) => <Input {...p} inputMode="numeric" value={minimums[i]} onChange={(e) => setAt(minimums, setMinimums, i, e.target.value)} />}
              </Field>
            )}
            <Field label={t.fields.unitPrice} required error={errors[`lines.${i}.unitPrice`]} className="col-span-2 sm:col-span-1">
              {(p) => <Input {...p} inputMode="numeric" value={prices[i]} onChange={(e) => setAt(prices, setPrices, i, e.target.value)} />}
            </Field>
          </div>
        </fieldset>
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

function Progress({ request, who }: { request: PurchaseDto; who: string }) {
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
