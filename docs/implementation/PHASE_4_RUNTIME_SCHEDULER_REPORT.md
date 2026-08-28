# v4.2 Batch A2 — Runtime scheduler / orchestrator

## The two defects this closes

**(1) Nothing ever called the workers.** `generate_recurring_charges`, the notification drain and (as of
A1) the document-scan drain all existed, were tested, and worked. No scheduler invoked any of them. In a
deployed product that means no rent was ever charged, no transactional message was ever sent, and no
document ever left quarantine. File 27 §8: *"a worker without a real caller is not runtime-complete."*

**(2) One naive UTC date for every property.** `generate_recurring_charges` takes a single `p_run_date`
and applies it to every due schedule. A scheduler passing UTC `current_date` would charge a Los Angeles
property on the 1st while it is still the 31st there — wrong due date and wrong journal effective date,
every month, for most of the portfolio.

## What shipped

| Layer | Artifact |
| --- | --- |
| Migration | `supabase/migrations/20260828110000_phase_4_runtime_scheduler.sql` |
| Selector | `public.list_due_charge_schedule_batches(p_at, p_limit)` — due schedules partitioned by property time zone |
| Recovery | `public.sweep_expired_operational_records(p_limit)` — abandoned upload grants, expired idempotency records |
| Helpers | `private.operational_date(zone, at)`, `private.is_known_time_zone(zone)` |
| Auth | `src/lib/runtime/worker-auth.ts` — fail-closed, constant-time, header-only |
| Runners | `src/lib/runtime/jobs.ts` — one implementation shared by the cron and POST surfaces |
| Health | `src/lib/runtime/health.ts` — 200 / 207 / 502 by real outcome |
| Schedule | `src/lib/runtime/schedule.ts` + generated `vercel.json` |
| Cron routes | `/api/internal/cron/{recurring-charges,notifications,document-scans,operational-sweep}` |
| Gate | `npm run schedule:check`, added to `npm run check` |

No table and no RLS policy is added, so the authority counts are unchanged (77 / 59).

## The time-zone fix, precisely

`list_due_charge_schedule_batches` groups active schedules by their **property's** `time_zone`, computes
`(p_at at time zone that_zone)::date` for each, and returns only the schedule ids whose `next_run_on` has
arrived **on that zone's local date**. The scheduler then calls the existing, proven command once per
zone with that zone's date and that zone's id list. The command itself is unchanged.

**Duplicate safety comes from the worker-run id**, which the database derives from
`(zone, local date, exact sorted schedule id set)`. An identical due set therefore produces an identical
run id *and* an identical request hash, so a repeated or overlapping invocation replays the stored
response instead of double-charging. `generate_recurring_charges` already takes
`pg_advisory_xact_lock(worker_run_id)`, so two concurrent runs serialize: the second finds the first's
completed record and replays.

An unrecognized `properties.time_zone` is reported in `invalidTimeZones` and skipped — one bad zone must
not stop rent generation for every other property.

## Fail-closed scheduler authentication

- **An unset or placeholder secret authenticates nothing.** A worker route on an unconfigured deployment
  is closed, never open.
- **Header only.** A credential in the query string is *rejected outright*, not ignored — by then it is
  already in every access log along the path, so the request is treated as burned.
- **Constant-time comparison**, with the length check first (`timingSafeEqual` throws on a length
  mismatch, and length alone is not the secret).
- Vercel Cron's `Authorization: Bearer $CRON_SECRET` is accepted on `/api/internal/cron/*`;
  `CRECY_INTERNAL_WORKER_SECRET` is accepted on both surfaces so the jobs can be driven by hand.
  A cron credential is **not** an operator credential.
- No service-role credential is read in the auth path. Database authority comes from
  `SUPABASE_SECRET_KEY` inside `createAdminClient`, server-side only.

## Verification

`npm run check` green: lint, typecheck, **215 vitest tests across 40 files**, `test:db`,
`schedule:check`, build.

### Time-zone boundary tests (`test:db`)

Three materially different North American zones — `America/New_York` (EDT −4),
`America/Los_Angeles` (PDT −7), `Pacific/Honolulu` (HST −10, no DST) — each with an active tenancy and a
monthly schedule due `2026-09-01`, evaluated across UTC midnight and the month boundary:

| Instant | New York | Los Angeles | Honolulu | Due |
| --- | --- | --- | --- | --- |
| `2026-09-01T03:00Z` | Aug 31 | Aug 31 | Aug 31 | none |
| `2026-09-01T06:00Z` | **Sep 1** | Aug 31 | Aug 31 | **New York only** |
| `2026-09-01T09:00Z` | Sep 1 | **Sep 1** | Aug 31 | New York + Los Angeles |
| `2026-09-01T11:00Z` | Sep 1 | Sep 1 | **Sep 1** | all three |

The 06:00Z row is the decisive one: a naive UTC `current_date` reads `2026-09-01` and would charge all
three. Asserted end to end — running the Los Angeles batch produces exactly one charge whose `due_date`
**and** `journal_transactions.effective_date` are `2026-09-01`, leaves the other two zones' schedules
untouched, advances only its own schedule to `2026-10-01`, and replays (not double-charges) on a repeated
invocation.

Also asserted: `service_role`-only grants; batch-size validation; worker-run ids unique per zone and
stable across evaluations; paused schedules and closed tenancies never offered; an unknown zone reported
without aborting the run; and the sweep expiring stale grants, purging expired idempotency records, and
being idempotent on a second pass.

### Mutation testing

| Mutation | Result |
| --- | --- |
| **Use a naive UTC date for every zone** (the defect itself) | **CAUGHT** |
| Worker-run id ignores the zone (two zones collide) | **CAUGHT** |
| Worker-run id ignores the schedule set (unstable across runs) | **CAUGHT** |
| An unknown time zone aborts the whole run | **CAUGHT** |
| Closed tenancies still offered as due | **CAUGHT** |
| Sweep does not expire stale upload grants | **CAUGHT** |

## Weaknesses found in adversarial review and fixed here

**A cron that always answered 200 would look healthy while failing everything.** The runner deliberately
continues past a failing batch so one misconfigured organization cannot hold up rent everywhere else —
but that also meant a run where *every* batch failed returned 200. `scheduledRunStatus` now maps the real
outcome: `200` for success or an empty queue, `207` for partial failure, `502` when nothing succeeded.
Partial failure must not read as total failure, and total failure must not read as success.

## Corrected after adversarial review

**Isolation existed BETWEEN zones, not within one.** The runner continues past a failing batch, which
the report described as "a misconfigured book in Denver cannot be allowed to hold up rent in every other
market". True — but *inside* a zone there was no isolation at all: the selector filtered only schedule
status, due date and tenancy status, while `generate_recurring_charges` raises on four more conditions
from inside its loop. One raise rolls the whole batch back, the `charge_generation_runs` row included,
so the zone produced zero charges — and the next hourly run derived the identical worker-run id and
failed identically, forever. Confirmed by execution: closing one receivable account in a six-schedule
New York batch left the five healthy schedules with **0 charges**.

**Arrears cleared at most one period per local day.** The worker-run id was derived from schedule IDs,
which do not change when a period is charged, so the second run of the same local date replayed instead
of advancing.

**A skipped time zone reported HTTP 200.** `invalidTimeZones` never reached the status calculation, so a
run in which an entire zone's rent silently did not generate looked perfectly healthy — the exact
failure `health.ts` was written to prevent.

All three are fixed in `20260828140000_phase_8_batch_a_review_corrections.sql` and covered by tests that
fail when reverted.

## Not done here (stated, not hidden)

- **No cron has ever fired.** The schedule is defined and verified in the repository, but nothing has run
  on a real deployment. Per file 27 §15 this is `schedulers: configured, not exercised`.
- **Two of the four jobs are environment-blocked.** Notifications and document scans return **503**
  without their relays configured. Rent generation and the sweep need nothing beyond the database.
- **Vercel plan constraint.** Hobby caps cron jobs at 2 and allows only daily schedules; this schedule
  needs a plan permitting four sub-daily jobs, or an external scheduler calling the same routes.
- **Only the `email` channel is drained on a schedule.** Verified: `email` is the only channel any
  command currently enqueues. Adding `sms`/`whatsapp`/`push` enqueues would need matching cron entries.
