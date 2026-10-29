import { OrderValidationError } from "../domain/orders";
import { InventoryError } from "../domain/inventory";
import { TransitionError } from "../domain/workflow";
import { UnbalancedEntryError } from "../domain/posting";

export type ErrorCode =
  | "validation"
  | "not_found"
  | "forbidden"
  | "conflict"
  | "insufficient_stock"
  | "locked"
  | "rate_limited"
  | "unavailable";

/** An error whose message is safe to show to the user. */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (what: string) => new AppError("not_found", `${what} was not found.`);

interface PgError {
  code?: string;
  constraint_name?: string;
  constraint?: string;
}

/**
 * Normalizes anything thrown by a service into an `AppError`, or returns
 * `null` for unexpected failures (which are logged and shown generically, so
 * internals never leak to the browser).
 */
export function toAppError(err: unknown): AppError | null {
  if (err instanceof AppError) return err;
  if (err instanceof OrderValidationError || err instanceof InventoryError) {
    return new AppError("validation", err.message);
  }
  if (err instanceof TransitionError) {
    return new AppError("conflict", `${err.message} Someone may have updated it; refresh the page.`);
  }
  if (err instanceof UnbalancedEntryError) return null;

  const pg = (err as { cause?: PgError }).cause ?? (err as PgError);
  const constraint = pg.constraint_name ?? pg.constraint ?? "";
  if (pg.code === "23505") return new AppError("conflict", "A record with the same code already exists.");
  if (pg.code === "23514" && constraint.startsWith("stock_levels_")) {
    return new AppError("insufficient_stock", "Not enough stock available for this operation.");
  }
  if (pg.code === "40P01" || pg.code === "40001") {
    return new AppError("conflict", "The operation collided with another update. Please try again.");
  }
  return null;
}
