import { eq } from "drizzle-orm";
import { z } from "zod";

import { authorize, type Ctx } from "../../context";
import { db } from "../../db/client";
import { customers, suppliers } from "../../db/schema";
import { notFound } from "../../errors";
import { parseInput, zOptionalText, zText } from "../../validation";
import { audit } from "../shared";

const partyInput = z.object({
  code: zText(16)
    .min(2)
    .regex(/^[A-Za-z0-9-]+$/, "use letters, digits and dashes")
    .transform((s) => s.toUpperCase()),
  name: zText(120).min(2),
  email: z
    .union([z.literal(""), z.email().max(120)])
    .optional()
    .transform((v) => v || null),
  phone: zOptionalText(32),
  city: zOptionalText(60),
  taxId: zOptionalText(32),
  paymentTermsDays: z.coerce.number().int().min(0).max(180),
});

type PartyTable = typeof customers | typeof suppliers;

function partyCommands(table: PartyTable, entity: "customer" | "supplier") {
  return {
    async create(ctx: Ctx, input: unknown): Promise<{ id: number }> {
      authorize(ctx, "masterdata.write");
      const data = parseInput(partyInput, input);
      return db.transaction(async (tx) => {
        const [created] = await tx.insert(table).values(data).returning({ id: table.id });
        await audit(tx, ctx, { action: "create", entity, entityId: created.id, summary: `Created ${entity} ${data.name}` });
        return created;
      });
    },
    async update(ctx: Ctx, id: number, input: unknown): Promise<void> {
      authorize(ctx, "masterdata.write");
      const data = parseInput(partyInput, input);
      await db.transaction(async (tx) => {
        const updated = await tx.update(table).set(data).where(eq(table.id, id)).returning({ id: table.id });
        if (updated.length === 0) throw notFound(entity === "customer" ? "Customer" : "Supplier");
        await audit(tx, ctx, { action: "update", entity, entityId: id, summary: `Updated ${entity} ${data.name}` });
      });
    },
  };
}

export const customerCommands = partyCommands(customers, "customer");
export const supplierCommands = partyCommands(suppliers, "supplier");
