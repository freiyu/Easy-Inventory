"use client";

import { ThemeProvider as NextThemes } from "next-themes";

// System by default; the choice is stored on this device and applied before first paint (DESIGN.md).
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemes attribute="class" defaultTheme="system" enableSystem storageKey="ezi-theme">
      {children}
    </NextThemes>
  );
}
