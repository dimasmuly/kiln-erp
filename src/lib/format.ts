import { MINOR_UNITS } from "@/domain/money";

const idr = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const idrPrecise = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 2 });
const idrCompact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat("id-ID");
const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const dateShort = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jakarta",
});

/** Rp 1.250.000 — whole rupiah for overviews. */
export function money(minor: number): string {
  return idr.format(minor / MINOR_UNITS);
}

/** Rp 1.250.000,50 — exact to the sen, for ledgers. */
export function moneyPrecise(minor: number): string {
  return idrPrecise.format(minor / MINOR_UNITS);
}

/** Rp 1.3B — for KPI tiles and chart axes. */
export function moneyCompact(minor: number): string {
  return `Rp ${idrCompact.format(minor / MINOR_UNITS)}`;
}

export function qty(n: number): string {
  return integer.format(n);
}

/** ISO `YYYY-MM-DD` → "29 Oct 2026". */
export function date(iso: string | null | undefined): string {
  return iso ? dateFmt.format(new Date(`${iso}T00:00:00Z`)) : "—";
}

export function dateShortLabel(iso: string): string {
  return dateShort.format(new Date(`${iso}T00:00:00Z`));
}

export function dateTime(at: Date | number | string): string {
  return dateTimeFmt.format(new Date(at));
}

export function percent(ratio: number, digits = 1): string {
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function relative(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

export function titleCase(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
