import { IdempotencyError } from "@emberkv/client";

import { AppError } from "../errors";
import { kv } from "./client";

/**
 * Exactly-once form submissions, via the SDK kit.
 *
 * Every mutating form carries a random key generated when the form rendered.
 * The first submission claims `<scope>:<key>` with `If-None-Match: *` (an
 * atomic create-only write in EmberKV), runs, and stores its result. A
 * double click, a retried request on a flaky connection, or a re-submitted
 * browser tab finds the claim and gets the original result back instead of
 * creating a second order or recording a payment twice.
 *
 * Fails open when EmberKV is down: document state machines and row locks in
 * PostgreSQL still reject most duplicates (a confirmed order cannot be
 * confirmed again).
 */

const KEY_PATTERN = /^[0-9a-f-]{36}$/;

export interface Outcome<T> {
  result: T;
  /** True when this call returned a stored result instead of running. */
  replayed: boolean;
}

export async function once<T>(scope: string, key: string | null | undefined, run: () => Promise<T>): Promise<Outcome<T>> {
  if (!key || !KEY_PATTERN.test(key)) {
    throw new AppError("validation", "This form is out of date. Reload the page and try again.");
  }
  try {
    return await kv().kit.idempotency.once(scope, key, run);
  } catch (err) {
    if (err instanceof IdempotencyError && err.code === "in_progress") {
      throw new AppError("conflict", "This request is already being processed. Wait a moment, then refresh.");
    }
    throw err;
  }
}
