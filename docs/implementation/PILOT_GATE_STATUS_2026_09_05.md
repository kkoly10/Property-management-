# Pilot gate status — 2026-09-05

Evidence-based review of the ten gates in
`CRECY_PILOT_READINESS_IMPLEMENTATION_PLAN.md` §13. Every "verified" line below names the
command or query that produced it. Anything I did not run myself is marked **unverified**
rather than assumed.

---

## Headline: the rent cron had never once charged rent

`public.charges` was empty in production, and `private.charge_generation_runs` held no
worker run at all. The hourly cron had been returning 502 since it was wired up.

**Root cause.** The three financial validators are `DEFERRABLE INITIALLY DEFERRED`
constraint triggers. A deferred trigger does not run inside the `security definer` command
that queued it — it runs at COMMIT, as the session role. All three read an RLS-protected
base table to compute their invariant. Measured directly against the production engine:

```
OBSERVED: trigger ran as authenticated and saw 0 row(s)
```

— for a row that the same transaction had just inserted, hidden from the validator by the
reader's own RLS policy.

Two consequences from one cause:

| | |
|---|---|
| **Availability** | `service_role` holds no SELECT on the financial tables, so every worker-driven financial write aborted at COMMIT with `permission denied for table journal_entries` — *after* the command had already returned a success payload. This killed the rent cron, and **verified: it took down the entire money-in path too** — `process_stripe_webhook` is `service_role`-granted, is called through `createAdminClient()`, and inserts `journal_transactions`, two `journal_entries` legs and a `payment_allocations` row, every one of them guarded by a failing validator. A resident card payment would have been taken by Stripe and then rolled back on our side. |
| **Correctness** | For a role that *does* hold SELECT, the balance check summed only the legs that role's own policy exposed. A balance check over a filtered subset is not a balance check. |

**Fix.** `20260905010000_phase_4_deferred_constraint_authority.sql` runs the three
validators as their owner. This widens nothing: they take no caller-supplied arguments,
perform no writes, cannot be invoked outside a trigger, and already pin an empty
`search_path` with every reference schema-qualified.

**Blast radius.** The failure was **fail-closed** — the transaction aborted, so no
unbalanced or over-allocated row was ever written. Nothing needs correcting, only
unblocking.

**Verified after the fix.** The exact probe that previously died with `permission denied`
now completes as `service_role` with `set constraints all immediate` firing, generating 4
charges (rolled back). All three triggers report `prosecdef = true`.

**Regression protection.** PGlite restores the definer context and therefore *cannot*
reproduce this — a behavioural probe would pass with or without the fix, which is why the
guard added to `scripts/validate-schema.mjs` is structural: every deferred constraint
trigger must own the authority to read what it validates. Verified by mutation — with the
fix disabled, the guard names all three offenders and `test:db` fails.

---

## Gate-by-gate

### Gate 1 — Production identity · **GREEN**
- Vercel production project `prj_aNCfQyXExaFAJXOGcmAiyjODcJc0` serving `app.crecyos.com`.
- Supabase project `tbivpbbejttacfcqeqia` (*Property-management*). The former `Property`
  project (`alrirkvfcmhqumqaidxj`) is paused, and production no longer references it.
- **Migrations reconciled**: all 65 repo migrations are recorded in
  `supabase_migrations.schema_migrations` — `db push` is a clean no-op.
- Auth: `SITE_URL = https://app.crecyos.com`; redirect allowlist covers app/owner/apex
  `crecyos.com` and `crecyliving.com` (+ `*.crecyliving.com`, `/**`).
- Storage: exactly one bucket, `private-documents`; zero public buckets.

### Gate 2 — Runtime · **AMBER** (was RED)
| Item | Status |
|---|---|
| Server Supabase secret | GREEN — cron and relay both authenticate |
| Recurring-charge cron | **FIXED today**; awaiting the scheduled 05:00 UTC run as proof |
| Notification cron | GREEN — 200 on every 10-minute run |
| Scanner cron | **RED** — 503 on every run; `CRECY_DOCUMENT_SCAN_RELAY_URL`/`_SECRET` unset |
| Recovery cron | Pending — daily at 04:17 UTC, not yet observed |
| Failure visibility | PARTIAL — `scheduledRunStatus` encodes outcome in the HTTP status (200/207/502) and Vercel retains logs, but there is **no error tracker** (no Sentry dependency in `package.json`) |

> Worth noting: the 502 was *correct behaviour*. The status ladder is what made a silently
> dead rent schedule visible at all. Without it this would have logged 200 forever.

### Gate 3 — Scanner · **RED**
No scan relay is configured, so `document-scans` 503s and no real provider has been
exercised. External configuration, not a code gap — the pipeline itself is built and
`test:db`-green (clean, rejected, dead-letter and stall-sweep paths all covered).

### Gate 4 — Communication / Auth · **AMBER**
- Email leaves the building: Resend on `mail.crecyos.com`, DKIM + SPF + MX verified,
  DMARC added. Branded HTML shipped. Confirmed received.
- The dead invitation link is fixed — the activation token now travels in the email
  (`20260905000000`), and passwordless sign-in exists for invited users who have no
  password.
- **Not yet done:** a real end-to-end invitation accepted by a human. Resident, owner and
  staff activation all remain unproven in production.

### Gate 5 — Maintenance · **unverified this session**
Implemented and green under `test:db`; previously connected-certified. Not re-exercised.

### Gate 6 — Owner · **unverified this session**
Implemented and green. The server-rendered immutable owner-statement PDF remains a tracked
follow-up (print-to-PDF and CSV ship today).

### Gate 7 — Stripe · **AMBER / unverified**
`STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are present in the production environment,
so this may be less blocked than previously recorded — but their values are masked and no
Connect flow, test payment or signed webhook has been exercised against them.

**This gate could not have passed before today whatever the keys said.** Verified by reading
the migration: `process_stripe_webhook` runs as `service_role` and writes both journal legs
and a payment allocation, so it hit exactly the commit-time wall above. Anyone testing a
resident payment before today would have concluded the Stripe integration was broken. It was
not — the commit boundary was.

### Gate 8 — Legal · **founder/counsel action**
The court-defensible signature ceremony, ESIGN §7001(c) consent, append-only signature
record with tamper-evident seal, and Certificate of Completion are built. Publishing an
approved pilot legal package is a human decision, not an engineering task.

### Gate 9 — Operational safety · **RED**
Nothing here is code. Outstanding: restore drill, named pilot operational owner,
documented pause/rollback rules, recorded last-known-good deployment, and an error
tracker. This is the largest untouched gate.

### Gate 10 — Full certification · **blocked** on 2, 3, 4, 7 and 9.

---

## What needs a person, not a commit

1. Configure the document scan relay (Gate 3) — or record a pilot exception.
2. Accept one real invitation end to end, on each of the three surfaces (Gate 4).
3. Decide whether the Stripe keys in production are live test keys, and exercise one
   payment (Gate 7).
4. Publish the approved legal package (Gate 8).
5. Gate 9 in full — it is entirely operational.
6. Sign up for a DMARC monitor and supply the `rua` address.
