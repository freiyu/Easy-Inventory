import { code128Widths } from "@/lib/code128";
import { cn } from "@/lib/utils";

const QUIET = 10; // modules of empty space each side, the Code 128 minimum

/**
 * Code 128 barcode as inline SVG (no network, works in static export).
 * Always black on white, also in dark theme: scanners need dark bars on a light field.
 * `label` is the accessible name; pass it without the code when the code must not be exposed.
 * `showText` prints the code under the bars.
 */
export function Barcode({
  value, label, showText = true, className,
}: { value: string; label?: string; showText?: boolean; className?: string }) {
  const widths = code128Widths(value);
  if (!widths) return showText && value ? <p className={cn("tabular text-(length:--text-table)", className)}>{value}</p> : null;

  let x = QUIET;
  let d = "";
  widths.forEach((w, i) => {
    if (i % 2 === 0) d += `M${x} 0h${w}v1h-${w}z`; // even index = bar, odd = space
    x += w;
  });
  const total = x + QUIET;

  return (
    <figure className={cn("m-0 inline-flex flex-col items-center gap-1 rounded-lg bg-white px-2 py-2 text-black", className)}>
      <svg
        role="img"
        aria-label={label ?? value}
        viewBox={`0 0 ${total} 1`}
        preserveAspectRatio="none"
        shapeRendering="crispEdges"
        className="h-14 w-full"
      >
        <path d={d} fill="currentColor" />
      </svg>
      {showText && <figcaption className="tabular text-(length:--text-table)">{value}</figcaption>}
    </figure>
  );
}
