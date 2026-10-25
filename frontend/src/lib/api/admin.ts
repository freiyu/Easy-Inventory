// Dashboard, expenses, reports, users, activity log and backup (PRD 4.1, 4.7 to 4.12, 6.6).
// The module owner extends this file; `Badges` is already used by the app shell.

/** Sidebar badges for Admin (PRD 5.7): items needing attention, overdue loans, purchase requests waiting for this Admin. */
export interface Badges {
  items: number;
  loans: number;
  purchases: number;
}
