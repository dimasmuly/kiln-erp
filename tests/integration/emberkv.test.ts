import { randomUUID } from "node:crypto";

import { EmberKV } from "@emberkv/client";
import { describe, expect, it } from "vitest";

import { readThrough } from "@/server/kv/cache";
import { overrideKv } from "@/server/kv/client";
import { once } from "@/server/kv/idempotency";
import { acquireLease, releaseLease, renewLease } from "@/server/kv/locks";
import { checkLimit } from "@/server/kv/rate-limit";
import { createSession, destroyAllSessions, destroySession, listSessions, resolveSession } from "@/server/kv/sessions";

/**
 * The ERP's EmberKV integrations against a live emberkv-server: the Rust
 * service in ../emberkv, reached through its TypeScript SDK.
 */

const alice = { id: randomUUID(), name: "Alice" };
const bob = { id: randomUUID(), name: "Bob" };

describe("sessions", () => {
  it("creates, resolves, lists and revokes", async () => {
    const userId = randomUUID();
    const a = await createSession(userId, "laptop");
    const b = await createSession(userId, "phone");
    expect(await resolveSession(a)).toBe(userId);
    expect(await listSessions(userId)).toHaveLength(2);
    await destroySession(a);
    expect(await resolveSession(a)).toBeNull();
    expect(await destroyAllSessions(userId)).toBe(1);
    expect(await resolveSession(b)).toBeNull();
  });

  it("rejects forged and tampered cookies", async () => {
    const userId = randomUUID();
    const cookie = await createSession(userId, null);
    const [, token] = cookie.split(".");
    expect(await resolveSession(`${randomUUID()}.${token}`)).toBeNull(); // someone else's user id
    expect(await resolveSession(`${userId}.${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`)).toBeNull();
    expect(await resolveSession("garbage")).toBeNull();
  });
});

describe("idempotency", () => {
  it("runs a double submit once and replays the result", async () => {
    let runs = 0;
    const key = randomUUID();
    const work = async () => {
      runs++;
      await new Promise((r) => setTimeout(r, 50));
      return { id: 42 };
    };
    const [first, second] = await Promise.allSettled([once("test", key, work), once("test", key, work)]);
    expect(runs).toBe(1);
    expect(first).toMatchObject({ status: "fulfilled", value: { result: { id: 42 }, replayed: false } });
    expect(second).toMatchObject({ status: "rejected", reason: { code: "conflict" } }); // still in flight
    expect(await once("test", key, work)).toEqual({ result: { id: 42 }, replayed: true });
    expect(runs).toBe(1);
  });

  it("releases the claim when the command fails, so the user can retry", async () => {
    const key = randomUUID();
    await expect(once("test", key, () => Promise.reject(new Error("invalid input")))).rejects.toThrow("invalid input");
    expect(await once("test", key, async () => "ok")).toEqual({ result: "ok", replayed: false });
  });
});

describe("edit leases", () => {
  it("lets one editor in at a time", async () => {
    const doc = `test:${randomUUID()}`;
    expect(await acquireLease(doc, alice)).toEqual({ acquired: true, degraded: false });
    expect(await acquireLease(doc, bob)).toMatchObject({ acquired: false, holder: { name: "Alice" } });
    expect(await renewLease(doc, bob)).toBe(false);
    expect(await renewLease(doc, alice)).toBe(true);
    await releaseLease(doc, bob.id); // not Bob's: a no-op
    expect(await acquireLease(doc, bob)).toMatchObject({ acquired: false });
    await releaseLease(doc, alice.id);
    expect(await acquireLease(doc, bob)).toMatchObject({ acquired: true });
  });
});

describe("rate limiting", () => {
  it("allows the configured number of attempts per window", async () => {
    const subject = `test:${randomUUID()}`;
    const decisions = [];
    for (let i = 0; i < 4; i++) decisions.push(await checkLimit(subject, { limit: 3, window: "1m" }));
    expect(decisions.map((d) => d.allowed)).toEqual([true, true, true, false]);
    expect(decisions[3].retryAfterMs).toBeGreaterThan(0);
  });
});

describe("cache", () => {
  it("serves the second read from EmberKV", async () => {
    const key = `test:${randomUUID()}`;
    let loads = 0;
    const load = async () => ++loads;
    expect(await readThrough(key, "30s", load)).toMatchObject({ value: 1, source: "postgres" });
    expect(await readThrough(key, "30s", load)).toMatchObject({ value: 1, source: "emberkv" });
  });
});

describe("when EmberKV is down", () => {
  it("degrades as designed: throttling and idempotency fail open, sessions fail closed", async () => {
    overrideKv(new EmberKV({ baseUrl: "http://127.0.0.1:1", timeoutMs: 300 }));
    try {
      expect(await checkLimit("anyone", { limit: 1, window: "1m" })).toMatchObject({ allowed: true, degraded: true });
      expect(await once("test", randomUUID(), async () => "ran anyway")).toEqual({ result: "ran anyway", replayed: false });
      expect(await acquireLease("doc", alice)).toEqual({ acquired: true, degraded: true });
      expect(await readThrough("k", "1m", async () => "from db")).toMatchObject({ value: "from db", source: "postgres" });
      await expect(resolveSession(`${alice.id}.${"A".repeat(43)}`)).rejects.toMatchObject({ code: "network_error" });
    } finally {
      overrideKv(new EmberKV({ baseUrl: process.env.EMBERKV_URL ?? "http://127.0.0.1:8080", token: process.env.EMBERKV_TOKEN }));
    }
  });
});
