# Phase 8 Progress Report — Resident & Owner Portal Invitations

**Status:** relationship-user invitation and activation implemented end-to-end (resident invite UI, both API routes, acceptance page); operator owner-invite button deferred
**Date:** 2026-08-06

## Why this slice

No product command created a `public.user_relationships` row. Every resident/owner RLS read path (`13_P0_RLS_POLICIES_AND_TEST_MATRIX.md`) requires an **active** relationship row, so an invited resident or owner could not actually reach their portal — those rows previously existed only because the embedded-Postgres harness seeds them directly. This vertical closes that gap, implementing `InviteRelationshipUser` (spec `14_P0_COMMAND_API_EVENT_CONTRACTS.md` §4.7) plus acceptance, and unblocks the resident-pays (journey 8) and owner-sees-statement (journey 13) flows against real invited accounts.

## Implemented scope

- **`invite_relationship_user`** — property-scoped command (gated on `resident.manage` for `resident_person`, `owner.manage` for `owner_entity`) that mints a pending `invitations` row and an `invited` `user_relationships` row bound to the resolved auth user. Enforces email/relationship match (the invited email must equal the person's / owner entity's stored email *and* the invited auth user's email), a 72-hour expiry, redirect-surface/relationship-type agreement, and idempotent replay; a re-invite supersedes the prior pending token via a partial unique index.
- **`accept_relationship_invitation`** — recipient-bound to `auth.uid()`; activates exactly the pre-created relationship row (`invited` → `active`), idempotent, with expiry/pending/recipient guards.
- **One active portal user per relationship** — the invite command rejects a second active user for the same relationship, because activation auto-provisions a messaging conversation (`private.sync_relationship_conversation()`) keyed on the relationship entity, not the user.
- **Delivery** — `resident_invitation`/`owner_invitation` notification jobs are queued in-transaction; `get_/mark_relationship_invitation_*` helpers mirror the staff delivery-status pattern. The route sends the activation email via Supabase Auth OTP (magic link) to `/invitations/accept`.
- **API** — `POST /api/v1/invitations` (HMAC token → sha256 hash, resolve/create auth user, RPC, OTP delivery, cleanup-on-failure) and `POST /api/v1/invitations/accept` (hash token → RPC), each with a sentinel→HTTP error ladder in `src/lib/api/invitations.ts`.
- **Operator UI** — `/app/residents` gains an "Invite to portal / Resend invite / Portal active" control per resident (`src/app/app/residents/invite-resident-button.tsx`); the directory now exposes `organizationId` and a three-state `invitationState` (`active | invited | not_invited`).
- **Activation UI** — a shared `/invitations/accept` page (resident and owner) that binds the invitation to the signed-in account and routes to `/home` or `/owner` by `redirectSurface`.

## Deferred / follow-up

- **Operator owner-invite button.** The command, API, and acceptance page fully support owner invites today (owners can be invited via the API and activate through `/invitations/accept`), but the operator-facing button on `/app/owner-statements` needs the sanitized owner-statement DTO to carry the owner entity's email/org/invitation state — a `get_operator_owner_statement_workspace` change deferred to keep this slice bounded.
- **Resident/owner community login surfaces (R-01 / OW-01)** as distinct branded routes; today acceptance funnels through the shared `/invitations/accept` page after a magic-link sign-in.

## Architecture and controls

- Mirrors the shipped staff-invitation vertical (`20260724134409_phase_8_staff_access.sql`): actor-scoped idempotency with an advisory lock, SHA-256 `token_hash`/`token_prefix` (the raw token is HMAC-minted in the route and never persisted), audit + outbox + notification writes in one transaction, and definer-only table access.
- No new tables or RLS policies — both `public.invitations` (whose `invitation_type` check already permitted `resident_relationship`/`owner_relationship`) and `public.user_relationships` predate this slice, so the authority table/policy counts are unchanged (74/59).
- **Known minor:** the invite route resolves/creates the invited auth user before the RPC authorizes (same shape as staff). It is bounded — no email is sent on denial and any transiently-created auth user is deleted on RPC failure — but a lightweight preflight authorization check would remove the transient create entirely; revisit if abuse surfaces.

## Files

- `supabase/migrations/20260725090000_phase_8_relationship_invitations.sql` (merged in PR #31)
- `src/lib/validation/invitations.ts` (+ `.test.ts`)
- `src/lib/api/invitations.ts`
- `src/app/api/v1/invitations/route.ts`, `src/app/api/v1/invitations/accept/route.ts`
- `src/app/app/residents/invite-resident-button.tsx`, `src/app/app/residents/page.tsx`
- `src/app/invitations/accept/` (page + acceptance component)
- `src/lib/data/leasing.ts`, `.env.example`, `scripts/validate-schema.mjs`

## Verification evidence

`npm run check` passes end-to-end: ESLint, TypeScript, 95 Vitest tests (including 5 new relationship-invitation schema tests), the embedded-Postgres suite, and the production build. `test:db` drives the full invite→accept flow for both resident and owner paths and asserts: canonical queued invitation, idempotent replay, re-invite supersede, and rejections for redirect-surface / email-relationship / invited-user-email / property-scope / recipient-mismatch / expiry — plus audit/outbox/notification trace counts (`relationshipInvitations: 4`, `relationshipActivations: 2`). Two real bugs were caught by the suite while building and fixed before the backend merged: a `FOUND`-clobber that nulled the relationship id, and a missing cross-user guard that would have collided in the conversation trigger.

## Forward-fix policy

Migrations are forward-only. The main follow-ups are the operator owner-invite button (needs an owner-statement DTO field) and the optional invite-route preflight noted above.
