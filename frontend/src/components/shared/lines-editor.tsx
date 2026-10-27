"use client";

import { Check, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/shared/form-field";
import { SelectField } from "@/components/shared/select-field";
import { UNITS } from "@/lib/constants";
import { formatIDR } from "@/lib/format";
import type { FieldErrors } from "@/lib/schemas";
import { t } from "@/lib/strings";
import { cn } from "@/lib/utils";
import type { CategoryOption, ItemDto } from "@/lib/api/master";

export interface LineDraft {
  key: number;
  itemId: string;
  quantity: string;
  unitPrice: string;
  /** Purchase requests only: the line describes a new item instead of picking an existing one. */
  isNew: boolean;
  name: string;
  categoryId: string;
  subcategoryId: string;
  unit: string;
}

let counter = 0;
export const newLine = (): LineDraft => ({ key: ++counter, itemId: "", quantity: "", unitPrice: "", isNew: false, name: "", categoryId: "", subcategoryId: "", unit: "" });

export const parseInt0 = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v) : 0);

/**
 * Item lines for incoming stock, outgoing stock and loan requests.
 * mode "in" shows unit price and line total; "out" and "loan" show how many are available;
 * "purchase" lets each line be an existing item or a new one (name, category, subcategory, unit).
 */
export function LinesEditor({
  mode, lines, onChange, errors, items, categories = [], subcategories = [], addLabel = t.stock.addLine,
}: {
  mode: "in" | "out" | "loan" | "purchase";
  lines: LineDraft[];
  onChange: (lines: LineDraft[]) => void;
  errors: FieldErrors;
  /** Items to pick from (from the API). "out" and "loan" lines show the item's `availableForLoan`. */
  items: ItemDto[];
  /** Active categories to choose from for a new item (purchase mode). */
  categories?: CategoryOption[];
  /** Active subcategories for a new item (purchase mode, v12). */
  subcategories?: CategoryOption[];
  addLabel?: string;
}) {
  const update = (key: number, patch: Partial<LineDraft>) =>
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const taken = (key: number) => new Set(lines.filter((l) => l.key !== key && !l.isNew).map((l) => l.itemId));

  return (
    <div className="flex flex-col gap-3">
      {errors.lines && <p role="alert" className="text-sm font-medium text-danger-icon">{errors.lines}</p>}
      {lines.map((line, i) => {
        const item = items.find((x) => String(x.id) === line.itemId);
        const total = parseInt0(line.quantity) * parseInt0(line.unitPrice);
        const options = items.filter((x) => !taken(line.key).has(String(x.id))).map((x) => ({ value: String(x.id), label: x.code && (mode === "in" || mode === "out") ? `${x.name} (${x.code})` : x.name }));
        const remove = (
          <div className="flex sm:col-span-1 sm:mt-[1.625rem] sm:justify-end">
            <Button type="button" variant="outline" size="icon" aria-label={`${t.stock.removeLine} ${i + 1}`} disabled={lines.length === 1}
              onClick={() => onChange(lines.filter((l) => l.key !== line.key))}>
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          </div>
        );
        if (mode === "purchase") {
          return (
            <div key={line.key} className="grid gap-3 rounded-lg border bg-muted/40 p-3 sm:grid-cols-12 sm:items-start">
              <div className="flex items-center justify-between gap-2 sm:col-span-12">
                <div role="group" aria-label={t.purchases.lineKind(i + 1)} className="flex gap-2">
                  {([false, true] as const).map((isNew) => {
                    const on = line.isNew === isNew;
                    return (
                      <button
                        key={String(isNew)}
                        type="button"
                        aria-pressed={on}
                        onClick={() => update(line.key, { isNew })}
                        className={cn(
                          "inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-base font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                          on ? "border-primary bg-info-soft text-foreground" : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
                        )}
                      >
                        {on && <Check className="size-4" aria-hidden="true" />}
                        {isNew ? t.purchases.lineNew : t.purchases.lineExisting}
                      </button>
                    );
                  })}
                </div>
                <Button type="button" variant="outline" size="icon" aria-label={`${t.stock.removeLine} ${i + 1}`} disabled={lines.length === 1}
                  onClick={() => onChange(lines.filter((l) => l.key !== line.key))}>
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </div>
              {line.isNew ? (
                <Field label={t.fields.itemName} required error={errors[`lines.${i}.name`]} hint={t.purchases.newItemHint} className="sm:col-span-8">
                  {(p) => <Input {...p} value={line.name} onChange={(e) => update(line.key, { name: e.target.value })} />}
                </Field>
              ) : (
                <Field label={t.fields.item} required error={errors[`lines.${i}.itemId`]} className="sm:col-span-8">
                  {(p) => <SelectField {...p} value={line.itemId} placeholder={t.stock.selectItem} options={options} onChange={(v) => update(line.key, { itemId: v })} />}
                </Field>
              )}
              <Field label={t.fields.quantity} required error={errors[`lines.${i}.quantity`]} className="sm:col-span-4">
                {(p) => <Input {...p} inputMode="numeric" value={line.quantity} onChange={(e) => update(line.key, { quantity: e.target.value })} />}
              </Field>
              {line.isNew && (
                <>
                  <Field label={t.fields.category} required error={errors[`lines.${i}.categoryId`]} className="sm:col-span-4">
                    {(p) => <SelectField {...p} value={line.categoryId} placeholder={t.purchases.pickCategory} onChange={(v) => update(line.key, { categoryId: v })}
                      options={categories.map((c) => ({ value: String(c.id), label: c.name }))} />}
                  </Field>
                  <Field label={t.fields.subcategory} required error={errors[`lines.${i}.subcategoryId`]} className="sm:col-span-4">
                    {(p) => <SelectField {...p} value={line.subcategoryId} placeholder={t.purchases.pickSubcategory} onChange={(v) => update(line.key, { subcategoryId: v })}
                      options={subcategories.map((c) => ({ value: String(c.id), label: c.name }))} />}
                  </Field>
                  <Field label={t.fields.unit} required error={errors[`lines.${i}.unit`]} className="sm:col-span-4">
                    {(p) => <SelectField {...p} value={line.unit} placeholder={t.purchases.pickUnit} onChange={(v) => update(line.key, { unit: v })}
                      options={UNITS.map((u) => ({ value: u, label: u }))} />}
                  </Field>
                </>
              )}
            </div>
          );
        }
        return (
          <div key={line.key} className="grid gap-3 rounded-lg border bg-muted/40 p-3 sm:grid-cols-12 sm:items-start">
            <Field label={t.fields.item} required error={errors[`lines.${i}.itemId`]} className="sm:col-span-5">
              {(p) => (
                <SelectField {...p} value={line.itemId} placeholder={t.stock.selectItem} options={options}
                  onChange={(v) => {
                    const picked = items.find((x) => String(x.id) === v);
                    update(line.key, { itemId: v, ...(mode === "in" && picked && !line.unitPrice ? { unitPrice: String(picked.lastPurchasePrice ?? 0) } : {}) });
                  }} />
              )}
            </Field>
            <Field
              label={t.fields.quantity} required className={mode === "in" ? "sm:col-span-2" : "sm:col-span-4"}
              error={errors[`lines.${i}.quantity`]}
              hint={(mode === "out" || mode === "loan") && item ? t.stock.availableHint(item.availableForLoan, item.unit) : undefined}
            >
              {(p) => <Input {...p} inputMode="numeric" value={line.quantity} onChange={(e) => update(line.key, { quantity: e.target.value })} />}
            </Field>
            {mode === "in" && (
              <>
                <Field label={t.fields.unitPrice} required error={errors[`lines.${i}.unitPrice`]} className="sm:col-span-2">
                  {(p) => <Input {...p} inputMode="numeric" value={line.unitPrice} onChange={(e) => update(line.key, { unitPrice: e.target.value })} />}
                </Field>
                <Field label={t.fields.lineTotal} className="sm:col-span-2">
                  {(p) => <Input {...p} readOnly tabIndex={-1} value={total ? formatIDR(total) : "-"} className="tabular bg-muted text-right" />}
                </Field>
              </>
            )}
            {remove}
          </div>
        );
      })}
      <Button type="button" variant="outline" className="self-start" onClick={() => onChange([...lines, newLine()])}>
        <Plus className="size-4" aria-hidden="true" />
        {addLabel.replace(/^\+\s*/, "")}
      </Button>
    </div>
  );
}
