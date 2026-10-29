/**
 * Money is an integer number of minor units (sen for IDR, 1 IDR = 100 sen).
 * Never a float: every amount that reaches the database or the ledger goes
 * through these helpers, so rounding happens in exactly one place.
 */
export type Money = number;

export const MINOR_UNITS = 100;

export function assertMoney(value: number, label = "amount"): asserts value is Money {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be an integer number of minor units, got ${value}`);
  }
}

/**
 * `a * b / c`, rounded half away from zero, without intermediate overflow or
 * float error. Used for tax (subtotal × basis points / 10 000) and for
 * proportional inventory costing (value × qty / onHand).
 */
export function mulDivRound(a: number, b: number, c: number): number {
  if (c === 0) throw new RangeError("division by zero");
  const n = BigInt(a) * BigInt(b);
  const d = BigInt(c);
  const negative = n < 0n !== d < 0n;
  const absN = n < 0n ? -n : n;
  const absD = d < 0n ? -d : d;
  const q = (absN * 2n + absD) / (absD * 2n);
  return Number(negative ? -q : q);
}

/**
 * Parses user input in major units ("1250000", "1250000.5") into minor units.
 * Rejects anything that is not a plain non-negative decimal with at most two
 * fractional digits, instead of guessing at locale separators.
 */
export function parseMoneyInput(input: string): Money | null {
  const trimmed = input.trim();
  if (!/^\d{1,13}(\.\d{1,2})?$/.test(trimmed)) return null;
  const [whole, fraction = ""] = trimmed.split(".");
  return Number(whole) * MINOR_UNITS + Number(fraction.padEnd(2, "0"));
}

/** Minor units → major-unit string suitable for an `<input type="number">`. */
export function toMoneyInput(value: Money): string {
  const whole = Math.trunc(value / MINOR_UNITS);
  const fraction = Math.abs(value % MINOR_UNITS);
  return fraction === 0 ? String(whole) : `${whole}.${String(fraction).padStart(2, "0")}`;
}

export function sum(values: readonly number[]): number {
  let total = 0;
  for (const v of values) total += v;
  assertMoney(total, "sum");
  return total;
}
