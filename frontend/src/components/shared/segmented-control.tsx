"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { SelectField } from "@/components/shared/select-field";
import { cn } from "@/lib/utils";

export interface Chip {
  value: string;
  label: string;
  count?: number;
}

interface PillBox { x: number; y: number; w: number; h: number }

/**
 * Status filter as one segmented control with a single moving pill (PRD_REDESIGN.md 10.4). The pill only gets its
 * position and size from measuring the active button; the move itself is a CSS transition (.ezi-pill), so a click
 * during a move redirects it from where it is. Counts stay visible and the active option is also marked by
 * aria-pressed and the pill, never by colour alone. Below 640 px it is a dropdown with the same options.
 */
export function SegmentedControl({
  chips, value, onChange, label,
}: { chips: Chip[]; value: string; onChange: (v: string) => void; label: string }) {
  const root = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<PillBox | null>(null);
  // The first measurement is placed without a transition so the pill does not slide in from the corner.
  const [ready, setReady] = useState(false);

  const measure = useCallback(() => {
    const el = root.current?.querySelector<HTMLElement>("[aria-pressed='true']");
    // Hidden below 640 px (display:none) the box is 0x0; keep the last good measurement until it shows again.
    if (!el) return setBox(null);
    if (el.offsetWidth === 0) return;
    setBox((b) => (b && b.x === el.offsetLeft && b.y === el.offsetTop && b.w === el.offsetWidth && b.h === el.offsetHeight
      ? b : { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight }));
  }, []);

  // Re-measure after every render: the value, a count or the language can change an option's width.
  useLayoutEffect(measure);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);
  useLayoutEffect(() => {
    if (box && !ready) {
      const id = requestAnimationFrame(() => setReady(true));
      return () => cancelAnimationFrame(id);
    }
  }, [box, ready]);

  return (
    <div className="mb-4">
      <div className="sm:hidden">
        <SelectField
          aria-label={label}
          value={value}
          onChange={onChange}
          options={chips.map((c) => ({ value: c.value, label: c.count === undefined ? c.label : `${c.label} (${c.count})` }))}
        />
      </div>
      <div
        ref={root}
        role="group"
        aria-label={label}
        className="relative hidden w-fit flex-wrap gap-0.5 rounded-lg bg-muted p-0.5 sm:flex"
      >
        {box && (
          <span
            aria-hidden="true"
            data-ready={ready}
            className="ezi-pill pointer-events-none absolute top-0 left-0 rounded-md border border-border bg-background"
            style={{ translate: `${box.x}px ${box.y}px`, width: box.w, height: box.h }}
          />
        )}
        {chips.map((c) => {
          const on = c.value === value;
          return (
            <button
              key={c.value}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(c.value)}
              className={cn(
                "relative inline-flex h-8 items-center gap-2 rounded-md px-3 text-(length:--text-label) font-(weight:--weight-strong) transition-colors duration-(--duration-hover) ease-(--ease-out) focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                on ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {c.label}
              {c.count !== undefined && (
                <span className={cn("tabular rounded-full px-1.5 text-(length:--text-table) font-(weight:--weight-regular) text-foreground", on ? "bg-muted" : "bg-accent")}>{c.count}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
