// Locale defaults (PRD 2.7): IDR without decimals, dd/MM/yyyy, Asia/Jakarta.

export const TIME_ZONE = "Asia/Jakarta";

const idr = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});
const num = new Intl.NumberFormat("id-ID");

export const formatIDR = (value: number) => idr.format(value).replace(/\s/g, " ");
export const formatNumber = (value: number) => num.format(value);

const dateParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const timeParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** "2026-10-23" or an ISO timestamp -> "23/10/2026". */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-");
    return `${d}/${m}/${y}`;
  }
  return dateParts.format(new Date(value));
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const d = new Date(value);
  return `${dateParts.format(d)} ${timeParts.format(d)}`;
}

/** Today as "YYYY-MM-DD" in the application time zone. */
export function today(): string {
  const [d, m, y] = dateParts.format(new Date()).split("/");
  return `${y}-${m}-${d}`;
}

/** Date n days from today (negative = past), as "YYYY-MM-DD". */
export function daysFromToday(n: number): string {
  const [y, m, d] = today().split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

/** "2026-10-23" -> "2026-10" */
export const monthKey = (date: string) => date.slice(0, 7);

export function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  const names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${names[Number(m) - 1]} ${y}`;
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

export function formatSize(kb: number): string {
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
}
