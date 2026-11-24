"use client";

import { useState } from "react";
import { Archive, CalendarClock, CircleCheck, Hand, Info, RefreshCw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { UpdateNowButton } from "@/components/layout/update-notice";
import { useUpdate } from "@/components/layout/update-context";
import { DownloadButton } from "@/components/shared/download-button";
import { DataTable, type Column } from "@/components/shared/data-table";
import { KpiCard } from "@/components/shared/kpi-card";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState, LoadGate } from "@/components/shared/states";
import { api, tableProps, useGet, useListParams } from "@/lib/api";
import { BACKUP_RETENTION } from "@/lib/constants";
import { formatDateTime, formatSize } from "@/lib/format";
import { t } from "@/lib/strings";
import type { BackupFile } from "@/lib/types";

/** Program updates: the installed and newest versions, the automatic-update switch and "Update now". */
function UpdateCard() {
  const u = useUpdate();
  const [busy, setBusy] = useState(false);
  if (!u?.info) return null;
  const { info, view } = u;
  const toggle = async (on: boolean) => {
    setBusy(true);
    const r = await u.setAuto(on);
    setBusy(false);
    if (r.success) toast.success(on ? t.update.autoOn : t.update.autoOff);
    else toast.error(r.error.message);
  };
  return (
    <Card size="sm" className="mb-6 gap-3">
      <h2 className="px-4 text-(length:--text-section) leading-tight font-(weight:--weight-strong)">{t.update.cardTitle}</h2>
      <dl className="grid gap-x-6 gap-y-3 px-4 sm:grid-cols-3">
        <div>
          <dt className="text-(length:--text-table) text-muted-foreground">{t.update.installed}</dt>
          <dd className="tabular text-(length:--text-body) font-(weight:--weight-strong)">{info.current}</dd>
        </div>
        <div>
          <dt className="text-(length:--text-table) text-muted-foreground">{t.update.newest}</dt>
          <dd className="tabular text-(length:--text-body) font-(weight:--weight-strong)">{info.latest ?? t.update.notChecked}</dd>
        </div>
        <div>
          <dt className="sr-only">{t.update.cardTitle}</dt>
          <dd className="text-(length:--text-table) text-muted-foreground">{info.checkedAt ? t.update.checked(formatDateTime(info.checkedAt)) : t.update.notChecked}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 basis-72 items-start gap-3">
          <Checkbox id="auto-update" checked={info.autoEnabled} disabled={busy} onCheckedChange={(on) => void toggle(on === true)} className="mt-0.5" />
          <div className="min-w-0">
            <Label htmlFor="auto-update" className="leading-snug">{t.update.autoLabel}</Label>
            <p className="mt-1 text-(length:--text-table) text-muted-foreground">{t.update.autoHelp}</p>
          </div>
        </div>
        {view.kind === "available" || (view.kind === "failed" && info.latest)
          ? <UpdateNowButton version={info.latest ?? ""} />
          : !info.available && <p className="text-(length:--text-table) text-muted-foreground">{t.update.upToDate}</p>}
      </div>
    </Card>
  );
}

const kindIcon = { Automatic: RefreshCw, Manual: Hand, "Before update": CircleCheck, "Before import": CircleCheck, "Before restore": CircleCheck } as const;

export default function BackupPage() {
  const lp = useListParams({ sort: "created:desc" });
  const list = useGet<BackupFile[]>("/backup/database", lp.params);
  // The newest file and the total, whatever page or sort the table shows.
  const newest = useGet<BackupFile[]>("/backup/database", { pageSize: 1, sort: "created:desc" });
  const [busy, setBusy] = useState(false);
  const latest = newest.data?.[0];
  const total = newest.meta?.total ?? 0;

  const create = async () => {
    setBusy(true);
    const r = await api.backup.create();
    setBusy(false);
    if (r.success) toast.success(t.backup.created(r.data.fileName));
    else toast.error(r.error.message);
  };

  const columns: Column<BackupFile>[] = [
    { id: "file", header: t.backup.colFile, cell: (b) => <span className="tabular font-(weight:--weight-strong) break-all">{b.fileName}</span>, sortable: true },
    { id: "created", header: t.backup.colCreated, cell: (b) => <span className="tabular">{formatDateTime(b.createdAt)}</span>, sortable: true },
    { id: "kind", header: t.backup.colType, cell: (b) => <StatusBadge tone="neutral" icon={kindIcon[b.kind]}>{t.backup.kinds[b.kind]}</StatusBadge>, sortable: true },
    { id: "size", header: t.backup.colSize, cell: (b) => formatSize(b.sizeKb), numeric: true, sortable: true },
    { id: "download", header: t.backup.download, cell: (b) => <DownloadButton variant="link" className="h-auto p-0" aria-label={`${t.backup.download} ${b.fileName}`} run={() => api.backup.download(b.id)} label={t.backup.download} busyLabel={t.backup.downloading} /> },
  ];

  return (
    <>
      <PageHeader title={t.backup.title} description={t.backup.description} actions={<Button disabled={busy} onClick={create}>{busy ? t.backup.creating : t.backup.backupNow}</Button>} />
      <p role="note" className="mb-6 flex items-start gap-2 rounded-lg bg-warning-soft px-4 py-3 text-(length:--text-body) text-foreground">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warning-icon" aria-hidden="true" />
        {t.backup.warning}
      </p>
      <UpdateCard />
      <LoadGate load={list}>
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <KpiCard label={t.backup.lastBackup} value={latest ? formatDateTime(latest.createdAt) : "-"} caption={t.backup.lastCaption} icon={CalendarClock} />
          <KpiCard label={t.backup.kept} value={t.backup.keptValue(total, BACKUP_RETENTION)} caption={t.backup.keptCaption(BACKUP_RETENTION)} icon={Archive} />
        </div>
        <h2 className="mb-3 text-(length:--text-section) leading-tight font-(weight:--weight-strong)">{t.backup.available}</h2>
        <DataTable
          caption={t.backup.available}
          {...tableProps(list, lp)}
          columns={columns}
          rowKey={(b) => b.id}
          rowLabel={(b) => b.fileName}
          empty={<EmptyState title={t.backup.emptyTitle} body={t.backup.emptyBody} action={<Button onClick={create}>{t.backup.backupNow}</Button>} />}
        />
        <p className="mt-4 flex items-start gap-2 rounded-lg bg-info-soft px-4 py-3 text-(length:--text-body) text-foreground">
          <Info className="mt-0.5 size-5 shrink-0 text-info-icon" aria-hidden="true" />
          {t.backup.restoreNote}
        </p>
      </LoadGate>
    </>
  );
}
