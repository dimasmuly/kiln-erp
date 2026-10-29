import type { RateLimitRule } from "@emberkv/client";

import { isUnavailable, kv, logDegraded, opaqueKey } from "./client";

export interface LimitDecision {
  allowed: boolean;
  retryAfterMs: number;
  /** True when EmberKV was unreachable and the request was let through. */
  degraded: boolean;
}

/**
 * Login throttling. Two independent windows: per account (stops guessing one
 * user's password from many IPs) and per client IP (stops one IP spraying
 * many accounts). Subjects are hashed: emails and IPs are personal data.
 */
export const LOGIN_RULES = {
  account: { limit: 5, window: "15m" },
  ip: { limit: 30, window: "15m" },
} satisfies Record<string, RateLimitRule>;

/**
 * Fails **open**: if EmberKV is down, the request proceeds and the event is
 * logged. Locking every user out of the ERP because a throttle store is
 * restarting would be a worse outage than briefly losing throttling.
 */
export async function checkLimit(subject: string, rule: RateLimitRule): Promise<LimitDecision> {
  try {
    const decision = await kv().ns.limits.rateLimit(opaqueKey(subject), rule);
    return { allowed: decision.allowed, retryAfterMs: decision.retryAfterMs ?? 0, degraded: false };
  } catch (err) {
    if (!isUnavailable(err)) throw err;
    logDegraded("rate-limit", err);
    return { allowed: true, retryAfterMs: 0, degraded: true };
  }
}

export async function checkLoginAllowed(email: string, ip: string): Promise<LimitDecision> {
  const [account, client] = await Promise.all([
    checkLimit(`login:account:${email}`, LOGIN_RULES.account),
    checkLimit(`login:ip:${ip}`, LOGIN_RULES.ip),
  ]);
  return {
    allowed: account.allowed && client.allowed,
    retryAfterMs: Math.max(account.retryAfterMs, client.retryAfterMs),
    degraded: account.degraded || client.degraded,
  };
}
