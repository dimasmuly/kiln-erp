import type { LimitDecision, RateLimitRule } from "@emberkv/client";

import { kv } from "./client";

export type { LimitDecision };

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
  return kv().kit.rateLimit.check(subject, rule);
}

export async function checkLoginAllowed(email: string, ip: string): Promise<LimitDecision> {
  return kv().kit.rateLimit.checkAll([
    [`login:account:${email}`, LOGIN_RULES.account],
    [`login:ip:${ip}`, LOGIN_RULES.ip],
  ]);
}
