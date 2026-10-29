import { AppError } from "../errors";
import { isUnavailable, kv, logDegraded } from "./client";

/**
 * Exactly-once form submissions.
 *
 * Every mutating form carries a random key generated when the form rendered.
 * The first submission claims `<scope>:<key>` with `If-None-Match: *` (an
 * atomic create-only write in EmberKV), runs, and stores its result. A
 * double click, a retried request on a flaky connection, or a re-submitted
 * browser tab finds the claim and gets the original result back instead of
 * creating a second order or recording a payment twice.
 */

const KEY_PATTERN = /^[0-9a-f-]{36}$/;
const PENDING_TTL = "2m";
const RESULT_TTL = "24h";

type Claim<T> = { state: "pending"; at: number } | { state: "done"; at: number; result: T };

export interface Outcome<T> {
  result: T;
  /** True when this call returned a stored result instead of running. */
  replayed: boolean;
}

export async function once<T>(scope: string, key: string | null | undefined, run: () => Promise<T>): Promise<Outcome<T>> {
  if (!key || !KEY_PATTERN.test(key)) {
    throw new AppError("validation", "This form is out of date. Reload the page and try again.");
  }
  const ns = kv().ns.idempotency;
  const id = `${scope}:${key}`;

  let claimed: boolean;
  try {
    claimed = await ns.putIfAbsent(id, { state: "pending", at: Date.now() } satisfies Claim<T>, { ttl: PENDING_TTL });
  } catch (err) {
    if (!isUnavailable(err)) throw err;
    // Fail open: document state machines and row locks in PostgreSQL still
    // reject most duplicates (a confirmed order cannot be confirmed again).
    logDegraded("idempotency", err);
    return { result: await run(), replayed: false };
  }

  if (!claimed) {
    const existing = await ns.get<Claim<T>>(id);
    if (existing?.value.state === "done") return { result: existing.value.result, replayed: true };
    throw new AppError("conflict", "This request is already being processed. Wait a moment, then refresh.");
  }

  try {
    const result = await run();
    await ns
      .put(id, { state: "done", at: Date.now(), result } satisfies Claim<T>, { ttl: RESULT_TTL })
      .catch((err: unknown) => logDegraded("idempotency-store", err));
    return { result, replayed: false };
  } catch (err) {
    // Release the claim so the user can fix their input and submit again.
    await ns.delete(id).catch(() => undefined);
    throw err;
  }
}
