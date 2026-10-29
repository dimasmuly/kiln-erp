import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

/** scrypt from node:crypto: memory-hard, no native dependency to compile. */
const PARAMS = { N: 16_384, r: 8, p: 1 } as const;
const KEY_LENGTH = 32;

function derive(password: string, salt: Buffer, params: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, params, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/** Format: `scrypt$N$r$p$<salt b64>$<hash b64>`, so parameters can be raised later. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await derive(password, salt, PARAMS);
  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64"), hash.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await derive(password, Buffer.from(salt, "base64"), { N: Number(n), r: Number(r), p: Number(p) });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Verified against when the email is unknown, so response time does not reveal which accounts exist. */
export const DUMMY_HASH = ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, Buffer.alloc(16).toString("base64"), Buffer.alloc(KEY_LENGTH).toString("base64")].join("$");
