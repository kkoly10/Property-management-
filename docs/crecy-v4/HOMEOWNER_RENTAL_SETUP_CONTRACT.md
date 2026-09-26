# Homeowner rental setup contract — local slice A1/A2

Authority: ADR-HR-2026-09-25; FD-HR-001–005. Not full Batch A certification.

## Command and persistence
`CreateHomeownerRental` / `public.create_homeowner_rental(uuid,jsonb,text)` accepts an
explicit organization, a bounded validated rental description, and operation UUID.
The actor is `auth.uid()`. Revalidate an unscoped `property.manage` membership and the
organization's `self_managing` path. New entity creation also needs `organization.manage`.
An existing property/book must belong to that organization; never choose the first.
Reuse `create_operating_entity_and_book`, `create_property`, `create_unit` within one
transaction. Unit entitlements still apply. No tenancy, rent, journal or invitation is created.
Store private/shared-space descriptors in `units.rental_details`, protected by the existing
unit RLS and SELECT-only grants. No additional public projections or public grants.
Use an organization operation lock and durable idempotency receipt; replay checks the
canonical payload before returning the same IDs, including after ordinary key expiry.
Write `homeowner_rental.created` audit/outbox events with one correlation ID; child
commands retain their existing events. No records remain after a later-step failure.

## Surfaces
`/app/rentals`: private rental list; `/app/rentals/new`: guided setup;
`/app/rentals/[unitId]`: property-scoped summary and existing-renter next action.
`POST /api/v1/homeowner-rentals`: authenticated, active-organization-matching entry.
Organization context includes customerPath; professional fallback preserves old responses.
Both desktop and PR64 mobile navigation use that validated presentation hint.

## Adversarial cases resolved before implementation
- Two organizations: request organization must match the selected context and SQL revalidates it.
- Revoked/expired membership or property-scoped staff: no organization-wide creation privilege.
- Existing home/book in another organization: reject even when the actor belongs to both.
- Two spaces at one address: explicitly choose the existing property; no heuristic address matching.
- Unknown response: preserve submitted payload and operation key; do not silently issue another create.
- Reload or delayed replay: durable receipt returns original IDs, not another home/book/unit.
- Unit entitlement failure: roll back the preceding new entity/book/property too.
- Labels are not permissions: professional navigation remains available to professional workspaces;
  self-managing presentation cannot grant owner oversight, finance or staff rights.
- Existing managed inventory is private; no listing publication or marketing claims in this slice.

## Verification / rollout
Run targeted Vitest schemas/context, embedded PostgreSQL real commands with negative scope,
replay, metadata and rollback assertions, lint/typecheck/build and local browser smoke.
Migration is additive and must precede the consuming application on a deliberate future release.
Base is PR64 ca21898a (unmerged mobile dependency); do not publish this stack before reconciling it.
No production or provider certification is implied. Remaining Batch A work includes integrated
scan/lease cutover and resident handoff verification; Batch B and discovery are not delivered here.
