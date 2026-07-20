# Phase 4 Progress Report — Charges, Manual Payments, and Receipts

**Status:** recurring charges and controlled manual payments implemented; Phase 4 remains in progress
**Date:** 2026-07-20

## Implemented scope

- Idempotent recurring-rent generation with balanced accounts-receivable journals.
- Property-scoped `finance.manage` manual-payment command for cash, checks, external bank transfers, and other externally received funds.
- Exact multi-charge allocation, stable charge locking, and payment/charge over-allocation constraints.
- Configurable evidence threshold with same-scope, scanned-clean document validation.
- Duplicate external-reference detection and request replay protection.
- Balanced payment journals, immutable financial history, append-only system receipts, audit records, and outbox events.
- Operator `/app/payments` workspace, payment-entry review flow, and receipt views.
- Resident ledger balance, remaining next-due amount, payment history, and scoped receipt access.

## Deferred scope

- Payment reversals, refunds, write-offs, accounting-period controls, and reconciliation resolution.
- Online provider payment attempts and settlement reconciliation, which remain Phase 5 work.
- Production scheduling/queue infrastructure, monitoring, pagination, and localization hardening.

## Architecture and controls

- All monetary values use integer minor units and the accounting book currency.
- `record_manual_payment` performs authorization, evidence checks, charge locks, journal posting, allocations, receipt creation, audit, and outbox writes in one transaction.
- Manual payments must be fully allocated; unapplied money is intentionally excluded from this pilot slice.
- Successful receipts are `system_generated` and cannot be updated or deleted. Corrections must use the future reversal workflow.
- Browser roles can read only authorized payment rows; all writes go through the security-definer command with explicit execute grants.
- Balances are derived from posted account-receivable journal entries, never edited directly.

## Files

- `supabase/migrations/20260720144109_phase_4_recurring_charges.sql`
- `supabase/migrations/20260720150956_phase_4_manual_payments.sql`
- `src/app/api/v1/manual-payments/route.ts`
- `src/app/app/payments/page.tsx`
- `src/app/app/payments/record/`
- `src/app/receipts/[documentId]/page.tsx`
- `src/app/home/page.tsx`
- `src/lib/data/finance.ts`
- `src/lib/validation/finance.ts`
- `scripts/validate-schema.mjs`

## Verification evidence

The embedded Postgres harness covers canonical replay, mismatched replay rejection, evidence enforcement, duplicate external references, over-allocation rejection, balanced payment journals, partial charge status, immutable receipts, event traces, resident access, and outsider isolation. The verified example reduces the resident balance to `142500` minor units and the remaining due amount to `100000` after an `85000` payment.

Run `npm run check` for ESLint, TypeScript, Vitest, embedded Postgres, and the production build. Browser verification covers desktop payments and manual entry plus mobile resident history and authenticated receipts.

## Forward-fix policy and known risks

Migrations are forward-only. Correct defects with a new migration and reconciliation query; do not rewrite posted financial history. The main remaining risks are reversal/reconciliation workflows, production job operations, and large-organization query pagination.
