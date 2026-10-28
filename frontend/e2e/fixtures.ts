// The suite reads the English UI; Bahasa Indonesia is the app default (PRD 4.13 v14). A test that picks a
// language in the user menu keeps it, because the script only fills an empty choice.
import { test as base, type BrowserContext } from "@playwright/test";

export * from "@playwright/test";

export const english = (context: BrowserContext) =>
  context.addInitScript(() => { if (!localStorage.getItem("ezi-lang")) localStorage.setItem("ezi-lang", "en"); });

export const test = base.extend({
  context: async ({ context }, run) => {
    await english(context);
    await run(context);
  },
});
