"use client";

import { useState } from "react";

import { ActionForm } from "@/components/action-form";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/cn";
import { qty } from "@/lib/format";
import { adjustStockAction } from "@/server/actions/inventory";

interface Options {
  products: { id: number; sku: string; name: string; unit: string }[];
  warehouses: { id: number; code: string; name: string }[];
  levels: { productId: number; warehouseId: number; onHand: number; reserved: number }[];
}

export function StockCountForm({ options, idem, initialProductId }: { options: Options; idem: string; initialProductId: number | null }) {
  const [productId, setProductId] = useState<number | "">(initialProductId ?? "");
  const [warehouseId, setWarehouseId] = useState(options.warehouses[0]?.id ?? 0);
  const [counted, setCounted] = useState("");
  const level = options.levels.find((l) => l.productId === productId && l.warehouseId === warehouseId);
  const book = level?.onHand ?? 0;
  const reserved = level?.reserved ?? 0;
  const unit = options.products.find((p) => p.id === productId)?.unit ?? "";
  const delta = counted === "" ? null : Number(counted) - book;

  return (
    <ActionForm action={adjustStockAction} idem={idem} className="max-w-2xl">
      <Card>
        <div className="grid gap-4 px-5 py-5 sm:grid-cols-2">
          <Field label="Product" htmlFor="productId" className="sm:col-span-2">
            <Select id="productId" name="productId" required value={productId} onChange={(e) => setProductId(e.target.value ? Number(e.target.value) : "")}>
              <option value="">Select a product…</option>
              {options.products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} · {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Warehouse" htmlFor="warehouseId">
            <Select id="warehouseId" name="warehouseId" value={warehouseId} onChange={(e) => setWarehouseId(Number(e.target.value))}>
              {options.warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} · {w.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Counted quantity" htmlFor="countedQty" hint={productId !== "" ? `Books show ${qty(book)} ${unit}; ${qty(reserved)} reserved for confirmed orders.` : undefined}>
            <Input id="countedQty" name="countedQty" type="number" min={reserved} step={1} required value={counted} onChange={(e) => setCounted(e.target.value)} className="num" />
          </Field>
          {delta !== null && productId !== "" && (
            <p className={cn("rounded-lg px-3 py-2 text-[13px] sm:col-span-2", delta === 0 ? "bg-surface-2 text-muted" : delta > 0 ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn")}>
              {delta === 0 ? "Matches the books. Nothing to post." : `${delta > 0 ? "Gain" : "Shrinkage"} of ${qty(Math.abs(delta))} ${unit} will be posted.`}
            </p>
          )}
          <Field label="Reason" htmlFor="note" className="sm:col-span-2">
            <Textarea id="note" name="note" maxLength={300} placeholder="e.g. Damaged in handling, cycle count variance" />
          </Field>
        </div>
        <div className="flex justify-end border-t border-line px-5 py-3">
          <SubmitButton disabled={productId === "" || delta === 0 || delta === null} pendingLabel="Posting…">
            Post adjustment
          </SubmitButton>
        </div>
      </Card>
    </ActionForm>
  );
}
