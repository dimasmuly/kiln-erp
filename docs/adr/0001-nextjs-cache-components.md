# ADR-0001: Next.js 16 App Router with Cache Components; Server Actions as the only write path

**Status:** accepted

## Context

An ERP is mostly forms and tables over data that changes all the time, viewed by authenticated users with different permissions. We want one language from database to browser, server-rendered pages that are fast on modest office hardware, and a small attack surface for writes.

## Decision

- **Next.js 16 App Router** with React Server Components for every read. Pages query the database directly through the Data Access Layer (`requireUser()` → module queries). No public read API exists.
- **Server Actions** are the only way the browser writes. Each action does the same four things: resolve the session (`actionContext`), claim an idempotency key, call exactly one command, and return a typed `ActionResult`. Commands never trust ids from the client beyond "which document". Ownership, state and permissions are always re-read on the server.
- **Cache Components + Partial Prefetching** (the defaults in Next.js 16). Each route prerenders a static shell. Everything that depends on the session streams behind Suspense, so the frame appears immediately and skeletons fill in.
- Authenticated segments set **`instant = false`**. Their content is per-user and must reflect the latest ledger. Serving a client-cached copy of a session (`use cache: private`) would keep showing a revoked user's screens for the length of the cache window.
- **`proxy.ts`** (formerly middleware) only redirects requests that have no session cookie. Real validation lives in the Data Access Layer, per the framework's guidance.

## Consequences

- Writes are easy to audit: `grep "use server"` lists every entry point.
- Toast-style actions return their result without revalidating; the client shows the toast from a layout-level provider and then calls `router.refresh()`. Without this, the success message would vanish together with the button that triggered it.
- Navigation between screens costs one server round trip. That is acceptable for an internal tool and correct for financial data.
