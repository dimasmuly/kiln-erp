"use client";

import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { ActionForm } from "@/components/action-form";
import { buttonClass, Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { parseMoneyInput, toMoneyInput } from "@/domain/money";
import { DEFAULT_TAX_RATE_BP, OrderValidationError, priceOrder } from "@/domain/orders";
import { money, qty as formatQty } from "@/lib/format";
import type { ActionResult } from "@/server/actions/result";
import { cn } from "@/lib/cn";

export interface EditorOptions {
  parties: { id: number; label: string }[];
  warehouses: { id: number; label: string }[];
  products: { id: number; sku: string; name: string; unit: string; price: number; available: Record<number, number> }[];
}

export interface EditorInitial {
  id?: number;
  version?: number;
  partyId: number | "";
  warehouseId: number;
  orderDate: string;
  expectedDate?: string;
  taxRateBp: number;
  notes: string;
  lines: { productId: number | ""; qty: string; unitPrice: string }[];
}

const TAX_OPTIONS = [
  { bp: 1100, label: "PPN 11%" },
  { bp: 1200, label: "PPN 12%" },
  { bp: 0, label: "No tax (0%)" },
];

/**
 * Sales and purchase order editor. Totals are computed with the same
 * `priceOrder` domain function the server uses, so what the user sees is
 * exactly what gets saved. The server recomputes anyway and is authoritative.
 */
export function OrderEditor({
  kind,
  action,
  idem,
  initial,
  options,
  cancelHref,
}: {
  kind: "sales" | "purchase";
  action: (prev: ActionResult, form: FormData) => Promise<ActionResult>;
  idem: string;
  initial: EditorInitial;
  options: EditorOptions;
  cancelHref: string;
}) {
  const [header, setHeader] = useState({
    partyId: initial.partyId,
    warehouseId: initial.warehouseId,
    orderDate: initial.orderDate,
    expectedDate: initial.expectedDate ?? "",
    taxRateBp: initial.taxRateBp ?? DEFAULT_TAX_RATE_BP,
    notes: initial.notes,
  });
  const [lines, setLines] = useState(initial.lines.length > 0 ? initial.lines : [{ productId: "" as const, qty: "1", unitPrice: "" }]);
  const productById = useMemo(() => new Map(options.products.map((p) => [p.id, p])), [options.products]);

  const priced = useMemo(() => {
    const filled = lines.filter((l) => l.productId !== "");
    if (filled.length === 0) return { totals: null, error: null };
    try {
      const totals = priceOrder(
        filled.map((l) => {
          const unitAmount = parseMoneyInput(l.unitPrice);
          if (unitAmount === null) throw new OrderValidationError("Enter a valid price on every line.");
          return { productId: Number(l.productId), qty: Number(l.qty), unitAmount };
        }),
        header.taxRateBp,
      );
      return { totals, error: null };
    } catch (err) {
      return { totals: null, error: err instanceof Error ? err.message : String(err) };
    }
  }, [lines, header.taxRateBp]);

  const setLine = (index: number, patch: Partial<(typeof lines)[number]>) => setLines((ls) => ls.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  const chooseProduct = (index: number, value: string) => {
    const product = value ? productById.get(Number(value)) : undefined;
    setLine(index, { productId: product ? product.id : "", unitPrice: product ? toMoneyInput(product.price) : "" });
  };

  const payload = JSON.stringify(lines.filter((l) => l.productId !== "").map((l) => ({ productId: l.productId, qty: l.qty, unitPrice: l.unitPrice })));
  const chosen = new Set(lines.map((l) => l.productId));
  const partyLabel = kind === "sales" ? "Customer" : "Supplier";

  return (
    <ActionForm
      action={action}
      idem={idem}
      hidden={{ id: initial.id ?? "", version: initial.version ?? "", lines: payload, taxRateBp: header.taxRateBp }}
      className="space-y-6"
    >
      <Card>
        <CardHeader title="Details" />
        <div className="grid gap-4 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={partyLabel} htmlFor="partyId" className="sm:col-span-2">
            <Select id="partyId" name="partyId" required value={header.partyId} onChange={(e) => setHeader({ ...header, partyId: e.target.value ? Number(e.target.value) : "" })}>
              <option value="">Select a {partyLabel.toLowerCase()}…</option>
              {options.parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={kind === "sales" ? "Ship from" : "Deliver to"} htmlFor="warehouseId" className="sm:col-span-2">
            <Select id="warehouseId" name="warehouseId" value={header.warehouseId} onChange={(e) => setHeader({ ...header, warehouseId: Number(e.target.value) })}>
              {options.warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Order date" htmlFor="orderDate">
            <Input id="orderDate" name="orderDate" type="date" required value={header.orderDate} onChange={(e) => setHeader({ ...header, orderDate: e.target.value })} />
          </Field>
          {kind === "purchase" && (
            <Field label="Expected delivery" htmlFor="expectedDate">
              <Input id="expectedDate" name="expectedDate" type="date" min={header.orderDate} value={header.expectedDate} onChange={(e) => setHeader({ ...header, expectedDate: e.target.value })} />
            </Field>
          )}
          <Field label="Tax" htmlFor="tax">
            <Select id="tax" value={header.taxRateBp} onChange={(e) => setHeader({ ...header, taxRateBp: Number(e.target.value) })}>
              {TAX_OPTIONS.map((t) => (
                <option key={t.bp} value={t.bp}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Lines" description={kind === "sales" ? "Available = on hand minus stock reserved by confirmed orders, in the selected warehouse." : "Unit cost defaults to the last price paid."} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-line bg-surface-2/60 text-left text-[12px] font-medium tracking-wide text-subtle uppercase">
              <tr>
                <th className="py-2.5 pr-3 pl-5">Product</th>
                <th className="w-28 px-3 py-2.5 text-right">Qty</th>
                <th className="w-44 px-3 py-2.5 text-right">{kind === "sales" ? "Unit price (Rp)" : "Unit cost (Rp)"}</th>
                <th className="w-40 px-3 py-2.5 text-right">Line total</th>
                <th className="w-12 py-2.5 pr-5" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => {
                const product = line.productId === "" ? undefined : productById.get(line.productId);
                const available = product?.available[header.warehouseId] ?? 0;
                const short = kind === "sales" && product && Number(line.qty) > available;
                const unit = parseMoneyInput(line.unitPrice);
                return (
                  <tr key={index} className="border-b border-line last:border-0">
                    <td className="py-2 pr-3 pl-5">
                      <Select aria-label="Product" value={line.productId} onChange={(e) => chooseProduct(index, e.target.value)}>
                        <option value="">Select a product…</option>
                        {options.products.map((p) => (
                          <option key={p.id} value={p.id} disabled={chosen.has(p.id) && p.id !== line.productId}>
                            {p.sku} · {p.name}
                          </option>
                        ))}
                      </Select>
                      {kind === "sales" && product && (
                        <p className={cn("mt-1 text-[12px]", short ? "text-bad" : "text-muted")}>
                          {formatQty(available)} {product.unit} available{short ? " — confirming this order will fail until stock arrives" : ""}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Input aria-label="Quantity" type="number" min={1} step={1} inputMode="numeric" className="num text-right" value={line.qty} onChange={(e) => setLine(index, { qty: e.target.value })} />
                    </td>
                    <td className="px-3 py-2">
                      <Input aria-label="Unit amount" type="number" min={0} step="0.01" inputMode="decimal" className="num text-right" value={line.unitPrice} onChange={(e) => setLine(index, { unitPrice: e.target.value })} />
                    </td>
                    <td className="num px-3 py-2 text-right whitespace-nowrap">{unit !== null && Number(line.qty) > 0 ? money(unit * Number(line.qty)) : "—"}</td>
                    <td className="py-2 pr-5 text-right">
                      <Button type="button" variant="ghost" size="sm" aria-label="Remove line" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, i) => i !== index))}>
                        <Trash2 />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-4 border-t border-line px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
          <Button type="button" size="sm" onClick={() => setLines((ls) => [...ls, { productId: "", qty: "1", unitPrice: "" }])}>
            <Plus /> Add line
          </Button>
          <dl className="num w-full max-w-xs space-y-1.5 text-sm">
            <div className="flex justify-between text-muted">
              <dt>Subtotal</dt>
              <dd>{priced.totals ? money(priced.totals.subtotal) : "—"}</dd>
            </div>
            <div className="flex justify-between text-muted">
              <dt>{TAX_OPTIONS.find((t) => t.bp === header.taxRateBp)?.label ?? "Tax"}</dt>
              <dd>{priced.totals ? money(priced.totals.tax) : "—"}</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-1.5 text-base font-semibold">
              <dt>Total</dt>
              <dd>{priced.totals ? money(priced.totals.total) : "—"}</dd>
            </div>
          </dl>
        </div>
      </Card>

      {priced.error && <Alert tone="warn">{priced.error}</Alert>}

      <Card>
        <div className="px-5 py-4">
          <Field label="Notes" htmlFor="notes" hint="Visible on the document. Optional.">
            <Textarea id="notes" name="notes" maxLength={1000} value={header.notes} onChange={(e) => setHeader({ ...header, notes: e.target.value })} />
          </Field>
        </div>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Link href={cancelHref} className={buttonClass({ variant: "ghost" })}>
          Cancel
        </Link>
        <SubmitButton disabled={!priced.totals || header.partyId === ""} pendingLabel="Saving…">
          {initial.id ? "Save changes" : "Create draft"}
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
