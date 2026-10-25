import Link from "next/link";
import { CloudOff, Lock, PackageSearch, type LucideIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/lib/strings";
import type { LoadStatus } from "@/lib/api";

export function StatePanel({
  icon: Icon, title, body, action,
}: { icon: LucideIcon; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <Card className="items-center gap-3 px-6 py-12 text-center">
      <Icon className="size-10 text-muted-foreground" aria-hidden="true" />
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      {body && <p className="max-w-md text-base text-muted-foreground">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </Card>
  );
}

export const EmptyState = (p: { title: string; body?: string; action?: React.ReactNode; icon?: LucideIcon }) => (
  <StatePanel icon={p.icon ?? PackageSearch} title={p.title} body={p.body} action={p.action} />
);

export const ErrorState = ({ onRetry }: { onRetry: () => void }) => (
  <StatePanel
    icon={CloudOff}
    title={t.states.errorTitle}
    body={t.states.errorBody}
    action={<Button variant="outline" onClick={onRetry}>{t.common.retry}</Button>}
  />
);

export const NoAccess = () => (
  <StatePanel
    icon={Lock}
    title={t.states.noAccessTitle}
    body={t.states.noAccessBody}
    action={<Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>{t.states.backToDashboard}</Link>}
  />
);

export const RecordNotFound = ({ backHref, backLabel }: { backHref: string; backLabel: string }) => (
  <StatePanel
    icon={PackageSearch}
    title={t.states.recordNotFound}
    body={t.states.recordNotFoundBody}
    action={<Link href={backHref} className={buttonVariants({ variant: "outline" })}>{backLabel}</Link>}
  />
);

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label={t.common.loading}>
      <div className="flex gap-3">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="hidden h-10 w-40 sm:block" />
      </div>
      <Card className="gap-0 overflow-hidden p-0">
        <Skeleton className="h-11 rounded-none" />
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="border-t px-4 py-3">
            <Skeleton className="h-6 w-full" />
          </div>
        ))}
      </Card>
    </div>
  );
}

export function CardsSkeleton() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label={t.common.loading}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28" />)}
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

/** Shows the loading skeleton, the error panel, or the page content. */
export function LoadGate({
  load, skeleton = <TableSkeleton />, children,
}: {
  load: { status: LoadStatus; retry: () => void };
  skeleton?: React.ReactNode;
  children: React.ReactNode;
}) {
  if (load.status === "loading") return <>{skeleton}</>;
  if (load.status === "error") return <ErrorState onRetry={load.retry} />;
  return <>{children}</>;
}
