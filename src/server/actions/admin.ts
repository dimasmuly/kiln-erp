"use server";

import { revalidatePath } from "next/cache";

import { actionContext } from "../auth/session";
import { once } from "../kv/idempotency";
import { createUser, revokeSessions, setUserActive } from "../modules/users/commands";
import { formString, run, type ActionResult } from "./result";

export async function createUserAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const result = await run(async () => {
    const ctx = await actionContext("admin.users");
    await once(`user:create:${ctx.actor.id}`, formString(form, "_idem"), () =>
      createUser(ctx, {
        name: formString(form, "name"),
        email: formString(form, "email"),
        role: formString(form, "role"),
        password: formString(form, "password"),
      }),
    );
  });
  if (!result.ok) return result;
  revalidatePath("/admin/users");
  return { ok: true, data: undefined, message: "User created. Share the password through a secure channel." };
}

export async function setUserActiveAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const active = formString(form, "active") === "true";
  const result = await run(async () => {
    const ctx = await actionContext("admin.users");
    return setUserActive(ctx, formString(form, "userId"), active);
  });
  if (!result.ok) return result;
  return {
    ok: true,
    data: undefined,
    message: active ? "User reactivated." : `User deactivated; ${result.data.revokedSessions} active session(s) revoked in EmberKV.`,
  };
}

export async function revokeUserSessionsAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const result = await run(async () => {
    const ctx = await actionContext("admin.users");
    return revokeSessions(ctx, formString(form, "userId"));
  });
  if (!result.ok) return result;
  return { ok: true, data: undefined, message: `${result.data} session(s) signed out.` };
}
