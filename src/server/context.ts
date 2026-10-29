import { can, type Permission, type Role } from "./auth/rbac";
import { AppError } from "./errors";
import { env } from "./env";

export interface Actor {
  id: string;
  name: string;
  role: Role;
}

/**
 * Who is acting, and when. Services never read the clock or the session
 * directly; they take a context. That keeps them callable from server
 * actions, the seed script (which backdates 90 days of history) and tests.
 */
export interface Ctx {
  actor: Actor;
  now: Date;
  /** Business date in the company's time zone, `YYYY-MM-DD`. */
  today: string;
}

export function businessDate(at: Date, timeZone = env().TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

export function createCtx(actor: Actor, now = new Date()): Ctx {
  return { actor, now, today: businessDate(now) };
}

export function authorize(ctx: Ctx, permission: Permission): void {
  if (!can(ctx.actor.role, permission)) {
    throw new AppError("forbidden", "You do not have permission to do this.");
  }
}
