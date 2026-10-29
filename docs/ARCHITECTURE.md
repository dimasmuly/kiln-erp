# Architecture

This document explains how Kiln ERP is put together, why, and what happens when things go wrong. The ADRs in [`adr/`](adr) hold the individual decisions.

## 1. Layers

```text
src/app/**            Routes. Render data, bind forms to actions. No business logic.
src/server/actions/   The only write entry point from the browser.
src/server/modules/   Commands (writes, one transaction each) and queries (reads).
src/server/kv/        All EmberKV access, each feature with an explicit fallback.
src/domain/           Pure functions: money, pricing, costing, posting rules, state machines.
PostgreSQL            Integrity rules that must hold for every writer.
```

Dependencies point downward only. `domain/` imports nothing, which is why the order editor in the browser can price an order with exactly the code the server uses. Commands take a `Ctx` (`{ actor, now, today }`) instead of reading the session or the clock. That one choice lets the same command run from a Server Action, from the seed script that backdates 120 days of history, and from tests.

## 2. Anatomy of a write

Here is what happens when someone clicks **Mark delivered** on a sales order:

```text
browser ── POST (Server Action, CSRF-checked by Next.js) ──▶ transitionSalesOrderAction
  1. actionContext()          session cookie → EmberKV lookup → user row in PostgreSQL
  2. once("so:42:deliver", _idem)                 EmberKV If-None-Match:* claim
  3. deliverSalesOrder(ctx, 42)                   ── BEGIN
       authorize(ctx, "sales.deliver")            RBAC in the service, not the UI
       SELECT … FROM sales_orders WHERE id=42 FOR UPDATE
       assertSalesTransition("confirmed" → "delivered")
       lockProducts(ids sorted ascending)         SELECT … FOR UPDATE
       for each line: issueStock()                stock_levels −qty, −reserved
                                                  products.inventory_value −cost
                                                  stock_movements +row (append-only)
       postJournal(Dr 5100 COGS / Cr 1300 Inventory)
       audit_log +row
     COMMIT                                       deferred trigger: entry balanced?
  4. invalidate("dashboard:v1")                   EmberKV, after commit
  5. store the idempotent result                  EmberKV, 24 h
  ◀── { ok: true, message } → toast, router.refresh()
```

If any step inside the transaction throws, nothing is written: no stock moves, no journal entry and no audit row. The idempotency claim is also released, so the user can retry. Step 4 runs only after a successful commit, so the cache is never invalidated for a write that didn't happen. If step 4 itself fails, the data is still correct; only the dashboard is stale, for at most the 60 s TTL.

## 3. Data model

```text
users ─┐                                  accounts ◀── journal_lines ──▶ journal_entries
       │ created_by / actor_id                                             ▲ source = SO-… / INV-… / PO-…
customers ◀── sales_orders ──< sales_order_lines >── products ──< stock_levels >── warehouses
                   │ 1:1                                  │
                invoices ──< payments                     └──< stock_movements (append-only)
suppliers ◀── purchase_orders ──< purchase_order_lines >── products
document_sequences  (gap-free SO / INV / PO / JV / ADJ numbers per year)
audit_log           (who did what, written in the business transaction)
```

| Invariant | Enforced by |
|---|---|
| Every journal entry balances and has ≥ 2 lines | Deferred constraint trigger `assert_journal_entry_balanced` |
| A journal line is exactly one of debit or credit | `CHECK journal_lines_one_sided` |
| Ledgers are never rewritten | `BEFORE UPDATE OR DELETE` triggers on journal_entries, journal_lines, stock_movements, payments |
| Stock is never negative or over-reserved | `CHECK on_hand >= 0`, `reserved >= 0`, `reserved <= on_hand` |
| Document totals are internally consistent | `CHECK total = subtotal + tax`, `line_total = qty × unit_price` |
| An invoice is paid exactly when its balance is zero | `CHECK (status = 'paid') = (amount_paid = total)` |
| Σ stock movements = on hand; Σ product value = GL 1300; Σ open invoices = GL 1200 | Integration tests after every scenario, plus a live check on the dashboard |

## 4. Concurrency

The ERP runs at PostgreSQL's default `READ COMMITTED` isolation and makes conflicts explicit:

- **Document state changes** begin with `SELECT … FOR UPDATE` on the document. Two concurrent "Deliver" requests serialize; the second sees `delivered` and is refused by the state machine.
- **Reservations** are one conditional `UPDATE stock_levels SET reserved = reserved + q WHERE on_hand - reserved >= q`. The row lock taken by the update makes check-and-reserve atomic without any explicit lock.
- **Lock order** is always document row → product rows by ascending id → stock rows. Order lines are processed sorted by product id for the same reason.
- **Edits** carry the `version` they loaded. A save based on a stale version is refused with a clear message. EmberKV leases sit in front of this as a UX layer, so two people rarely end up editing the same draft at all.

See [ADR-0005](adr/0005-concurrency.md).

## 5. Rendering model

Next.js 16 runs with Cache Components and Partial Prefetching. The authenticated layout's frame (the sidebar container and brand) is static and prerendered. The role-filtered navigation and every page body depend on the session, so they stream in behind Suspense boundaries (`loading.tsx` renders a skeleton). Because every screen is per-user and must reflect the latest ledger, the app segments set `instant = false`: navigations wait for fresh server data rather than serving a cached copy of a session that may since have been revoked. [ADR-0001](adr/0001-nextjs-cache-components.md)

## 6. Failure modes

| Failure | User-visible effect | Data effect |
|---|---|---|
| EmberKV down | Sign-in paused with an explanation; edit leases and throttling degrade, and the System page and sidebar say so | None. PostgreSQL remains the only system of record |
| EmberKV slow | Each call times out after 1.5 s and takes its fallback | None |
| PostgreSQL down | `/api/health` returns 503; pages show the error boundary | None (transactions roll back) |
| Process crash mid-command | The request fails | Transaction rolled back; the idempotency claim expires after 2 minutes |
| Double submit / retry | The first result is replayed | Written once |
| Concurrent edits | The second save is refused with "changed by someone else" | No lost update |

Details per feature are in [ADR-0006](adr/0006-failure-modes.md).

## 7. Security

- Passwords: scrypt (N=2¹⁴, r=8, p=1) with a per-user salt. Unknown emails are checked against a dummy hash, so response time does not reveal which accounts exist.
- Sessions: 256-bit random tokens. EmberKV stores only `sha256(token)`, under a key prefixed by user id so that every session of a user can be revoked at once. Cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` in production.
- Authorization: checked in every command and query (`authorize(ctx, permission)`), not just in the UI.
- Server Actions: Next.js checks Origin against Host (CSRF); inputs are validated with Zod at the service boundary; return values are shaped `ActionResult`s, never raw rows or stack traces.
- EmberKV: a dedicated `read_write` key scoped to five namespaces; personal data is hashed before it becomes part of a key, because keys appear in access logs.
- Headers: `X-Frame-Options: DENY`, `nosniff`, a strict referrer policy and a restrictive Permissions-Policy.
