# Phase 8 — Platform control plane: sanitized support-query surface + actor provisioning

**Migration:** `supabase/migrations/20260727100000_phase_8_platform_support_queries.sql` (forward-only,
functions only — authority table/policy counts unchanged at 76/59).

Builds the READ half of the platform control plane on top of the audited support-session *foundation*
(`20260726100000`), **without touching tenant RLS**. The correction directive was explicit: do **not**
OR `private.has_active_support_session` into ordinary customer base-table policies — RLS is row
authorization, not column masking, and giving support actors raw SELECT on tenant rows is an
over-broad exposure surface. Instead, support investigation is served exclusively by dedicated
`security definer` support-query RPCs that return allowlisted DTOs.

## What shipped

**Identity helpers (`private`):** `is_active_platform_actor()`, `is_platform_admin()`, `mask_email()`,
and the single reviewable gate `authorize_support_query(org)` — raises unless the caller is an active
platform actor holding an active, unexpired session for that exact org, and returns the session for
audit stamping.

**Actor provisioning (`public`, platform_admin + AAL2, idempotent):**
- `provision_platform_actor(user, role, display_name, idem)` — only an existing active `platform_admin`
  at AAL2 can add an actor; the bootstrap admin is an out-of-band seed (below). Duplicate →
  `PLATFORM_ACTOR_EXISTS`.
- `set_platform_actor_status(actor, status, idem)` — suspend/reactivate; a suspend takes effect
  immediately (the gate rechecks `platform_actors.status='active'`), and the **last active admin cannot
  be suspended** (`CANNOT_SUSPEND_LAST_ADMIN`, no lockout).

**Sanitized support queries (`public`):**
- `support_lookup_organizations(query, limit)` — actor-gated (no session needed; this is the pre-session
  search). Org identity only (id/name/slug/status/createdAt).
- `support_get_organization_overview(org)` — session-gated + audited. Operational counts + subscription
  plan/status only — **no money, no PII, no secrets**.
- `support_list_organization_members(org, limit)` — session-gated + audited. Role/status/window +
  **masked** email only.
- `support_list_recent_activity(org, limit)` — session-gated + audited. Action code / resource type+id /
  timestamp only — **no before/after payloads, reason, or ip_hash**.
- `support_list_sessions(limit)` — session history for oversight (a `platform_admin` sees all; a
  `support_agent` sees only their own). Session metadata only.

Each session-scoped read appends an `audit.audit_events` row (`actor_type='support'`) stamped with the
support session id + the session's correlation id, and reads never mutate tenant business data.

## Security properties (all asserted in `scripts/validate-schema.mjs`)

- **No tenant-RLS bypass:** an automated guard asserts **zero** `public`/`reporting` policies reference
  `has_active_support_session` (`qual`/`with_check`). Adding only functions keeps the authority counts
  at 76/59, so no policy was introduced.
- **Zero access without a session:** an active platform actor with no session → `SUPPORT_SESSION_REQUIRED`.
- **Not a platform actor → nothing:** a normal user → `NOT_PLATFORM_ACTOR`.
- **Org-scoped:** a session for org A cannot read any other org.
- **Expiry authoritative at query time:** an `active`-status row past `expires_at` yields no data even
  though no sweep ran.
- **Suspension is immediate:** suspending the actor revokes access on the next call.
- **No write escalation:** the support gate is active, yet a domain write command
  (`create_operating_entity_and_book`) is still denied — write commands gate on membership, never on a
  session.
- **Sanitized DTOs:** the overview exposes no prohibited field; the member list masks emails (a seeded
  `jane.doe@example.com` never appears; `***` does); the activity feed carries no before/after payloads.
- **Provisioning lifecycle:** non-admin → `NOT_PLATFORM_ADMIN`; AAL1 admin → `MFA_STEP_UP_REQUIRED`;
  unknown user → `PLATFORM_USER_NOT_FOUND`; duplicate → `PLATFORM_ACTOR_EXISTS`; last admin suspend →
  `CANNOT_SUSPEND_LAST_ADMIN`.

## Bootstrap (documented out-of-band seed)

There is intentionally no self-service path to become the first platform actor. A designated human
owner seeds the bootstrap admin once, directly:

```sql
insert into private.platform_actors (user_id, platform_role, status, display_name)
values ('<auth.users.id of the platform admin>', 'platform_admin', 'active', 'Bootstrap admin');
```

Thereafter all provisioning flows through `provision_platform_actor` (existing active admin + AAL2).

## Verification

`npm run check` passes (lint, typecheck, Vitest, embedded-Postgres `test:db`, production build). The
support-query adversarial coverage is inside the control-plane block of `validateRecurringCharges()`.

## Follow-up (next slice)

The platform/support **console UI** and the persistent Support-session banner (target org + expiry, End
session) that consume these RPCs via `api/v1` are the follow-up slice; the API routes + data layer land
with it. The `access_scope` column remains `read_only`-only.
