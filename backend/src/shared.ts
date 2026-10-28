// One import point for what the backend reuses from the frontend: the UI text (PRD 2.7, one place for all
// messages), fixed options, date helpers and domain types. These files have no imports of their own.
import { AsyncLocalStorage } from "node:async_hooks";
import { LANGS, type Lang, type Strings } from "../../frontend/src/lib/strings";

// Each API request runs in its caller's language (header X-EZI-Lang, PRD 4.13 v14). `t` resolves the dictionary
// when a text is read, so module-level shortcuts such as `const e = t.errors` still follow the request.
const requestLang = new AsyncLocalStorage<Lang>();
export const runInLang = (lang: Lang, fn: () => void) => requestLang.run(lang, fn);
export const langOf = (header: string | undefined): Lang => (header === "id" ? "id" : "en");
export const currentLang = (): Lang => requestLang.getStore() ?? "en";
export { LANGS, type Lang, type Strings };
const dict = (): Strings => LANGS[currentLang()].t;
export const t = new Proxy({} as Strings, {
  get: (_, section) => new Proxy({}, { get: (_, key) => (dict() as unknown as Record<PropertyKey, Record<PropertyKey, unknown>>)[section][key] }),
});
export { UNITS, BACKUP_RETENTION } from "../../frontend/src/lib/constants";
export { today, dayDiff, monthKey } from "../../frontend/src/lib/format";
export type * from "../../frontend/src/lib/types";
