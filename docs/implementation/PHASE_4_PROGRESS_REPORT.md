# Phase 4 Progress Report — Recurring Charges and Resident Balance

**Status:** recurring-charge vertical slice implemented; Phase 4 remains in progress
**Date:** 2026-07-20

## Intended and actual scope

This slice implements the first Phase 4 journey from the active tenancy created in Phase 3 through a posted recurring rent charge and a resident-visible balance. It does not claim completion of the full payments phase.

Implemented:

- worker-authenticated `GenerateRecurringCharges` route and database command;
- due-schedule locking, worker-run replay protection, and canonical charge idempotency;
- accounts-receivable and rental-income journal posting;
- book-currency enforcement and first-posting currency lock;
- append-only journal transactions and entries;
- `charge.posted` audit and outbox records;
- operator Money workspace with property-scoped receivable summaries;
- sanitized resident balance/next-due projection and `/home` experience.

Deferred to later Phase 4 slices:

- manual payments, allocations, receipts, reversals, write-offs, and accounting-period controls;
- online provider payment attempts and reconciliation, which remain Phase 5 work;
- production scheduling/queue infrastructure and operational alerting.

## Architecture decisions

- Monetary values remain integer minor units and use the accounting book's immutable currency.
- The worker calls a single transactional database function through a server-only service client. Browser roles have no execute permission.
- A worker run ID identifies the full request and returns the original charge IDs on replay. Per-charge journal idempotency remains `charge:{scheduleId}:{dueDate}:{chargeType}`.
- Resident balances are derived from posted accounts-receivable journal entries. Residents receive a sanitized DTO rather than raw journal rows.
- Monthly and longer cadences preserve the configured due day and clamp it to the target month's final day.

## Files and migration

- `supabase/migrations/20260720144109_phase_4_recurring_charges.sql`
- `src/app/api/internal/charge-schedules/generate/route.ts`
- `src/lib/validation/finance.ts`
- `src/lib/data/finance.ts`
- `src/app/app/money/page.tsx`
- `src/app/home/page.tsx`
- `scripts/validate-schema.mjs`

## Security and financial review

- `charges` has RLS and read-only Data API grants for authorized operators or the related resident.
- The internal generation function is executable only by `service_role`; the HTTP route additionally requires a timing-safe bearer-secret comparison.
- Operator summaries honor effective property-scoped `finance.read`/`finance.manage` access.
- Resident summaries explicitly test the caller's active household relationship.
- Journal balance is checked by a deferred constraint trigger, and posted journal rows reject updates/deletes.
- Cross-book and cross-currency schedule inconsistencies fail the whole transaction.

## Verification evidence

`npm run check` passed:

- ESLint: pass;
- TypeScript: pass;
- Vitest: 8 files, 25 tests passed;
- embedded Postgres harness: pass, including one canonical recurring charge, replay, balanced journal, month-end cadence, immutable book currency/journals, resident balance `227500`, and outsider charge count `0`;
- Next.js production build: pass.

Browser verification passed for desktop `/app/money` and mobile `/home`: meaningful content rendered, expected controls were present, no console errors or warnings were reported, and no framework error overlay was present.

## Performance and cost observations

- Due schedules use indexed status/book paths and are locked in stable ID order.
- The command caps explicit schedule batches at 500. Large production runs should be partitioned by the future scheduler.
- Summary projections are bounded to authorized active/scheduled tenancies; pagination should be added before the largest-organization workload test.
- No new external provider or per-transaction infrastructure cost is introduced in this slice.

## Migration and forward-fix plan

The migration is forward-only. It backfills `accounting_books.first_posted_at` from existing journal transactions before enabling the currency immutability trigger. If a defect is found, ship a corrective migration and reconciliation query; do not delete or rewrite posted journal history.

## Known risks

- Production worker scheduling, retries, and monitoring are not yet wired.
- A due schedule attached to a non-active tenancy fails the transaction by design; tenancy status automation is still needed.
- Operator and resident summaries need pagination/localization hardening for later release gates.
- Payments and allocations are absent, so balances currently reflect opening positions plus posted charges only.
