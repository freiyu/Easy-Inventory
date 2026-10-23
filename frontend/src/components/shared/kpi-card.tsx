import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

export function KpiCard({
  label, value, caption, icon: Icon,
}: { label: string; value: React.ReactNode; caption?: React.ReactNode; icon: LucideIcon }) {
  return (
    <Card className="gap-1">
      <div className="flex items-start justify-between gap-2 px-5">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
      </div>
      <p className="tabular px-5 text-3xl font-semibold tracking-tight text-foreground">{value}</p>
      {caption && <p className="px-5 text-sm text-muted-foreground">{caption}</p>}
    </Card>
  );
}
