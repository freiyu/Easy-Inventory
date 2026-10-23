import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "./globals.css";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { DemoTools } from "@/components/layout/demo-tools";
import { Toaster } from "@/components/ui/sonner";
import { t } from "@/lib/strings";

export const metadata: Metadata = {
  title: `${t.app.name} ${t.app.product}`,
  description: t.app.tagline,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen">
        <ThemeProvider>
          {children}
          <Toaster position="bottom-center" />
          <DemoTools />
        </ThemeProvider>
      </body>
    </html>
  );
}
