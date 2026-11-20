import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

export function KpiCard({
  label, value, caption, icon: Icon,
}: { label: string; value: React.ReactNode; caption?: React.ReactNode; icon: LucideIcon }) {
  return (
    <Card size="sm" className="gap-1">
      <div className="flex items-start justify-between gap-2 px-4">
        <p className="text-(length:--text-table) text-muted-foreground">{label}</p>
        <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
      </div>
      <p className="tabular px-4 text-(length:--text-kpi) leading-tight font-(weight:--weight-strong) text-foreground">{value}</p>
      {caption && <p className="px-4 text-(length:--text-table) text-muted-foreground">{caption}</p>}
    </Card>
  );
}
