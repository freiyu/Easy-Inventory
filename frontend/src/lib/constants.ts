// Fixed options shared by forms and filters.
export const UNITS = ["pcs", "box", "pack", "unit", "ream", "bottle", "set", "roll", "pair"];

/** Fixed configuration (PRD 4.13). Shown as plain text; there is no Settings page. */
export const BACKUP_RETENTION = 14;

/** Item photo rules (v1.2). The server checks the same limits again, and the file type from the file's own bytes. */
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024;
