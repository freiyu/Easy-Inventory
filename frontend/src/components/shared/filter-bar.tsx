import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { t } from "@/lib/strings";

export function SearchBox({
  value, onChange, placeholder, label = placeholder,
}: { value: string; onChange: (v: string) => void; placeholder: string; label?: string }) {
  return (
    <div className="relative w-full sm:w-80">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="pl-9"
      />
    </div>
  );
}

export function FilterBar({
  children, dirty, onClear,
}: { children: React.ReactNode; dirty: boolean; onClear: () => void }) {
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3">
      {children}
      {dirty && (
        <Button variant="ghost" onClick={onClear}>
          <X className="size-4" aria-hidden="true" />
          {t.common.clear}
        </Button>
      )}
    </div>
  );
}
