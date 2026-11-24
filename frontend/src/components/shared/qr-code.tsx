import { qrMatrix } from "@/lib/qr";
import { cn } from "@/lib/utils";

const QUIET = 4; // modules of empty space each side, the QR minimum

/**
 * QR code as inline SVG (no network, works in static export).
 * Always black on white, also in dark theme: phone cameras need dark modules on a light field.
 * `label` is the accessible name and is required, so the code is never exposed by default (Staff must not read it).
 * `showText` prints the code under the symbol.
 */
export function QrCode({
  value, label, showText = true, className,
}: { value: string; label: string; showText?: boolean; className?: string }) {
  const matrix = qrMatrix(value);
  if (!matrix) return null;

  const n = matrix.length;
  let d = "";
  matrix.forEach((row, y) => {
    for (let x = 0; x < n; ) {
      if (!row[x]) { x++; continue; }
      let run = 1;
      while (x + run < n && row[x + run]) run++;
      d += `M${x + QUIET} ${y + QUIET}h${run}v1h-${run}z`; // one rectangle per run of dark modules
      x += run;
    }
  });
  const total = n + 2 * QUIET;

  return (
    <figure className={cn("m-0 inline-flex flex-col items-center gap-1 rounded-lg bg-white px-2 py-2 text-black", className)}>
      <svg role="img" aria-label={label} viewBox={`0 0 ${total} ${total}`} shapeRendering="crispEdges" className="aspect-square w-full">
        <path d={d} fill="currentColor" />
      </svg>
      {showText && <figcaption className="tabular text-center break-all text-(length:--text-table)">{value}</figcaption>}
    </figure>
  );
}
