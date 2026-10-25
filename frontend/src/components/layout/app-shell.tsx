"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { ChevronsUpDown, LogOut, Menu, Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Logo } from "@/components/shared/logo";
import { NoAccess } from "@/components/shared/states";
import { useMounted } from "@/hooks/use-mounted";
import { initials } from "@/lib/format";
import { canAccess, isActivePath, navGroups } from "@/lib/nav";
import { logout, useCurrentUser, useStore } from "@/lib/mock/store";
import { loanCounts, purchasePending, stockCounts } from "@/lib/queries";
import { t } from "@/lib/strings";
import type { User } from "@/lib/types";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const mounted = useMounted();
  const user = useCurrentUser();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!mounted) return;
    if (!user) router.replace("/login");
    else if (user.mustChangePassword) router.replace("/change-password");
  }, [mounted, user, router]);

  // Close the mobile drawer after navigating.
  useEffect(() => {
    const id = setTimeout(() => setMenuOpen(false), 0);
    return () => clearTimeout(id);
  }, [pathname]);

  if (!mounted || !user || user.mustChangePassword) return <ShellSkeleton />;

  return (
    <div className="flex min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground">
        {t.nav.skipToContent}
      </a>
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-sidebar-border bg-sidebar lg:block">
        <Sidebar user={user} />
      </aside>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-72 gap-0 bg-sidebar p-0" showCloseButton>
          <SheetTitle className="sr-only">{t.nav.mainNav}</SheetTitle>
          <SheetDescription className="sr-only">{t.nav.mainNav}</SheetDescription>
          <Sidebar user={user} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-sidebar-border bg-sidebar px-3 lg:hidden">
          <Button variant="ghost" size="icon" onClick={() => setMenuOpen(true)} aria-label={t.nav.openMenu}>
            <Menu className="size-5" aria-hidden="true" />
          </Button>
          <Logo />
        </div>
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-24 sm:px-6 lg:px-6 lg:pt-8">
          {canAccess(user.role, pathname) ? children : <NoAccess />}
        </main>
      </div>
    </div>
  );
}

function ShellSkeleton() {
  return (
    <div className="flex min-h-screen" role="status" aria-label={t.common.loading}>
      <div className="hidden w-64 shrink-0 border-r border-sidebar-border bg-sidebar p-4 lg:block">
        <Skeleton className="mb-6 h-9 w-40" />
        {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="mb-2 h-10" />)}
      </div>
      <div className="flex-1 p-8"><Skeleton className="mb-6 h-9 w-56" /><Skeleton className="h-64" /></div>
    </div>
  );
}

function Sidebar({ user }: { user: User }) {
  const pathname = usePathname();
  const { db } = useStore();
  const counts = { items: stockCounts(db).attention, loans: loanCounts(db).overdue, purchases: purchasePending(db, user) };
  const showGroupLabels = user.role === "Admin";

  return (
    <div className="flex h-full flex-col text-sidebar-foreground">
      <div className="flex h-16 shrink-0 items-center px-5">
        <Link href="/dashboard" aria-label={`${t.app.name} ${t.app.product}`}><Logo /></Link>
      </div>
      <nav aria-label={t.nav.mainNav} className="flex-1 overflow-y-auto px-3 pb-4">
        {navGroups.map((group, gi) => {
          const entries = group.entries.filter((e) => e.roles.includes(user.role));
          if (entries.length === 0) return null;
          return (
            <div key={gi} className="mt-4 first:mt-0">
              {showGroupLabels && group.label && (
                <p className="px-3 pb-1 text-sm font-semibold tracking-wide text-muted-foreground uppercase">{group.label}</p>
              )}
              <ul className="flex flex-col gap-0.5">
                {entries.map((e) => {
                  const active = isActivePath(pathname, e.href);
                  const badge = user.role === "Admin" && e.badge ? counts[e.badge] : 0;
                  return (
                    <li key={e.href}>
                      <Link
                        href={e.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "relative flex h-10 items-center gap-3 rounded-lg px-3 text-base font-medium transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                          active && "bg-sidebar-active hover:bg-sidebar-active",
                        )}
                      >
                        {active && <span className="absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-r bg-sidebar-active-icon" aria-hidden="true" />}
                        <e.icon className={cn("size-5 shrink-0", active ? "text-sidebar-active-icon" : "text-muted-foreground")} aria-hidden="true" />
                        <span className="flex-1 truncate">{e.label}</span>
                        {badge > 0 && (
                          <span className="min-w-6 rounded-full bg-danger-soft px-1.5 text-center text-sm font-semibold text-foreground">
                            {badge}
                            <span className="sr-only">{t.nav.needsAttention}</span>
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
      <UserMenu user={user} />
    </div>
  );
}

function UserMenu({ user }: { user: User }) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  return (
    <div className="shrink-0 border-t border-sidebar-border p-3">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<button type="button" aria-label={t.user.accountMenu} className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none" />}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-info-soft text-sm font-semibold text-foreground" aria-hidden="true">{initials(user.name)}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-medium">{user.name}</span>
            <span className="block text-sm text-muted-foreground">{user.role}</span>
          </span>
          <ChevronsUpDown className="size-4 text-muted-foreground" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-60">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{t.user.theme}</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
              <DropdownMenuRadioItem value="light"><Sun className="size-4" aria-hidden="true" />{t.user.themeLight}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark"><Moon className="size-4" aria-hidden="true" />{t.user.themeDark}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system"><Monitor className="size-4" aria-hidden="true" />{t.user.themeSystem}</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => { logout(); router.replace("/login"); }}>
            <LogOut className="size-4" aria-hidden="true" />
            {t.user.signOut}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
