"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/shared/form-field";
import { SelectField } from "@/components/shared/select-field";
import { formatIDR } from "@/lib/format";
import type { FieldErrors } from "@/lib/schemas";
import { t } from "@/lib/strings";
import type { Item } from "@/lib/types";

export interface LineDraft {
  key: number;
  itemId: string;
  quantity: string;
  unitPrice: string;
}

let counter = 0;
export const newLine = (): LineDraft => ({ key: ++counter, itemId: "", quantity: "", unitPrice: "" });

export const parseInt0 = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v) : 0);

/**
 * Item lines for incoming stock, outgoing stock and loan requests.
 * mode "in" shows unit price and line total; "out" and "loan" show how many are available.
 */
export function LinesEditor({
  mode, lines, onChange, errors, items, available, addLabel = t.stock.addLine,
}: {
  mode: "in" | "out" | "loan";
  lines: LineDraft[];
  onChange: (lines: LineDraft[]) => void;
  errors: FieldErrors;
  items: Item[];
  /** Units that can still be taken for an item (stock minus reservations). */
  available?: (item: Item) => number;
  addLabel?: string;
}) {
  const update = (key: number, patch: Partial<LineDraft>) =>
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const taken = (key: number) => new Set(lines.filter((l) => l.key !== key).map((l) => l.itemId));

  return (
    <div className="flex flex-col gap-3">
      {errors.lines && <p role="alert" className="text-sm font-medium text-danger-icon">{errors.lines}</p>}
      {lines.map((line, i) => {
        const item = items.find((x) => String(x.id) === line.itemId);
        const total = parseInt0(line.quantity) * parseInt0(line.unitPrice);
        const options = items.filter((x) => !taken(line.key).has(String(x.id))).map((x) => ({ value: String(x.id), label: mode === "loan" ? x.name : `${x.name} (${x.code})` }));
        return (
          <div key={line.key} className="grid gap-3 rounded-lg border bg-muted/40 p-3 sm:grid-cols-12 sm:items-start">
            <Field label={t.fields.item} required error={errors[`lines.${i}.itemId`]} className="sm:col-span-5">
              {(p) => (
                <SelectField {...p} value={line.itemId} placeholder={t.stock.selectItem} options={options}
                  onChange={(v) => {
                    const picked = items.find((x) => String(x.id) === v);
                    update(line.key, { itemId: v, ...(mode === "in" && picked && !line.unitPrice ? { unitPrice: String(picked.lastPurchasePrice) } : {}) });
                  }} />
              )}
            </Field>
            <Field
              label={t.fields.quantity} required className={mode === "in" ? "sm:col-span-2" : "sm:col-span-4"}
              error={errors[`lines.${i}.quantity`]}
              hint={mode !== "in" && item && available ? t.stock.availableHint(available(item), item.unit) : undefined}
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
            <div className="flex sm:col-span-1 sm:mt-[1.625rem] sm:justify-end">
              <Button type="button" variant="outline" size="icon" aria-label={`${t.stock.removeLine} ${i + 1}`} disabled={lines.length === 1}
                onClick={() => onChange(lines.filter((l) => l.key !== line.key))}>
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </div>
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
