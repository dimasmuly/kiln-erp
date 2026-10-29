# ADR-0004: Balanced entries and append-only ledgers enforced by PostgreSQL

**Status:** accepted

## Context

Application code guarantees nothing about data written by other code paths: a data-fix script, a future microservice, a support engineer in `psql`. Accounting data has to stay correct regardless of who writes it.

## Decision

Defense in depth, in two layers:

1. **Application.** Posting rules are pure functions that return lines, and `finalize()` refuses anything unbalanced, two-sided or with fewer than two lines. They are unit-tested.
2. **Database** (`drizzle/0001_ledger_integrity.sql`):
   - A `CONSTRAINT TRIGGER … DEFERRABLE INITIALLY DEFERRED` on `journal_lines` *and* `journal_entries` recomputes Σ debit and Σ credit for the entry **at commit**. Deferral is essential, because lines are inserted one statement at a time. The trigger on `journal_entries` catches an entry inserted with no lines at all.
   - `BEFORE UPDATE OR DELETE` triggers on `journal_entries`, `journal_lines`, `stock_movements` and `payments` raise `insufficient_privilege` with the hint *"Post a reversing or adjusting entry instead."*
   - `CHECK` constraints for one-sided lines, non-negative stock, `reserved <= on_hand`, and consistent document totals.

## Consequences

- An unbalanced commit is impossible. The integration tests try one with raw SQL and assert the rejection.
- Corrections are new entries, which is what auditors expect anyway. History reads as it happened.
- Tests reset data with `TRUNCATE`, which bypasses row triggers. That is acceptable for disposable test databases.
