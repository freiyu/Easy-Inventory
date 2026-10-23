import {
  AlarmClock,
  Ban,
  CheckCheck,
  CircleAlert,
  CircleCheck,
  CircleX,
  Clock,
  FilePen,
  PackageOpen,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { t } from "@/lib/strings";
import type { ActiveStatus, LoanDisplayStatus, Role, StockStatus, StockTxType } from "@/lib/types";

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

const tones: Record<Tone, { bg: string; icon: string }> = {
  success: { bg: "bg-success-soft", icon: "text-success-icon" },
  warning: { bg: "bg-warning-soft", icon: "text-warning-icon" },
  danger: { bg: "bg-danger-soft", icon: "text-danger-icon" },
  info: { bg: "bg-info-soft", icon: "text-info-icon" },
  neutral: { bg: "bg-muted", icon: "text-muted-foreground" },
};

/** One badge style everywhere: soft tint + normal text + colored icon + text label (DESIGN.md). */
export function StatusBadge({
  tone,
  icon: Icon,
  children,
  className,
}: {
  tone: Tone;
  icon: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-sm font-medium whitespace-nowrap text-foreground",
        tones[tone].bg,
        className,
      )}
    >
      <Icon className={cn("size-4 shrink-0", tones[tone].icon)} aria-hidden="true" />
      {children}
    </span>
  );
}

const stockTone: Record<StockStatus, [Tone, LucideIcon]> = {
  Safe: ["success", CircleCheck],
  Low: ["warning", TriangleAlert],
  Out: ["danger", CircleX],
};

/** Staff see Available/Low/Out, Admin sees Safe/Low/Out (intentional, PROGRESS.md). */
export function StockBadge({ status, role = "Admin" }: { status: StockStatus; role?: Role }) {
  const [tone, icon] = stockTone[status];
  const label = role === "Staff" ? t.status.stockStaff[status] : t.status.stockAdmin[status];
  return <StatusBadge tone={tone} icon={icon}>{label}</StatusBadge>;
}

const loanTone: Record<LoanDisplayStatus, [Tone, LucideIcon]> = {
  Draft: ["neutral", FilePen],
  "Pending Approval": ["info", Clock],
  Approved: ["info", CircleCheck],
  Rejected: ["neutral", Ban],
  Borrowed: ["neutral", PackageOpen],
  Completed: ["success", CheckCheck],
  Cancelled: ["neutral", X],
  Overdue: ["danger", AlarmClock],
};

export function LoanBadge({ status }: { status: LoanDisplayStatus }) {
  const [tone, icon] = loanTone[status];
  return <StatusBadge tone={tone} icon={icon}>{t.status.loan[status]}</StatusBadge>;
}

export function ActiveBadge({ status }: { status: ActiveStatus }) {
  return (
    <StatusBadge tone={status === "Active" ? "success" : "neutral"} icon={status === "Active" ? CircleCheck : CircleX}>
      {t.status.active[status]}
    </StatusBadge>
  );
}

export function TxTypeBadge({ type }: { type: StockTxType }) {
  const tone: Record<StockTxType, Tone> = {
    IN: "success", OUT: "warning", ADJUSTMENT: "info", LOAN_ISSUE: "neutral", LOAN_RETURN: "neutral", REVERSAL: "danger",
  };
  return <StatusBadge tone={tone[type]} icon={CircleAlert}>{t.status.txType[type]}</StatusBadge>;
}

export function TxStatusBadge({ status }: { status: "Posted" | "Voided" }) {
  return status === "Posted"
    ? <StatusBadge tone="success" icon={CircleCheck}>{t.status.txStatus.Posted}</StatusBadge>
    : <StatusBadge tone="neutral" icon={Ban}>{t.status.txStatus.Voided}</StatusBadge>;
}

export function RoleBadge({ role }: { role: Role }) {
  return <StatusBadge tone="neutral" icon={CircleCheck}>{role}</StatusBadge>;
}
