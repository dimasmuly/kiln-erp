import { eq } from "drizzle-orm";
import { z } from "zod";

import { hashPassword } from "../../auth/password";
import { ROLES } from "../../auth/rbac";
import { authorize, type Ctx } from "../../context";
import { db } from "../../db/client";
import { users } from "../../db/schema";
import { AppError, notFound } from "../../errors";
import { destroyAllSessions } from "../../kv/sessions";
import { parseInput, zText } from "../../validation";
import { audit } from "../shared";

const userInput = z.object({
  name: zText(80).min(2),
  email: z
    .email()
    .max(120)
    .transform((e) => e.toLowerCase()),
  role: z.enum(ROLES),
  password: z.string().min(10, "must be at least 10 characters").max(200),
});

export async function createUser(ctx: Ctx, input: unknown): Promise<{ id: string }> {
  authorize(ctx, "admin.users");
  const data = parseInput(userInput, input);
  const passwordHash = await hashPassword(data.password);
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(users)
      .values({ name: data.name, email: data.email, role: data.role, passwordHash })
      .returning({ id: users.id });
    await audit(tx, ctx, { action: "create", entity: "user", entityId: created.id, summary: `Created user ${data.email} (${data.role})` });
    return created;
  });
}

/** Deactivating a user also revokes every session they have in EmberKV, immediately. */
export async function setUserActive(ctx: Ctx, userId: string, active: boolean): Promise<{ revokedSessions: number }> {
  authorize(ctx, "admin.users");
  if (userId === ctx.actor.id && !active) throw new AppError("validation", "You cannot deactivate your own account.");
  await db.transaction(async (tx) => {
    const updated = await tx.update(users).set({ active }).where(eq(users.id, userId)).returning({ email: users.email });
    if (updated.length === 0) throw notFound("User");
    await audit(tx, ctx, {
      action: active ? "activate" : "deactivate",
      entity: "user",
      entityId: userId,
      summary: `${active ? "Activated" : "Deactivated"} ${updated[0].email}`,
    });
  });
  return { revokedSessions: active ? 0 : await destroyAllSessions(userId) };
}

export async function revokeSessions(ctx: Ctx, userId: string): Promise<number> {
  if (userId !== ctx.actor.id) authorize(ctx, "admin.users");
  const count = await destroyAllSessions(userId);
  await audit(db, ctx, { action: "revoke_sessions", entity: "user", entityId: userId, summary: `Signed out ${count} session(s)` });
  return count;
}
