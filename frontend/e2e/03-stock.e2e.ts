// PRD 10.1 Stock: incoming (supplier required), outgoing (never negative), adjustment with reason, void as reversal.
import { expect, test, type Page } from "@playwright/test";
import { ADMIN_STATE, choose, textbox } from "./helpers";

test.use({ storageState: ADMIN_STATE });
test.describe.configure({ mode: "serial" });

async function stockOf(page: Page, item: string) {
  await page.goto("/items");
  await page.getByRole("link", { name: item }).click();
  return (await page.getByRole("term").filter({ hasText: "Current stock" }).locator("xpath=following-sibling::dd[1]").innerText()).trim();
}

async function voidRow(page: Page, row: RegExp, reason: string) {
  await page.goto("/stock");
  const name = await page.getByRole("button", { name: row }).first().getAttribute("aria-label");
  await page.getByRole("button", { name: name! }).click();
  await page.getByRole("menuitem", { name: "Void transaction" }).click();
  const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog"));
  await dialog.getByRole("textbox").fill(reason);
  await dialog.getByRole("button", { name: /void/i }).click();
  return dialog;
}

test("incoming stock needs a supplier, then adds every line", async ({ page }) => {
  await page.goto("/stock/in");
  await choose(page, "Item", /Speaker Uji/);
  await textbox(page, "Quantity").fill("3");
  await textbox(page, "Unit price (IDR)").fill("200000");
  await page.getByRole("button", { name: "Add another item" }).click();
  await page.getByRole("combobox", { name: "Item" }).nth(1).click();
  await page.getByRole("option", { name: /Kabel HDMI Uji/ }).click();
  await page.getByRole("textbox", { name: "Quantity" }).nth(1).fill("5");
  await page.getByRole("textbox", { name: "Unit price (IDR)" }).nth(1).fill("50000");
  await expect(page.getByText("Rp 850.000")).toBeVisible();

  await page.getByRole("button", { name: "Save incoming stock" }).click();
  await expect(page).toHaveURL(/\/stock\/in/);
  await expect(page.getByText(/supplier/i).filter({ hasText: /select|choose|required/i }).first()).toBeVisible();

  await choose(page, "Supplier", /Toko Contoh/);
  await page.getByRole("button", { name: "Save incoming stock" }).click();
  await expect(page).not.toHaveURL(/\/stock\/in$/);
  expect(await stockOf(page, "Speaker Uji")).toBe("3 pcs");
  await expect(page.getByRole("definition").filter({ hasText: "Rp 200.000" })).toBeVisible();
  expect(await stockOf(page, "Kabel HDMI Uji")).toBe("7 pcs");
});

test("outgoing stock can never go below zero", async ({ page }) => {
  await page.goto("/stock/out");
  await textbox(page, "Destination").fill("Ruang rapat lantai 2");
  await choose(page, "Item", /Kabel HDMI Uji/);
  await textbox(page, "Quantity").fill("100");
  await page.getByRole("button", { name: "Save outgoing stock" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /stock|available|enough/i }).first()).toBeVisible();
  expect(await stockOf(page, "Kabel HDMI Uji")).toBe("7 pcs");

  await page.goto("/stock/out");
  await textbox(page, "Destination").fill("Ruang rapat lantai 2");
  await choose(page, "Item", /Kabel HDMI Uji/);
  await textbox(page, "Quantity").fill("6");
  await page.getByRole("button", { name: "Save outgoing stock" }).click();
  await expect(page).not.toHaveURL(/\/stock\/out$/);
  expect(await stockOf(page, "Kabel HDMI Uji")).toBe("1 pcs");
});

test("a void that would make stock negative is refused", async ({ page }) => {
  const dialog = await voidRow(page, /Actions: IN-/, "Salah input");
  await expect(dialog.getByRole("alert").first()).toBeVisible();
  expect(await stockOf(page, "Kabel HDMI Uji")).toBe("1 pcs");
});

test("adjustment needs a reason and sets the counted stock", async ({ page }) => {
  await page.goto("/stock/adjustment");
  await choose(page, "Item", /Proyektor Uji/);
  await expect(textbox(page, "System stock")).toHaveValue("5 pcs");
  await textbox(page, "Physical stock").fill("6");
  await expect(textbox(page, "Difference")).toHaveValue(/^\+1( pcs)?$/);
  await page.getByRole("button", { name: "Save adjustment" }).click();
  await expect(page).toHaveURL(/\/stock\/adjustment/);
  await textbox(page, "Reason").fill("Stock opname bulanan");
  await page.getByRole("button", { name: "Save adjustment" }).click();
  await expect(page).not.toHaveURL(/\/stock\/adjustment$/);
  expect(await stockOf(page, "Proyektor Uji")).toBe("6 pcs");
});

test("voiding the adjustment posts a reversal and restores the stock", async ({ page }) => {
  await page.goto("/stock");
  const adj = page.getByRole("row", { name: /Stock opname bulanan/ });
  const number = (await adj.getByRole("link").first().innerText()).trim();
  const dialog = await voidRow(page, new RegExp(`Actions: ${number}`), "Hitungan ulang");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("row", { name: new RegExp(number) }).first()).toContainText("Voided");
  expect(await stockOf(page, "Proyektor Uji")).toBe("5 pcs");
  await expect(page.getByRole("row", { name: /Reversal .*REV-/ }).first()).toBeVisible();
});
