# Phase 3 — Occupied-portfolio import (occupied-lease leg)

**Migration:** `supabase/migrations/20260727120000_phase_3_occupied_lease_import.sql` (forward-only; two
commands + one extended command; **no new table or RLS policy** — authority counts unchanged).

The portfolio import (`20260720121643`) creates empty properties/units. This slice imports the OCCUPIED
half: an operator maps a resident/lease roster (CSV) whose each row references an **already-imported
unit** and carries the primary resident + lease terms + an optional opening balance. Committing it
activates a live tenancy per row — the end-to-end goal of the occupied-portfolio journey for existing
units.

## What shipped

- **`create_import_job`** extended to accept `import_type IN ('portfolio','leases')`. The occupied-lease
  import is gated on the `imports.full` entitlement (portfolio stays on `imports.basic`); everything else
  (source-document readiness, row/column limits, idempotency, audit/outbox) is unchanged.
- **`validate_occupied_import(job, mapping, options)`** — per row: resolves the existing property (by
  name/address/locality/country) and unit (by code, must be `active`), validates the primary resident
  (name required; email/phone format), the lease (rent minor-units, currency = book currency, frequency,
  dates), and the opening balance; checks for an overlapping live tenancy on the unit and in-file
  duplicate units; writes `normalized_data` + `proposed_action` (`create_tenancy`/`error`/`skip`) and a
  `validationHash`. Sets the job `ready` only when zero rows error.
- **`commit_occupied_import(job, expectedHash)`** — atomically, per `create_tenancy` row: household +
  primary member, lease (`source='imported'`), receivable account, tenancy (`active`/`scheduled` by
  possession date), rent `charge_schedules`, and — when the opening balance ≠ 0 — a balanced opening
  journal (**1100 DR / 3900 CR**), mirroring `activate_existing_lease`'s postings exactly (minus the
  per-row signed-document requirement, which the document leg will add). Re-checks occupancy under a
  `FOR UPDATE` unit lock. Any error rolls the whole batch back to `failed` with no partial writes;
  hash/replay semantics match the portfolio commit.

App layers: the validate/commit API routes **dispatch by the job's `import_type`**; the create form
offers the occupied-lease type; the mapping UI renders the occupied field set; the detail page reports
activated tenancies + opening balances. `createImportJobSchema` accepts `'leases'`; the shared
`validateImportSchema` requires the common property-identity columns and lets the command enforce the
per-type set.

## Verification (`test:db`, embedded Postgres — inside `validateRecurringCharges()`)

A one-row occupied-lease import against a freshly created `active` unit: create → replay (same job) →
validate (`ready`, one create, zero errors) → commit (one tenancy, one opening balance) → replay (same
report document). Postconditions asserted on raw rows: an **active tenancy** with a rent schedule; the
opening journal posts exactly **150000 to 1100 DR and 3900 CR** and **total debits = total credits**; and
`generate_recurring_charges` then produces the tenancy's **first recurring rent charge** — i.e. the
imported tenancy is operational. A second job with an unknown-property row is flagged as a per-row error
(`errors=1`, status `mapping`) and its commit is refused (`IMPORT_NOT_READY`) — no partial writes.

`npm run check` (lint, typecheck, Vitest, `test:db`, build) is green; the migration was applied to the
live project.

## Follow-up (remaining §3 slices)

The `residents`- and `opening_balances`-only legs, the single-pass `combined` import (create
property+unit+lease in one row), multi-member households, true XLSX ingestion, and the document
ZIP+manifest flow remain unbuilt.
