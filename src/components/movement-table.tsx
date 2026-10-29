import Link from "next/link";

import { Badge, type Tone } from "@/components/ui/badge";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { date, money, qty } from "@/lib/format";

const KIND: Record<string, { label: string; tone: Tone }> = {
  receipt: { label: "Receipt", tone: "ok" },
  shipment: { label: "Shipment", tone: "info" },
  adjustment: { label: "Adjustment", tone: "warn" },
};

export interface MovementRow {
  id: number;
  kind: string;
  qty: number;
  value: number;
  reference: string;
  note: string | null;
  occurredOn: string;
  warehouse: string;
  by: string | null;
  productId?: number;
  sku?: string;
  product?: string;
}

/** The stock ledger: append-only, signed quantities and values. */
export function MovementTable({ rows, showProduct }: { rows: MovementRow[]; showProduct?: boolean }) {
  return (
    <Table>
      <THead>
        <tr>
          <TH>Date</TH>
          {showProduct && <TH>Product</TH>}
          <TH>Type</TH>
          <TH>Reference</TH>
          <TH>WH</TH>
          <TH numeric>Qty</TH>
          <TH numeric>Value</TH>
          <TH>By</TH>
        </tr>
      </THead>
      <tbody>
        {rows.map((m) => (
          <TR key={m.id}>
            <TD className="whitespace-nowrap text-muted">{date(m.occurredOn)}</TD>
            {showProduct && (
              <TD>
                <Link href={`/inventory/products/${m.productId}`} className="font-medium hover:text-accent-text">
                  {m.sku}
                </Link>
                <span className="block max-w-56 truncate text-[12px] text-muted">{m.product}</span>
              </TD>
            )}
            <TD>
              <Badge tone={KIND[m.kind]?.tone}>{KIND[m.kind]?.label ?? m.kind}</Badge>
            </TD>
            <TD>
              <span className="font-medium">{m.reference}</span>
              {m.note && <span className="block max-w-56 truncate text-[12px] text-muted">{m.note}</span>}
            </TD>
            <TD className="text-muted">{m.warehouse}</TD>
            <TD numeric className={cn("font-medium", m.qty > 0 ? "text-ok" : "text-text")}>
              {m.qty > 0 ? "+" : "−"}
              {qty(Math.abs(m.qty))}
            </TD>
            <TD numeric className="text-muted">
              {m.value < 0 ? "−" : ""}
              {money(Math.abs(m.value))}
            </TD>
            <TD className="whitespace-nowrap text-muted">{m.by ?? "—"}</TD>
          </TR>
        ))}
      </tbody>
    </Table>
  );
}
