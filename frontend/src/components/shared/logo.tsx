import { cn } from "@/lib/utils";
import { t } from "@/lib/strings";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-8 shrink-0", className)}>
      <rect width="32" height="32" rx="8" className="fill-sidebar-active-icon" />
      {/* Owner's EZI mark, merged into one path on its isometric grid (designs/ezi-design.pen, "EZI Logo (owner mark, final)") */}
      <path
        className="fill-background"
        d="M7.38 9.78L7.38 27.2L18.16 20.98L13.84 18.49L11.69 19.73L13.84 20.98L9.53 23.47L9.53 18.49L16 14.76L13.84 13.51L9.53 16L9.53 11.02L16 7.29L20.31 9.78L16 12.27L18.16 13.51L22.47 11.02L22.47 25.96L24.62 27.2L24.62 9.78L16 4.8Z"
      />
    </svg>
  );
}

export function Logo({ className, size = "md" }: { className?: string; size?: "md" | "lg" }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark className={size === "lg" ? "size-10" : "size-8"} />
      <span className={cn("leading-none text-foreground", size === "lg" ? "text-2xl" : "text-xl")}>
        <span className="font-extrabold tracking-tight">{t.app.name}</span>{" "}
        <span className="font-medium">{t.app.product}</span>
      </span>
    </div>
  );
}
