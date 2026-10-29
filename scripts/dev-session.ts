/**
 * Prints a session cookie value for a seeded user, for smoke tests with curl:
 *
 *   curl -b "kiln_session=$(npx tsx scripts/dev-session.ts sales@kiln.test)" localhost:3000/dashboard
 */
import { config } from "dotenv";
import { eq } from "drizzle-orm";

import { db } from "../src/server/db/client";
import { users } from "../src/server/db/schema";
import { createSession } from "../src/server/kv/sessions";

config({ path: ".env.local", quiet: true });

const email = process.argv[2] ?? "admin@kiln.test";
const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
if (!user) throw new Error(`No user ${email}; run npm run db:seed first.`);
console.log(await createSession(user.id, "dev-session script"));
process.exit(0);
