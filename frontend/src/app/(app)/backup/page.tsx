"use client";

import { useState } from "react";
import { Archive, CalendarClock, HardDrive, Info, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { CircleCheck, Hand, RefreshCw } from "lucide-react";

const kindIcon = { Automatic: RefreshCw, Manual: Hand, "Before update": CircleCheck } as const;

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
    { id: "file", header: t.backup.colFile, cell: (b) => <span className="tabular font-medium break-all">{b.fileName}</span>, sortable: true },
    { id: "created", header: t.backup.colCreated, cell: (b) => <span className="tabular">{formatDateTime(b.createdAt)}</span>, sortable: true },
    { id: "kind", header: t.backup.colType, cell: (b) => <StatusBadge tone="neutral" icon={kindIcon[b.kind]}>{t.backup.kinds[b.kind]}</StatusBadge>, sortable: true },
    { id: "size", header: t.backup.colSize, cell: (b) => formatSize(b.sizeKb), numeric: true, sortable: true },
    { id: "download", header: t.backup.download, cell: (b) => <Button variant="link" className="h-auto p-0" aria-label={`${t.backup.download} ${b.fileName}`} onClick={() => toast.info(t.backup.downloadMocked)}>{t.backup.download}</Button> },
  ];

  return (
    <>
      <PageHeader title={t.backup.title} description={t.backup.description} actions={<Button disabled={busy} onClick={create}>{busy ? t.backup.creating : t.backup.backupNow}</Button>} />
      <p role="note" className="mb-6 flex items-start gap-2 rounded-lg bg-warning-soft px-4 py-3 text-base text-foreground">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warning-icon" aria-hidden="true" />
        {t.backup.warning}
      </p>
      <LoadGate load={list}>
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <KpiCard label={t.backup.lastBackup} value={latest ? formatDateTime(latest.createdAt) : "-"} caption={t.backup.lastCaption} icon={CalendarClock} />
          <KpiCard label={t.backup.kept} value={`${total} of ${BACKUP_RETENTION}`} caption={t.backup.keptCaption(BACKUP_RETENTION)} icon={Archive} />
          <KpiCard label={t.backup.latestSize} value={latest ? formatSize(latest.sizeKb) : "-"} icon={HardDrive} />
        </div>
        <h2 className="mb-3 text-lg font-semibold">{t.backup.available}</h2>
        <DataTable
          caption={t.backup.available}
          {...tableProps(list, lp)}
          columns={columns}
          rowKey={(b) => b.id}
          rowLabel={(b) => b.fileName}
          empty={<EmptyState title={t.backup.emptyTitle} body={t.backup.emptyBody} action={<Button onClick={create}>{t.backup.backupNow}</Button>} />}
        />
        <p className="mt-4 flex items-start gap-2 rounded-lg bg-info-soft px-4 py-3 text-base text-foreground">
          <Info className="mt-0.5 size-5 shrink-0 text-info-icon" aria-hidden="true" />
          {t.backup.restoreNote}
        </p>
      </LoadGate>
    </>
  );
}
