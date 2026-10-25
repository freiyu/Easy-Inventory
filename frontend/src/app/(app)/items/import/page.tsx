"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { CircleCheck, CircleX, Download, SkipForward } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Field } from "@/components/shared/form-field";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { api } from "@/lib/api";
import type { ImportReportDto, ImportRowDto } from "@/lib/api/master";
import { formatNumber } from "@/lib/format";
import { t } from "@/lib/strings";

const c = t.itemImport;
const COLUMNS = "name,category,unit,opening_stock,minimum_stock,price,supplier,location,notes";

/** The one official template: header plus one example row (PRD 4.10). */
function downloadTemplate() {
  const csv = `${COLUMNS}\r\n${c.templateExample},Stationery,box,10,5,38000,,Cabinet B2,\r\n`;
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = c.templateFile;
  a.click();
  URL.revokeObjectURL(url);
}

const badge: Record<ImportRowDto["status"], { tone: "success" | "neutral" | "danger"; icon: typeof CircleCheck; label: string }> = {
  ready: { tone: "success", icon: CircleCheck, label: c.statusReady },
  imported: { tone: "success", icon: CircleCheck, label: c.statusImported },
  skipped: { tone: "neutral", icon: SkipForward, label: c.statusSkipped },
  error: { tone: "danger", icon: CircleX, label: c.statusError },
};

export default function ImportItemsPage() {
  const input = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState("");
  const [report, setReport] = useState<ImportReportDto | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"reading" | "importing" | null>(null);
  const [done, setDone] = useState(false);

  const reset = () => {
    setCsv(""); setReport(null); setError(""); setDone(false);
    if (input.current) input.current.value = "";
  };

  const choose = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReport(null); setError(""); setDone(false); setBusy("reading");
    const text = await file.text();
    const r = await api.items.importPreview(text);
    setBusy(null);
    if (r.success) { setCsv(text); setReport(r.data); } else setError(r.error.fields?.csv ?? r.error.message);
  };

  const confirm = async () => {
    setBusy("importing"); setError("");
    const r = await api.items.importConfirm(csv);
    setBusy(null);
    if (!r.success) return setError(r.error.fields?.csv ?? r.error.message);
    setReport(r.data); setDone(true);
    toast.success(c.done(r.data.created));
  };

  return (
    <>
      <PageHeader title={c.title} description={c.desc} crumbs={[{ label: t.nav.items, href: "/items" }, { label: c.crumb }]} />
      <div className="flex flex-col gap-6">
        <Card className="gap-4">
          <div className="flex flex-col gap-1 px-5">
            <h2 className="text-lg font-semibold">{c.howTitle}</h2>
            <p className="text-base text-muted-foreground">{c.howBody}</p>
            <p className="text-sm text-muted-foreground">{c.required}</p>
          </div>
          <div className="px-5">
            <Button type="button" variant="outline" onClick={downloadTemplate}>
              <Download className="size-4" aria-hidden="true" />
              {c.template}
            </Button>
          </div>
        </Card>

        <Card className="gap-4">
          <h2 className="px-5 text-lg font-semibold">{c.chooseTitle}</h2>
          <div className="flex flex-col gap-3 px-5">
            <Field label={c.fileLabel} error={error}>
              {(p) => <Input {...p} ref={input} type="file" accept=".csv,text/csv" disabled={busy !== null || done} onChange={choose} className="max-w-md" />}
            </Field>
            {busy === "reading" && <p role="status" className="text-sm text-muted-foreground">{c.reading}</p>}
          </div>
        </Card>

        {report && (
          <Card className="gap-4 overflow-hidden">
            <div className="flex flex-col gap-3 px-5">
              <h2 className="text-lg font-semibold">{c.previewTitle}</h2>
              <p role="status" className="flex flex-wrap items-center gap-2 text-base">
                {done
                  ? <StatusBadge tone="success" icon={CircleCheck}>{c.done(report.created)}</StatusBadge>
                  : <StatusBadge tone="success" icon={CircleCheck}>{c.summaryReady(report.ready)}</StatusBadge>}
                <StatusBadge tone="neutral" icon={SkipForward}>{c.summarySkipped(report.skipped)}</StatusBadge>
                <StatusBadge tone="danger" icon={CircleX}>{c.summaryErrors(report.errors)}</StatusBadge>
              </p>
              <p className="text-sm text-muted-foreground">{c.backupNote}</p>
            </div>
            <div className="overflow-x-auto border-y">
              <Table style={{ minWidth: "720px" }}>
                <caption className="sr-only">{c.caption}</caption>
                <TableHeader>
                  <TableRow className="hover:bg-muted">
                    <TableHead>{c.colLine}</TableHead>
                    <TableHead>{c.colName}</TableHead>
                    <TableHead>{c.colCategory}</TableHead>
                    <TableHead>{c.colUnit}</TableHead>
                    <TableHead className="text-right">{c.colStock}</TableHead>
                    <TableHead>{c.colResult}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.rows.map((r) => {
                    const b = badge[r.status];
                    return (
                      <TableRow key={r.line}>
                        <TableCell className="tabular">{r.line}</TableCell>
                        <TableCell className="font-medium">{r.name || "-"}</TableCell>
                        <TableCell>{r.category || "-"}</TableCell>
                        <TableCell>{r.unit || "-"}</TableCell>
                        <TableCell className="tabular text-right">{formatNumber(r.openingStock)}</TableCell>
                        <TableCell>
                          <div className="flex flex-col items-start gap-1">
                            <StatusBadge tone={b.tone} icon={b.icon}>{b.label}</StatusBadge>
                            {r.message && <span className="text-sm text-muted-foreground">{r.message}</span>}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="flex flex-wrap justify-end gap-2 px-5">
              {done ? (
                <Link href="/items" className={buttonVariants()}>{c.backToItems}</Link>
              ) : (
                <>
                  <Button type="button" variant="outline" disabled={busy !== null} onClick={reset}>{c.another}</Button>
                  <Button type="button" disabled={busy !== null || report.ready === 0} onClick={confirm}>
                    {busy === "importing" ? c.confirming : c.confirm(report.ready)}
                  </Button>
                </>
              )}
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
