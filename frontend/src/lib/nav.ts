import {
  DatabaseBackup, FileBarChart, HandHelping, LayoutDashboard, Package, ScrollText,
  Tags, Truck, UserRound, Users, ArrowLeftRight, Wallet, type LucideIcon,
} from "lucide-react";
import { t } from "./strings";
import type { Role } from "./types";

export interface NavEntry {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
  /** Admin sidebar badges: Items = Low + Out count, Loans = overdue count. */
  badge?: "items" | "loans";
}

export interface NavGroup {
  label?: string;
  entries: NavEntry[];
}

const both: Role[] = ["Admin", "Staff"];
const admin: Role[] = ["Admin"];

// Sidebar per PRD 5.7. Entries a role cannot use are hidden; the backend still enforces access.
export const navGroups: NavGroup[] = [
  { entries: [{ href: "/dashboard", label: t.nav.dashboard, icon: LayoutDashboard, roles: both }] },
  {
    label: t.nav.groupInventory,
    entries: [
      { href: "/items", label: t.nav.items, icon: Package, roles: both, badge: "items" },
      { href: "/categories", label: t.nav.categories, icon: Tags, roles: admin },
      { href: "/suppliers", label: t.nav.suppliers, icon: Truck, roles: admin },
      { href: "/stock", label: t.nav.stock, icon: ArrowLeftRight, roles: admin },
    ],
  },
  {
    label: t.nav.groupOperations,
    entries: [
      { href: "/loans", label: t.nav.loans, icon: HandHelping, roles: both, badge: "loans" },
      { href: "/expenses", label: t.nav.expenses, icon: Wallet, roles: admin },
      { href: "/reports", label: t.nav.reports, icon: FileBarChart, roles: admin },
    ],
  },
  {
    label: t.nav.groupAdmin,
    entries: [
      { href: "/backup", label: t.nav.backup, icon: DatabaseBackup, roles: admin },
      { href: "/users", label: t.nav.users, icon: Users, roles: admin },
      { href: "/activity-log", label: t.nav.activity, icon: ScrollText, roles: admin },
      { href: "/profile", label: t.nav.profile, icon: UserRound, roles: both },
    ],
  },
];

const flat = navGroups.flatMap((g) => g.entries);

export const isActivePath = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

/** Item add/edit and the stock forms are Admin-only even though /items is shared. */
const adminSubpaths = ["/items/new", "/items/edit"];

export function canAccess(role: Role, pathname: string): boolean {
  if (role === "Admin") return true;
  if (adminSubpaths.some((p) => isActivePath(pathname, p))) return false;
  const entry = flat.find((e) => isActivePath(pathname, e.href));
  return !entry || entry.roles.includes(role);
}
