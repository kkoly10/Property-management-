# Phase 8 Progress Report — Platform Control-Plane Foundation

**Status:** foundation implemented (migration, two lifecycle commands, unwired authorization helper, embedded-Postgres coverage). No HTTP surface and no policy wiring in this slice — deliberately the safe half.
**Date:** 2026-08-19

## Why this slice

The **platform control plane** — cross-org support access / "audited impersonation" — is the last named pilot gap in `CLAUDE.md` and is required by `docs/crecy-v4/01_…` §3.5, `09_…` §24 (time-limited elevation, mandatory reason, full audit, step-up auth), and the Phase 8 exit criterion "support actions are audited and constrained." It is also the largest and most dangerous remaining surface: done wrong, it is a cross-tenant data-leak engine. So this slice ships **only the record-keeping and lifecycle** — the audited, time-boxed grant and its start/end commands — and deliberately stops short of granting any actual access. An active support session in this slice reads **zero** cross-org rows.

## Implemented scope

- **`private.platform_actors`** — registry of platform staff (`support_agent` | `platform_admin`), `active` | `suspended`, unique per `user_id`. Distinct from `public.organization_memberships`: a platform actor helps a customer org **without** a membership row in it.
- **`private.support_sessions`** — a time-boxed grant: platform actor → target org, with a mandatory 8–500 char `reason`, `access_scope` fixed to `read_only` (column exists for forward-compat; only `read_only` is accepted), `status` ∈ `active|ended|revoked|expired`, `expires_at`, and a check that a closed session has an `ended_at` while an active one does not. Both tables live in schema `private` (definer-only, never browser-exposed, like `idempotency_records`/`outbox_events`), so **no RLS policy is added**.
- **`private.has_active_support_session(target_organization)`** — the single, reviewable gate a *later* slice will OR into tenant policies. Defined and unit-tested now, **wired into nothing** — an active session is inert until a deliberate future change adds it to a policy alongside sensitive-field masking, read-only enforcement, and a visible impersonation banner (per doc 09).
- **`public.start_support_session(p_organization_id, p_reason, p_ttl_minutes, p_idempotency_key)`** — mirrors `invite_staff_member`: AAL2 step-up required (`MFA_STEP_UP_REQUIRED`), caller must be an active platform actor (`NOT_PLATFORM_ACTOR`), reason mandatory (`AUDIT_REASON_REQUIRED`/`INVALID_SUPPORT_REASON`), TTL 5–240 min (`INVALID_SUPPORT_TTL`), target org must exist and not be `closed` (`ORGANIZATION_NOT_FOUND`). Idempotent; one audit + one outbox event, both `actor_type='support'`.
- **`public.end_support_session(p_organization_id, p_support_session_id, p_disposition, p_idempotency_key)`** — `disposition` ∈ `ended|revoked`. The session's own actor may close it; a `platform_admin` may close anyone's (`SUPPORT_SESSION_FORBIDDEN` otherwise). `SUPPORT_SESSION_NOT_ACTIVE` is checked **after** the idempotency short-circuit so a true replay returns the stored result rather than tripping on the session this same call already closed.

## Architecture and controls

- **The bypass surface is a single function.** All future cross-org read power will route through `has_active_support_session()` and nothing else, so the grant is auditable in one place. Keeping it out of `has_org_permission` means a reviewer never has to reason about support access when reading ordinary permission logic.
- **The decisive test is negative.** Because the helper is wired nowhere, the load-bearing assertion is that an actor holding an `active` session still gets **zero** rows from real operator queries. That test is what prevents a silent bypass from being introduced later without someone noticing this invariant break.
- **Defense in depth even though inert:** AAL2 step-up, mandatory reason, mandatory TTL with a hard 240-minute ceiling, `actor_type='support'` on every audit row, and closed-org rejection are all enforced now, so the record is trustworthy the day a policy first honors it.
- **No new RLS policies; two new `private` tables.** Authority table count moves 74 → 76 (mirrored into `docs/crecy-v4/12_P0_EXECUTABLE_SCHEMA.sql`); policy count is unchanged at 59.

## Files

- `supabase/migrations/20260726100000_phase_8_platform_control_plane_foundation.sql`
- `docs/crecy-v4/12_P0_EXECUTABLE_SCHEMA.sql` (authority tables + count)
- `docs/crecy-v4/14_P0_COMMAND_API_EVENT_CONTRACTS.md` (§4.29/4.30 + event catalog)
- `docs/crecy-v4/17_P0_DATA_CONTRACT_TRACEABILITY_MATRIX.md` (control-plane row)
- `scripts/validate-schema.mjs`

## Verification evidence

`npm run check` passes end-to-end: ESLint, TypeScript, the Vitest suite, the embedded-Postgres suite, and the production build. `test:db` seeds four users (two support agents, one platform admin, one non-platform user) and asserts:

- **Rejections** — `MFA_STEP_UP_REQUIRED` (no AAL2), `NOT_PLATFORM_ACTOR` (ordinary user), `AUDIT_REASON_REQUIRED` (blank reason), `INVALID_SUPPORT_TTL` (out of 5–240), and `ORGANIZATION_NOT_FOUND`.
- **Success + replay** — a started session returns `status='active'` with the computed `expiresAt`; an identical replay returns the same session; exactly one `actor_type='support'` audit row and one outbox row are written.
- **The decisive inert-grant test** — with an `active` session in hand, the agent's `get_operator_maintenance_workspace` returns **zero** items and `get_operator_receivables_summary` is empty. The foundation grants no data access.
- **Time-box** — a session forced past `expires_at` makes `has_active_support_session()` return false.
- **Lifecycle authorization** — a *second* agent gets `SUPPORT_SESSION_FORBIDDEN` ending someone else's session; the owner ends its own; the end replays; a re-end raises `SUPPORT_SESSION_NOT_ACTIVE`; and `has_active_support_session()` is false after the end.

Authority counts asserted at 76 tables / 59 policies.

## Deferred / follow-up

- **Policy wiring (the dangerous half).** A later slice ORs `has_active_support_session()` into selected tenant read policies — but only together with (a) sensitive-field masking / a read-only projection, (b) hard enforcement that no *write* command honors a support session, and (c) a visible impersonation banner surfaced to the operator whose org is being accessed. None of that exists yet, which is exactly why the helper is inert today.
- **Platform HTTP surface.** No `api/*` route calls these commands yet; the platform console (actor management, session start/stop UI, active-session list) is unbuilt.
- **Expiry sweep.** `status='expired'` is a valid terminal state, but nothing flips a lapsed `active` row to `expired` on a schedule yet — `has_active_support_session()` already treats `expires_at <= now()` as inactive, so this is cosmetic/reporting hygiene, not a security gap.
- **Actor provisioning.** `platform_actors` rows are seeded out of band in this slice; a governed command to add/suspend platform actors (itself step-up- and admin-gated) is a follow-up.
