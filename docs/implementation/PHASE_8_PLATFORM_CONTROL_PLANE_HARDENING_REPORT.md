# Phase 8 — Platform control-plane hardening (corrections A–F)

**Migration:** `supabase/migrations/20260727110000_phase_8_platform_control_plane_hardening.sql`
(forward-only; redefines functions + adds one partial unique index; authority table/policy counts
unchanged at 76/59; **no tenant RLS touched** and `has_active_support_session` remains ORed into zero
tenant policies).

This slice hardens the platform control plane that shipped in `20260726100000` (foundation) +
`20260727100000` (sanitized support queries + console). It is a correction batch, not new surface.

## A — Race-free last-admin cardinality

Provisioning a `platform_admin`, and every `set_platform_actor_status` (activate/suspend), now take a
single **transaction-scoped advisory lock** (`pg_advisory_xact_lock(hashtext('crecy.platform_admin_cardinality'),0)`)
before re-reading the active-admin count under the lock. Two concurrent suspends of different admins can
no longer both observe two active admins and both commit — the lock serializes them, and the second sees
the post-first count and is refused with `CANNOT_SUSPEND_LAST_ADMIN`. At least one active admin always
remains (no lockout).

**Test (embedded Postgres):** PGlite is single-connection, so the test proves the *serialized outcome*
the lock guarantees: provision a second admin (2 active), suspend the first (2→1, allowed), then suspend
the last (refused); assert exactly one active admin remains; and statically assert both cardinality
commands contain `pg_advisory_xact_lock`. Limitation (documented in the migration header + test): a
literal two-transaction race cannot run under PGlite; the advisory lock + the assertions are the
guarantee.

## B — One active, unexpired support session per platform actor, globally

`start_support_session` now takes a **per-actor advisory lock**
(`pg_advisory_xact_lock(hashtext('crecy.support_session'), hashtext(actor::text))`), materializes any
lapsed `active` session to `expired` (so authorization and the invariant see truth), short-circuits a
true idempotent replay, then refuses a second concurrent session with `SUPPORT_SESSION_ALREADY_ACTIVE`
(safe metadata — target org, session id, expiry — in `DETAIL`). A **partial unique index**
(`support_sessions_active_per_actor_unique on (user_id) where status='active'`) enforces the invariant at
the storage layer as defense-in-depth. This keeps `authorize_support_query` from ever choosing among two
active sessions.

**Tests:** same-org second session → refused; different-org second session → refused (invariant is
global, not per-org); the partial unique index exists; an expired prior session does **not** block a new
one (materialization); a genuine idempotent replay returns the same session, never a spurious conflict.

**UI:** the persistent banner now mints **one idempotency key per session+action** (a single shared key
collided across sessions); the start route maps `SUPPORT_SESSION_ALREADY_ACTIVE` → 409; and the
diagnostics page surfaces an already-active session (disabling the start form and pointing at the banner
End).

## C — Deterministic current-subscription selector

`support_get_organization_overview` selects exactly one current subscription via a `left join lateral …
order by (status in ('trialing','active','past_due','restricted')) desc, created_at desc, id desc limit
1`. A historical **canceled Starter** never masks a current **Growth trial**.

**Test:** seed an older canceled Starter alongside the seeded Growth/trialing row → the DTO reports
`growth`/`trialing` deterministically.

## D — MFA step-up path (no new secrets, DB gate untouched)

The DB requirement is unchanged: `start_support_session`/provisioning still require `auth.jwt()->>'aal' =
'aal2'`. The UI now **reuses the existing** `/settings/security/mfa` flow (Supabase
`getAuthenticatorAssuranceLevel` + `challengeAndVerify`, which already honors an arbitrary `/`-prefixed
`returnTo`). The diagnostics page reads the caller's assurance level and, at AAL1, shows a "Verify with
MFA" affordance (returning to `/platform/<org>`) instead of the start form; the start form additionally
routes a submit-time 403 step-up back through the same flow. No custom TOTP secrets, no app-table secret
storage, no weakening of the DB gate.

**Coverage:** the DB gate (`MFA_STEP_UP_REQUIRED` at AAL1) is proven in the embedded suite; the browser
wiring is covered by `e2e-connected/platform-support.spec.ts` (tagged `@external` — it needs a seeded
platform actor; the AAL2 happy path needs a TOTP-enrolled actor and stays provider-blocked).

## E — Full connected certification command

`npm run test:e2e:connected` stays the lenient developer run (self-skips legs whose fixtures are absent;
**not** a certification). New `npm run test:e2e:connected:full`
(`playwright.connected.full.config.ts` + `playwright.certification-reporter.ts`) is the certification: it
**fails at config load** unless every required non-provider-blocked P0 fixture is present (a missing one
would self-skip a required leg), builds the app against the connected env, and the reporter turns any
required skip or failure into a non-zero exit while reporting **specs / executed / passed / failed /
skipped / externally-excluded**. Provider-blocked journeys (Stripe payments/refunds/payouts,
staff-invitation email, platform support-session MFA happy path) are the only allowed exclusions — a spec
that needs them is tagged `@external`, and the reporter enumerates them.

## F — Documentation reconciled to migrations

`CLAUDE.md`: the stale "no generic accounts-payable or repairs-expense code" / "only liability" / "only
expense" claims are removed and the chart of accounts is reconciled to the migrations (verified codes:
`1000/1010/1020/1090` source cash-clearing, `1030` Stripe clearing, `1040` operating cash clearing,
`1100` AR, `1150` owner receivable, `2000` AP, `2100` owner payable, `3900` opening-balance equity,
`3905` owner-distribution clearing, `4000` rental income, `4100` management-fee income, `6100`
payment-processing fees, `6200` repairs and maintenance, `6300` bad-debt expense). The remaining-P0 note
now records the platform read-half as shipped (with the zero-policy invariant called out as
do-not-regress) and lists what is genuinely still unbuilt (mutating support actions; a provisioning
console UI). The prior PHASE_8 report's contradictory "console is the next slice" note is corrected.

## Verification

`npm run test:db` is green (the A/B/C adversarial coverage lives in the control-plane block of
`validateRecurringCharges()`); `npm run lint` + `npm run typecheck` pass; Playwright discovers all
connected specs (including the `@external` platform leg) and loads the certification reporter; both
connected configs fail closed at load without their required env. The `test:db` guard still asserts
**zero** `public`/`reporting` policies reference `has_active_support_session`.
