import { cn } from "@/lib/utils";
import { t } from "@/lib/strings";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-8 shrink-0", className)}>
      <rect width="32" height="32" rx="8" className="fill-sidebar-active-icon" />
      <g className="fill-background">
        <rect x="9" y="7.5" width="3.6" height="17" rx="1.2" />
        <rect x="9" y="7.5" width="14" height="3.6" rx="1.2" />
        <rect x="9" y="14.2" width="11" height="3.6" rx="1.2" />
        <rect x="9" y="20.9" width="14" height="3.6" rx="1.2" />
      </g>
    </svg>
  );
}

export function Logo({ className, size = "md" }: { className?: string; size?: "md" | "lg" }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark className={size === "lg" ? "size-10" : "size-8"} />
      <span className={cn("leading-none text-foreground", size === "lg" ? "text-2xl" : "text-xl")}>
        <span className="font-extrabold tracking-tight">{t.app.name}</span>{" "}
        <span className="font-light">{t.app.product}</span>
      </span>
    </div>
  );
}
