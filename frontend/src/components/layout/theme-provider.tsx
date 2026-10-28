"use client";

import { useEffect } from "react";
import { ThemeProvider as NextThemes } from "next-themes";
import { storedLang } from "@/lib/strings";

// System by default; the choice is stored on this device and applied before first paint (DESIGN.md).
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // The static HTML says lang="id" (the default); follow the language this browser chose.
  useEffect(() => { document.documentElement.lang = storedLang(); }, []);
  return (
    <NextThemes attribute="class" defaultTheme="system" enableSystem storageKey="ezi-theme">
      {children}
    </NextThemes>
  );
}
