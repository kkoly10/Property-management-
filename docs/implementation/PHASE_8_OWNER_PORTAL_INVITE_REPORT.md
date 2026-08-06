# Phase 8 Progress Report — Operator Owner-Portal Invite

**Status:** implemented end-to-end (RPC projection, data layer, operator button, embedded-Postgres coverage)
**Date:** 2026-08-06

## Why this slice

The resident/owner invitation vertical shipped in PR #31/#32 with **one documented gap**: the operator owner-invite button. The backend already supported owner invites end to end — `invite_relationship_user` handles `owner_entity`, `POST /api/v1/invitations` is relationship-type-agnostic, and the shared `/invitations/accept` page routes owners to `/owner` — but owners could only be invited by calling the API directly; there was no button on the operator UI. The blocker was purely that the owner-statement workspace DTO didn't carry the owner entity's email or portal-invitation state. This slice adds those two fields and the button.

## Implemented scope

- **`get_operator_owner_statement_workspace` extended** — two additions to the per-owner projection (the rest of the function reproduced verbatim from the shipped `phase_7_owner_remittances` definition, forward-only):
  1. `email` — from `owner_entities.email` (the join was already present; added `oe.email` to the `eligible` CTE + group by).
  2. `invitationState` (`active | invited | not_invited`) — derived from `public.user_relationships` (`relationship_type='owner_entity'`, `relationship_id = owner_entity_id`), collapsing `active > invited > not_invited`. **Computed inside the security-definer RPC**, so it reads `user_relationships` directly and is *not* subject to the `organization.manage` RLS read blind-spot that the residents directory works around — the owner button always gets accurate state.
- **Data layer** — `OperatorOwnerStatementContext` gains `email: string | null` and `invitationState`; `normalizeContext` and `previewContext` updated.
- **Operator UI** — `InviteOwnerButton` (mirrors the resident button) POSTs `{ relationshipType: "owner_entity", relationshipId: ownerEntityId, redirectSurface: "crecy_owner", email, … }` to `/api/v1/invitations`, with **Invite owner to portal / Resend owner invite / Portal active** states and an "Add an email to invite" disabled state when the owner entity has no email. Because an owner entity can span multiple properties (one workspace row each) while invitation is per owner entity, the button renders **once per owner entity** (on its first row).

## Architecture and controls

- **No new command, route, validation, or schema.** Owner support already existed in `invite_relationship_user` / the invitations route / `invitations.ts` (`relationshipType ∈ {resident_person, owner_entity}`, `surfaceForType.owner_entity = 'crecy_owner'`). This slice only feeds the button — an RPC projection extension + two data-layer fields + a client component.
- **No new tables or RLS policies.** Authority counts unchanged (74 tables / 59 policies).
- **Authorization unchanged.** The workspace already gates on `has_property_access(property, 'owner.manage')` **and** `'finance.manage'`; the owner email is surfaced only to operators who can already invite the owner.

## Files

- `supabase/migrations/20260725130000_phase_8_owner_portal_invite_state.sql`
- `src/lib/data/owner-statements.ts`
- `src/app/app/owner-statements/invite-owner-button.tsx`, `src/app/app/owner-statements/page.tsx`
- `scripts/validate-schema.mjs`

## Verification evidence

`npm run check` passes end-to-end: ESLint, TypeScript, 103 Vitest tests, the embedded-Postgres suite, and the production build. `test:db` asserts the workspace surfaces all three invitation states plus the null-email path:

- the accepted owner (`invitedOwnerEntity`) → `invitationState: "active"` with its email;
- a fresh not-invited owner → `"not_invited"` with its email;
- an invited-only owner (a pending `user_relationships` row) → `"invited"` with its email;
- an owner entity with no email → `email: null`.

The **pre-existing** owner-statement workspace assertions (`owners.length === 2`, `ownerPayableMinor === 40698`, `remittances.length === 1`, `evidenceDocuments.length === 1`, `latestStatement.versionNumber === 2`) still pass against the redefined function — confirming the reproduction preserved every existing projection field and only added the two new ones. Authority counts stayed at 74/59.

## Deferred / follow-up

- **Resident/owner community login surfaces (R-01 / OW-01)** as distinct branded routes remain deferred; acceptance still funnels through the shared `/invitations/accept` page after magic-link sign-in (unchanged from PR #32).
