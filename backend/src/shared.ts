// One import point for what the backend reuses from the frontend: the UI text (PRD 2.7, one place for all
// messages), fixed options, date helpers and domain types. These files have no imports of their own.
export { t } from "../../frontend/src/lib/strings";
export { UNITS, BACKUP_RETENTION } from "../../frontend/src/lib/constants";
export { today, dayDiff, monthKey } from "../../frontend/src/lib/format";
export type * from "../../frontend/src/lib/types";
