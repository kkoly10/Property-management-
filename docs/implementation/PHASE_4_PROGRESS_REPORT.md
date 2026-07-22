# Phase 4 Progress Report — Charges, Manual Payments, Receipts, and Corrections

**Status:** recurring charges, controlled manual payments, and manual-payment corrections implemented; Phase 4 remains in progress
**Date:** 2026-07-22

## Implemented scope

- Idempotent recurring-rent generation with balanced accounts-receivable journals.
- Property-scoped `finance.manage` manual-payment command for cash, checks, external bank transfers, and other externally received funds.
- Exact multi-charge allocation, stable charge locking, and payment/charge over-allocation constraints.
- Configurable evidence threshold with same-scope, scanned-clean document validation.
- Duplicate external-reference detection and request replay protection.
- Balanced payment journals, immutable financial history, append-only system receipts, audit records, and outbox events.
- Operator `/app/payments` workspace, payment-entry review flow, and receipt views.
- Resident ledger balance, remaining next-due amount, payment history, and scoped receipt access.
- Optimistically versioned manual-payment metadata, allocation, return, and reversal corrections.
- Append-only allocation history, balanced corrective journals, reopened receivables, and resident-visible correction timelines.
- Operator payment-detail route with canonical status, journal/receipt links, allocation history, and a two-step correction review.

## Deferred scope

- Connected-account provider refunds, write-offs, accounting-period controls, and reconciliation resolution.
- Online provider payment attempts and settlement reconciliation, which remain Phase 5 work.
- Production scheduling/queue infrastructure, monitoring, pagination, and localization hardening.

## Architecture and controls

- All monetary values use integer minor units and the accounting book currency.
- `record_manual_payment` performs authorization, evidence checks, charge locks, journal posting, allocations, receipt creation, audit, and outbox writes in one transaction.
- Manual payments must be fully allocated; unapplied money is intentionally excluded from this pilot slice.
- Successful receipts are `system_generated` and cannot be updated or deleted. Corrections use `reverse_or_correct_payment`; original receipts and journals remain historical records.
- Return and reversal corrections reverse active allocations, reopen charge state, and post a new debit to resident receivables with an offsetting credit to the original manual-payment asset account.
- Allocation corrections retain prior rows, insert replacement rows, and post a balanced zero-net control journal. Metadata corrections are audited and evented without an economic journal.
- Expected payment status/version and actor-scoped idempotency prevent stale writes and duplicate correction journals.
- Browser roles can read only authorized payment rows; all writes go through the security-definer command with explicit execute grants.
- Balances are derived from posted account-receivable journal entries, never edited directly.

## Files

- `supabase/migrations/20260720144109_phase_4_recurring_charges.sql`
- `supabase/migrations/20260720150956_phase_4_manual_payments.sql`
- `supabase/migrations/20260722125015_phase_4_payment_corrections.sql`
- `src/app/api/v1/manual-payments/route.ts`
- `src/app/api/v1/payments/[paymentId]/corrections/route.ts`
- `src/app/app/payments/page.tsx`
- `src/app/app/payments/[paymentId]/`
- `src/app/app/payments/record/`
- `src/app/receipts/[documentId]/page.tsx`
- `src/app/home/page.tsx`
- `src/lib/data/finance.ts`
- `src/lib/validation/finance.ts`
- `scripts/validate-schema.mjs`

## Verification evidence

The embedded Postgres harness covers canonical replay, mismatched replay rejection, evidence enforcement, duplicate external references, over-allocation rejection, balanced payment and correction journals, stale-version denial, retained/reversed allocations, immutable financial fields, event traces, resident access, and outsider isolation. The verified reversal returns the resident balance to `227500` minor units and reopens the `185000` charge after the original `85000` payment.

Run `npm run check` for ESLint, TypeScript, Vitest, embedded Postgres, and the production build. Browser verification covers the payment list and payment-detail correction controls with no error overlay or console errors.

## Forward-fix policy and known risks

Migrations are forward-only. Correct defects with a new migration and reconciliation query; do not rewrite posted financial history. The main remaining risks are provider refund/reconciliation workflows, production job operations, and large-organization query pagination.
