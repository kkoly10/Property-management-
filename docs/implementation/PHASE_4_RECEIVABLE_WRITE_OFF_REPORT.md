# Phase 4 Progress Report — Receivable Write-Off

**Status:** implemented end-to-end (migration, command, API route, operator UI, embedded-Postgres + Vitest coverage)
**Date:** 2026-08-06

## Why this slice

"Write-offs" is a Phase 4 finance build item (`docs/crecy-v4/05_DELIVERY_PLAN…`) and a named pilot gap in `CLAUDE.md`. The `charge_status` enum already carried `'written_off'` and every read surface already filtered it out, but **no command ever set it** — an operator had no way to recognize uncollectible rent as bad debt. Uncollectible balances would sit open in accounts receivable forever. This slice adds the write-off command.

## Implemented scope

- **`public.write_off_receivable(p_organization_id, p_tenancy_id, p_charge_ids[], p_reason, p_idempotency_key)`** — a `security definer` command mirroring `record_manual_payment` in reverse (collecting a receivable → recognizing it as a loss). It gates on `finance.manage` for the tenancy's property, is idempotent, and writes one audit + one outbox event.
  - **Balanced journal:** for each charge, **DEBIT `6300` Bad debt expense** (new code, lazily upserted) / **CREDIT `1100` Accounts receivable**, by that charge's **remaining** balance (`amount_minor − Σ non-reversed allocations`) — never the face amount. The expense leg carries `property_id` so the loss flows onto the owner statement; the AR leg carries `tenancy_id` so the receivables summary (which sums ledger `1100` by tenancy) drops by exactly the amount written off.
  - **Charge state:** each written-off charge flips to `status = 'written_off'` and records the write-off journal in `voided_by_transaction_id` (the previously-unused terminating-transaction link).
  - **Availability guard** (`WRITE_OFF_CHARGE_NOT_AVAILABLE`) confirms every requested charge is an `open|partially_paid` receivable on the target tenancy/book. It runs **after** the idempotency short-circuit, so a replay returns the stored response instead of failing because the charges are now `written_off`. The charges are locked `for update`, so a concurrent payment can't change the remaining between the guard and the posting.
- **API** — `POST /api/v1/receivable-write-offs` with the sentinel→HTTP ladder (scope→403, tenancy-not-found→404, charge-not-available/idempotency-conflict/in-progress→409, book/receivable/amount/ledger errors→422).
- **Validation** — `writeOffReceivableSchema` (1–100 unique charge IDs, reason 3–1000) + Vitest.
- **Operator UI** — an "Uncollectible receivables" card on `/app/payments`: per tenancy with outstanding charges (reusing the existing manual-payment `options`, which already list `open|partially_paid` charges with their remaining), the operator selects charges, enters a reason, and writes them off, with the total and a destructive confirm.

## Architecture and controls

- **Reuses existing data.** The writable charge set is exactly what `get_manual_payment_options` already returns (`status in ('open','partially_paid')` with `remainingMinor`), so no new fetcher or RPC was needed — only `organizationId`/`tenancyId`/`chargeId`, all already present.
- **The invariant preserved:** *ledger-1100-balance-by-tenancy == Σ open-charge remainders*. Crediting `1100` by each charge's remaining while flipping that charge to `written_off` keeps both sides consistent — proven by asserting the tenancy's `1100` balance drops by exactly the written-off total.
- **No new tables or RLS policies.** Authority counts unchanged (74 tables / 59 policies).

## Files

- `supabase/migrations/20260725120000_phase_4_receivable_write_off.sql`
- `src/lib/validation/finance.ts` (+ `.test.ts`)
- `src/app/api/v1/receivable-write-offs/route.ts`
- `src/app/app/payments/write-off-charges-form.tsx`, `src/app/app/payments/page.tsx`
- `scripts/validate-schema.mjs`

## Verification evidence

`npm run check` passes end-to-end: ESLint, TypeScript, 103 Vitest tests (3 new write-off schema tests), the embedded-Postgres suite, and the production build. `test:db` generates a fresh September rent charge, **partially pays it (60000 of 185000)**, then writes off the remainder and asserts:

- **Rejections** — `PROPERTY_SCOPE_DENIED` (outsider), `TENANCY_NOT_FOUND`, `INVALID_WRITE_OFF_REASON`, `INVALID_WRITE_OFF_CHARGES`, and `WRITE_OFF_CHARGE_NOT_AVAILABLE` (both a foreign charge and a replay-with-new-key against an already-written-off charge).
- **The remaining, not the face amount** — `writtenOffMinor === 125000` (185000 − 60000), balanced debits/credits of 125000 with a property-carrying `6300` leg and a tenancy-carrying `1100` leg, and the tenancy's ledger-`1100` balance reduced by exactly 125000. (A bug posting the face amount would fail here — the fully-open case alone could not have caught it.)
- **Invariants** — the charge flips to `written_off` and links its terminating transaction; an identical replay returns the stored journal; a metadata `UPDATE` raises `APPEND_ONLY_RECORD`; exactly one `receivable.written_off` audit + outbox event.

Authority counts stayed at 74/59.

## Deferred / follow-up

- **Opening-balance / whole-tenancy write-off.** A tenancy's ledger-`1100` balance can also include an opening balance posted with no backing charge (`activate_existing_lease`). A charge-scoped write-off structurally cannot clear that non-charge AR; a `receivable_account`-scoped write-off that zeroes the full ledger balance (reconciling the non-charge remainder) is a follow-up.
- **Partial-amount write-off** of a single charge (writing off less than its remaining) is out of scope; today a charge is written off in full.
