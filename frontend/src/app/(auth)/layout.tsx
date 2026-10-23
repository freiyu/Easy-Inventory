import { Logo } from "@/components/shared/logo";
import { t } from "@/lib/strings";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-12">
      <Logo size="lg" />
      <div className="w-full max-w-md">{children}</div>
      <p className="max-w-md text-center text-sm text-muted-foreground">{t.app.offlineNote}</p>
    </main>
  );
}
