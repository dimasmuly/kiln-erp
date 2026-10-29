# ADR-0002: What lives in EmberKV, and what never does

**Status:** accepted

## Context

EmberKV is a single-node, crash-safe key-value service with TTLs, conditional writes, atomic batches, counters and rate limits. It is fast and operationally simple, but it has no replication, no point-in-time recovery and no relational integrity. PostgreSQL has all of those.

## Decision

**PostgreSQL is the only system of record.** EmberKV holds state that is small, hot, usually short-lived, and safe to lose without corrupting the books:

| Namespace | Holds | Losing it means |
|---|---|---|
| `sessions` | `{userId, createdAt, renewedAt, userAgent}` under `userId:sha256(token)` | Users sign in again |
| `limits` | Fixed-window counters for login throttling | A brief window without throttling |
| `idempotency` | Claims and results of form submissions, 24 h | A retry might run twice; state machines still reject most duplicates |
| `locks` | Edit leases, 60 s TTL | Two people may open the same draft; version checks still prevent lost updates |
| `cache` | Dashboard aggregates, 60 s TTL | One slower page load |

Explicitly **not** in EmberKV, although it would be faster:

- **Document numbers.** An EmberKV counter would hand out a number even when the business transaction later rolls back, leaving a gap. Auditors expect invoice numbers without gaps, so numbers come from `document_sequences`, incremented inside the same PostgreSQL transaction.
- **Stock levels.** They must change atomically with journal entries, which only one database can guarantee.

The ERP holds one `read_write` API key scoped to exactly these five namespaces. An optional `admin` key is used only for engine statistics on the System page.

## Consequences

- Every EmberKV call site has a defined fallback (ADR-0006), and EmberKV can be restarted during business hours.
- Keys never contain personal data or secrets (emails, IPs and tokens are hashed), because EmberKV keys appear in its request logs.
