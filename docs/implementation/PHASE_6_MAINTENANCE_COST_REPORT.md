# Phase 6 Progress Report — Maintenance Cost → Ledger Posting

**Status:** implemented end-to-end (migration, command, API route, data layer, operator UI, embedded-Postgres + Vitest coverage)
**Date:** 2026-08-06

## Why this slice

The Phase 6 delivery-plan exit criterion "maintenance cost posts through approved journal template" was the last open item in the maintenance vertical. Work orders could be created, assigned, transitioned, and closed, but a completed work order's cost never reached the double-entry ledger — so it never appeared on the owner statement and never accrued a payable. This slice closes that gap: a completed or closed work order's cost posts as a balanced journal (debit repairs & maintenance, credit accounts payable), and the expense leg carries `property_id` so `private.calculate_owner_statement` picks it up automatically.

## Implemented scope

- **`public.record_work_order_cost(p_organization_id, p_work_order_id, p_amount_minor, p_currency_code, p_memo, p_idempotency_key)`** — a `security definer` command mirroring `record_manual_payment`. It gates on `finance.manage` for the work order's property, requires the work order to be `completed` or `closed`, validates the currency against the property's open accounting book, and posts a balanced journal:
  - **DEBIT `6200` Repairs and maintenance** (expense, lazily upserted) carrying `property_id` + `unit_id`.
  - **CREDIT `2000` Accounts payable** (liability, lazily upserted).
  - Both `6200` and `2000` are new account codes; there was no generic repairs-expense or accounts-payable code before this slice.
- **One cost posting per work order.** An `exists(...)` guard on `journal_transactions` (`source_type='work_order'`, matching `source_id`, `transaction_type='maintenance_cost'`) rejects a second posting with `WORK_ORDER_COST_ALREADY_POSTED`. It runs **after** the idempotency short-circuit, so a legitimate replay returns the stored response rather than tripping the guard. The `select … for update` lock on the work-order row serialises concurrent postings: the second caller blocks, then re-checks the guard after the first commits and is correctly rejected — no double-post.
- **Operator workspace** — `get_operator_maintenance_workspace` now includes completed/closed work orders (filter relaxed from `status not in ('closed','canceled')` to `status <> 'canceled'`) and surfaces a `cost` object (`journalTransactionId`, `amountMinor` = sum of debit legs, `currencyCode`) on the work order projection.
- **API** — `POST /api/v1/work-orders/[workOrderId]/cost` (`recordWorkOrderCostSchema` → auth → RPC → sentinel→HTTP ladder: scope→403, not-found→404, already-posted/idempotency-conflict/in-progress→409, not-completed/currency-mismatch/book-not-open/invalid-amount/ledger-conflict→422).
- **Operator UI** — the request detail page (`/app/maintenance/[requestId]`) shows a "Record maintenance cost" form for a completed/closed work order with no posted cost (prefilled from the actual/estimated cost and currency), and renders the posted amount once it exists.

## Architecture and controls

- **Balanced by construction.** The two legs are both `p_amount_minor`; the deferred `private.validate_journal_balance()` trigger still guards commit. The embedded-Postgres suite asserts `debits = credits = 32000`, exactly one `6200` expense leg carrying the property, and exactly one `2000` payable leg.
- **Append-only.** `journal_transactions`/`journal_entries` remain immutable via `private.prevent_financial_mutation()`; corrections are reversing entries. The suite asserts a metadata `UPDATE` raises `APPEND_ONLY_RECORD`.
- **No new tables or RLS policies.** Authority counts are unchanged (74 tables / 59 policies). This is a delivery-plan exit criterion, not a `14_…` command contract; the design mirrors the shipped ledger-posting commands rather than inventing a new shape.
- **Owner-statement flow.** Because the expense leg carries `property_id`, the cost flows onto the owner statement with no extra wiring — the same mechanism the manual-payment and remittance postings rely on.

## Files

- `supabase/migrations/20260725100000_phase_6_maintenance_cost.sql`
- `src/lib/validation/maintenance.ts` (+ `.test.ts`)
- `src/app/api/v1/work-orders/[workOrderId]/cost/route.ts`
- `src/lib/data/maintenance.ts`
- `src/app/app/maintenance/[requestId]/record-cost-form.tsx`, `src/app/app/maintenance/[requestId]/page.tsx`
- `scripts/validate-schema.mjs`

## Verification evidence

`npm run check` passes end-to-end: ESLint, TypeScript, 98 Vitest tests (including 3 new work-order-cost schema tests), the embedded-Postgres suite, and the production build. `test:db` drives the full posting flow and asserts:

- **Rejections** — `PROPERTY_SCOPE_DENIED` (outsider), `WORK_ORDER_NOT_COMPLETED` (a fresh assigned work order), `WORK_ORDER_COST_CURRENCY_MISMATCH` (CAD against a USD book), and `WORK_ORDER_COST_ALREADY_POSTED` (a second posting with a new key).
- **Success** — a 32000-minor USD posting returns its canonical journal; an identical replay returns the same `journalTransactionId`.
- **Invariants** — balanced debits/credits, one property-carrying `6200` expense leg, one `2000` payable leg, `transaction_type='maintenance_cost'`; a metadata update raises `APPEND_ONLY_RECORD`; exactly one `work_order.cost_posted` audit event and one outbox event; the operator workspace surfaces `cost.amountMinor = 32000`.

Authority counts stayed at 74/59, confirming no table/policy drift.

## Deferred / follow-up

- **Vendor payment / AP settlement.** The credit lands in `2000` Accounts payable; paying the vendor and clearing that payable is out of pilot scope (no vendor-payment command yet).
- **Cost editing.** There is no edit path by design — the ledger is append-only, so a correction would be a reversing posting. A reversal command is not built.
- **Cross-actor idempotency-key collision (pattern-consistent minor).** As with `record_manual_payment`, two different actors choosing the identical client idempotency key for postings in the same accounting book would collide on `journal_transactions (accounting_book_id, idempotency_key)` and surface a generic 422 instead of a friendly sentinel. Keys are client-minted UUIDs, so this is astronomically unlikely and always aborts safely (no partial or double post); it matches the established sibling exactly.
