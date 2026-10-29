import { z } from "zod";

import { parseMoneyInput } from "../domain/money";
import { AppError } from "./errors";

/** Validates untrusted input at the service boundary, turning the first issue into a user-facing error. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const field = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
  throw new AppError("validation", `${field}${issue.message}`);
}

export const zId = z.coerce.number().int().positive();
export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be a date (YYYY-MM-DD)");
export const zText = (max: number) => z.string().trim().max(max);
export const zOptionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

/** Accepts minor units as a number, or major units as a decimal string from a form. */
export const zMoney = z.union([z.number().int().nonnegative(), z.string()]).transform((value, ctx) => {
  if (typeof value === "number") return value;
  const parsed = parseMoneyInput(value);
  if (parsed === null) {
    ctx.addIssue({ code: "custom", message: "must be an amount like 125000 or 125000.50" });
    return z.NEVER;
  }
  return parsed;
});
