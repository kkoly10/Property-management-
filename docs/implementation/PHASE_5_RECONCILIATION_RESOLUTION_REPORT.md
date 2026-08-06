# Phase 5 Progress Report — Reconciliation-Exception Resolution

**Status:** implemented end-to-end (migration, command, API route, data layer, operator UI, embedded-Postgres + Vitest coverage)
**Date:** 2026-08-06

## Why this slice

The Phase 5 delivery-plan exit criterion **"a settlement mismatch cannot be silently closed"** was not satisfiable. The settlement + webhook paths *create* `reconciliation_exceptions` (amount mismatches, unidentified transfers, reversed payouts, duplicates) and flag the owning batch as `reconciliation_status = 'exception'`, but there was **no command to close one**. Exceptions could only accumulate — an operator had no audited way to resolve, waive, or escalate them, so the reconciliation queue could never be worked down. This slice adds that write path.

## Implemented scope

- **`public.resolve_reconciliation_exception(p_organization_id, p_reconciliation_exception_id, p_resolution, p_evidence, p_idempotency_key)`** — a `security definer` command mirroring `record_manual_payment`. It gates on org-level `finance.manage` (the same helper the exception read policy uses), is idempotent, and writes one audit + one outbox event per resolution.
  - `p_resolution ∈ (resolved, waived, escalated)`. **Resolve/waive are terminal and require an evidence note** (8–1000 chars) recorded on the row — the "cannot be silently closed" guarantee. **Escalate** re-prioritises an *open* exception (it stays in the operator queue at raised priority) and its note is optional.
  - The table CHECK enforces `open|escalated ⟹ no resolver` and `resolved|waived ⟹ resolver + timestamp`; the command sets `resolved_at`/`resolved_by` only for resolve/waive and leaves them null for escalate.
  - **Terminal guards** (`EXCEPTION_ALREADY_RESOLVED`, `EXCEPTION_ALREADY_ESCALATED`) run **after** the idempotency short-circuit, so a legitimate replay returns the stored response instead of tripping the guard on the row the same call already transitioned.
- **Batch re-derivation.** When the last open/escalated exception on a batch is resolved/waived, the batch leaves its `'exception'` state. It cannot become `'reconciled'` (that requires the settlement journal the webhook posts), so it returns to `'unreconciled'`. The batch row is **locked `for update`** before the "is this the last one?" check so two operators clearing the final two exceptions concurrently cannot each miss the other's update and leave the batch stuck.
- **Operator workspace** — `get_settlement_reconciliation_workspace` now carries `organizationId` on each exception (so the resolve control can target the command); it still lists only `open|escalated`, so resolved/waived exceptions drop off the queue automatically.
- **API** — `POST /api/v1/reconciliation-exceptions/[exceptionId]/resolution` with the standard sentinel→HTTP ladder (scope→403, not-found→404, already-resolved/already-escalated/idempotency-conflict/in-progress→409, evidence/resolution errors→422).
- **Operator UI** — a resolution control on the `/app/payments` exception queue (`resolve-exception-control.tsx`): an evidence textarea plus Resolve / Waive / Escalate actions, the current status badge, and a success state that reports when a batch was cleared.

## Architecture and controls

- **One rule, four enforcement points, all moved together:** the SQL command (gate + state guards), the Zod schema (`finance.ts`, evidence required for resolve/waive), the API error ladder, and the UI (Resolve/Waive disabled until an 8-char note; Escalate omits a too-short note rather than sending an invalid one).
- **Cross-tenant safety.** The exception is loaded `where id = … and organization_id = …`, so passing another org's `exceptionId` yields `RECONCILIATION_EXCEPTION_NOT_FOUND`, and `has_org_permission` denies non-members with `FINANCE_SCOPE_DENIED`.
- **No new tables or RLS policies.** Authority counts unchanged (74 tables / 59 policies). This is a delivery-plan exit criterion, not a new `14_…` command contract; the shape mirrors the shipped finance commands.
- **Payment `reconciliation_status` is intentionally not re-derived here.** A payment can also be flagged `'exception'` by an open dispute (phase_5_payment_disputes), so clearing it from the reconciliation side alone could hide an active dispute. The batch rollup is safe to re-derive because it is set to `'exception'` *only* by the reconciliation path.

## Files

- `supabase/migrations/20260725110000_phase_5_reconciliation_resolution.sql`
- `src/lib/validation/finance.ts` (+ `.test.ts`)
- `src/app/api/v1/reconciliation-exceptions/[exceptionId]/resolution/route.ts`
- `src/lib/data/finance.ts`
- `src/app/app/payments/resolve-exception-control.tsx`, `src/app/app/payments/page.tsx`
- `scripts/validate-schema.mjs`

## Verification evidence

`npm run check` passes end-to-end: ESLint, TypeScript, 100 Vitest tests (2 new resolution-schema tests), the embedded-Postgres suite, and the production build. `test:db` drives the full flow against the two open exceptions the settlement webhook created on the `po_CrecyMismatch001` batch and asserts:

- **Rejections** — `FINANCE_SCOPE_DENIED` (outsider), `INVALID_RESOLUTION`, `RESOLUTION_EVIDENCE_REQUIRED`, `RECONCILIATION_EXCEPTION_NOT_FOUND`, `EXCEPTION_ALREADY_ESCALATED`, and `EXCEPTION_ALREADY_RESOLVED`.
- **Transitions** — escalate keeps the exception open (no resolver, batch stays `'exception'`); resolving the first of two does not clear the batch; waiving the last one clears it (`batchCleared = true`, batch → `'unreconciled'`).
- **Invariants** — resolved/waived rows carry the resolver; an identical replay returns the stored response; audit + outbox traces (`reconciliation.exception_resolved` ×2, `reconciliation.exception_escalated` ×1); and the operator workspace no longer lists the batch's exceptions.

Authority counts stayed at 74/59.

## Deferred / follow-up

- **Payment-level reconciliation flag re-derivation** across all sources (reconciliation + disputes) so a payment un-flags only when *no* source still flags it — deferred to avoid hiding active disputes.
- **Resolution history view.** Resolved/waived exceptions drop off the open queue; a closed-exception audit view is not built (the audit trail exists).
