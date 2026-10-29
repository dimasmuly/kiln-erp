import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url().default("postgres://kiln:kiln@127.0.0.1:5433/kiln"),
  EMBERKV_URL: z.string().url().default("http://127.0.0.1:8080"),
  /** read_write token scoped to the namespaces in docs/INTEGRATION.md. */
  EMBERKV_TOKEN: z.string().min(1).optional(),
  /** Optional admin token: enables engine stats on the System page. */
  EMBERKV_ADMIN_TOKEN: z.string().min(1).optional(),
  /** Shows demo credentials on the login page. Never enable on real data. */
  DEMO_MODE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  TIME_ZONE: z.string().default("Asia/Jakarta"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Parsed lazily so `next build` does not need production secrets. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
  }
  if (parsed.data.NODE_ENV === "production" && !parsed.data.EMBERKV_TOKEN) {
    throw new Error("EMBERKV_TOKEN is required in production.");
  }
  cached = parsed.data;
  return cached;
}
