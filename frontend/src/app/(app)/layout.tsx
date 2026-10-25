import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  // Suspense: list pages keep their state in the URL (useSearchParams), which a static export requires.
  return <AppShell><Suspense>{children}</Suspense></AppShell>;
}
