# ADR-0006: Per-feature failure modes when EmberKV is unavailable

**Status:** accepted

## Context

EmberKV is a separate process that can restart, be upgraded or fail. "The ERP goes down with it" is not acceptable for most features. "Silently do something unsafe" is not acceptable for any.

## Decision

Every call goes through `src/server/kv/`. Each feature decides explicitly, and logs a structured `{"msg":"emberkv degraded","feature":…}` line whenever it falls back. Client timeout is 1.5 s.

| Feature | Mode | Reasoning |
|---|---|---|
| Session lookup | **Fail closed** → `/unavailable` | Without the store we cannot know who the caller is. Letting them in is unsafe, and treating them as signed out destroys their work for no reason. An honest outage page is the correct answer |
| Sign-in | **Fail closed** with a message | A session cannot be created |
| Login throttling | **Fail open**, logged | Locking every employee out because the throttle store restarted is a worse outage than a few minutes without throttling |
| Idempotency | **Fail open**, logged | Row locks and state machines still reject repeated transitions; only creates lose duplicate protection, briefly |
| Edit leases | **Fail open**, with a warning in the editor | Leases are a courtesy; `version` checks guarantee correctness |
| Dashboard cache | **Bypass** | Compute from PostgreSQL |
| Cache invalidation | **Best effort** | A missed invalidation is bounded by the 60 s TTL |

`/api/health` returns 200 `degraded` when only EmberKV is down, and 503 only when PostgreSQL is down, so a load balancer does not take healthy ERP instances out of rotation over a non-critical dependency.

## Evidence

`tests/integration/emberkv.test.ts › when EmberKV is down` points the ERP at an unreachable address and asserts each mode in the table above.
