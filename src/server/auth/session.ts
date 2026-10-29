import "server-only";

import { and, eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { createCtx, type Ctx } from "../context";
import { db } from "../db/client";
import { users } from "../db/schema";
import { AppError } from "../errors";
import { isUnavailable } from "../kv/client";
import { checkLoginAllowed } from "../kv/rate-limit";
import { createSession, destroySession, resolveSession, SESSION_TTL_SECONDS } from "../kv/sessions";
import { DUMMY_HASH, verifyPassword } from "./password";
import { can, type Permission, type Role } from "./rbac";

export const SESSION_COOKIE = "kiln_session";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export type SessionState = { status: "signed-in"; user: SessionUser } | { status: "signed-out" } | { status: "unavailable" };

/**
 * The Data Access Layer entry point: resolves the cookie against EmberKV and
 * the user against PostgreSQL (so deactivation and role changes take effect
 * on the next request). Memoized per request with React `cache`.
 */
export const getSession = cache(async (): Promise<SessionState> => {
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!cookie) return { status: "signed-out" };
  let userId: string | null;
  try {
    userId = await resolveSession(cookie);
  } catch (err) {
    // Fail closed: without the session store we cannot tell who this is.
    if (isUnavailable(err)) return { status: "unavailable" };
    throw err;
  }
  if (!userId) return { status: "signed-out" };
  const [user] = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.active, true)));
  return user ? { status: "signed-in", user } : { status: "signed-out" };
});

/** For pages: redirects to /login (or the outage page) unless signed in with `permission`. */
export async function requireUser(permission?: Permission): Promise<{ user: SessionUser; ctx: Ctx }> {
  const session = await getSession();
  if (session.status === "unavailable") redirect("/unavailable");
  if (session.status === "signed-out") redirect("/login");
  if (permission && !can(session.user.role, permission)) redirect("/forbidden");
  return { user: session.user, ctx: createCtx(session.user) };
}

/** For server actions: throws instead of redirecting, so the form can show the error. */
export async function actionContext(permission?: Permission): Promise<Ctx> {
  const session = await getSession();
  if (session.status === "unavailable") throw new AppError("unavailable", "Sessions are temporarily unavailable. Try again shortly.");
  if (session.status === "signed-out") throw new AppError("forbidden", "Your session has expired. Sign in again.");
  if (permission && !can(session.user.role, permission)) throw new AppError("forbidden", "You do not have permission to do this.");
  return createCtx(session.user);
}

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

export async function signIn(emailInput: string, password: string): Promise<void> {
  const email = emailInput.trim().toLowerCase();
  const ip = await clientIp();
  const limit = await checkLoginAllowed(email, ip);
  if (!limit.allowed) {
    const minutes = Math.max(1, Math.ceil(limit.retryAfterMs / 60_000));
    throw new AppError("rate_limited", `Too many sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`);
  }

  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash, active: users.active })
    .from(users)
    .where(eq(users.email, email));
  // Always run the hash so timing does not reveal whether the email exists.
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok || !user.active) throw new AppError("validation", "Email or password is incorrect.");

  let cookieValue: string;
  try {
    cookieValue = await createSession(user.id, (await headers()).get("user-agent"));
  } catch (err) {
    if (isUnavailable(err)) throw new AppError("unavailable", "Sign-in is temporarily unavailable. Try again shortly.");
    throw err;
  }
  (await cookies()).set(SESSION_COOKIE, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function signOut(): Promise<void> {
  const store = await cookies();
  const cookie = store.get(SESSION_COOKIE)?.value;
  if (cookie) await destroySession(cookie).catch(() => undefined);
  store.delete(SESSION_COOKIE);
}
