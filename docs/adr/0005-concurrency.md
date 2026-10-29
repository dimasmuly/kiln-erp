# ADR-0005: Row locks, a global lock order, conditional reservations, versions plus leases

**Status:** accepted

## Context

Several people work on the same documents and the same stock at once. Classic failures: two orders both promised the last unit, a double-clicked "Deliver" shipping twice, two editors silently overwriting each other, and deadlocks between orders that list the same products in different orders.

## Decision

| Problem | Mechanism |
|---|---|
| Illegal or repeated state changes | `SELECT … FOR UPDATE` on the document, then `assertSalesTransition` / `assertPurchaseTransition` inside the same transaction |
| Overselling | One conditional `UPDATE stock_levels SET reserved = reserved + q WHERE on_hand - reserved >= q`; zero rows updated means insufficient stock. `CHECK (reserved <= on_hand)` backs it up |
| Deadlocks | One global lock order: document row → products in ascending id (`lockProducts`) → stock rows. Order lines are processed sorted by product id |
| Lost updates on edits | Each draft has a `version`. The editor submits the version it loaded, and a mismatch is refused |
| Wasted effort on conflicting edits | An EmberKV lease (ADR-0002) tells the second person up front that someone is already editing |
| Double submits and retries | EmberKV idempotency keys (`If-None-Match: *`) replay the first result |
| Over-payment by parallel partial payments | The invoice row is locked, and the outstanding balance is checked inside the transaction |

The default `READ COMMITTED` isolation is enough because every check-then-write runs under a row lock or inside a single conditional statement. `SERIALIZABLE` would add retry loops without closing any gap that remains.

## Evidence

`tests/integration/concurrency.test.ts`:
- 20 parallel confirmations against 10 units: exactly 10 succeed, and the rest fail with `insufficient_stock`
- 16 orders with lines in opposite orders, confirmed and delivered in parallel: no deadlock, and the ledger reconciles
- A doubled Deliver: one succeeds and one is refused
- 5 parallel partial payments of 50 000 against a 166 500 invoice: exactly 3 succeed
