"use server";

import { redirect } from "next/navigation";

import { actionContext, signIn, signOut } from "../auth/session";
import { revokeSessions } from "../modules/users/commands";
import { formString, run, type ActionResult } from "./result";

export async function loginAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const result = await run(() => signIn(formString(form, "email"), formString(form, "password")));
  if (!result.ok) return result;
  const next = formString(form, "next");
  // Only same-site relative paths, never "//evil.example".
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
}

export async function logoutAction(): Promise<void> {
  await signOut();
  redirect("/login");
}

export async function signOutEverywhereAction(): Promise<void> {
  const ctx = await actionContext();
  await revokeSessions(ctx, ctx.actor.id);
  await signOut();
  redirect("/login?signedOut=all");
}
