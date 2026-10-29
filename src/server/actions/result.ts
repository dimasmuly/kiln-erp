import { toAppError } from "../errors";

/** What every server action returns to its form. Never contains raw errors or records. */
export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; code?: string }
  | null;

/**
 * Runs a command and converts failures into a user-facing result. Unknown
 * errors are logged with a correlation id and shown generically.
 */
export async function run<T>(command: () => Promise<T>): Promise<Exclude<ActionResult<T>, null>> {
  try {
    return { ok: true, data: await command() };
  } catch (err) {
    const known = toAppError(err);
    if (known) return { ok: false, error: known.message, code: known.code };
    const ref = crypto.randomUUID().slice(0, 8);
    console.error(JSON.stringify({ level: "error", msg: "action failed", ref, error: err instanceof Error ? err.stack : String(err) }));
    return { ok: false, error: `Something went wrong (ref ${ref}). Try again, or give this reference to your administrator.` };
  }
}

export function formString(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}
