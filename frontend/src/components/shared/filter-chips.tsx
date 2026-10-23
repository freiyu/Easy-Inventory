import { cn } from "@/lib/utils";

export interface Chip {
  value: string;
  label: string;
  count?: number;
}

/** Status filter row: buttons with counts, so the active filter never relies on color alone. */
export function FilterChips({
  chips, value, onChange, label,
}: { chips: Chip[]; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="mb-4 flex flex-wrap gap-2">
      {chips.map((c) => {
        const on = c.value === value;
        return (
          <button
            key={c.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(c.value)}
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-base font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              on ? "border-primary bg-info-soft text-foreground" : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {c.label}
            {c.count !== undefined && <span className="tabular rounded-full bg-muted px-1.5 text-sm text-foreground">{c.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
