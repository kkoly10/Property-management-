# Phase 7 Progress Report — Owner Approval Vertical

**Status:** exact-owner approval persistence, decision command, and approval surfaces implemented; broader Phase 7 owner accounting remains in progress
**Date:** 2026-07-23

## Implemented scope

- Canonical `owner_entities`, `ownership_interests`, `owner_approval_requests`, and append-only `owner_approval_decisions` persistence with organization/property composite foreign keys and RLS.
- One approval request is created transactionally for every active ownership interest when a work order requires approval. Creation fails with `OWNER_APPROVER_NOT_CONFIGURED` instead of producing an unapprovable work order.
- `respond_to_owner_approval` implements the v4.1 `RespondToOwnerApproval` contract with exact `owner_entity_id` plus active-property ownership checks, optimistic request versioning, actor-scoped idempotency, audit records, and `owner_approval.responded` outbox events.
- Co-owners decide only their own requests. Any rejection makes the work order approval state rejected; all required owners must approve before an `awaiting_approval` work order becomes `completed`.
- Approval requests at or above the organization approval threshold require an `aal2` session.
- Owner and operator RPCs return bounded, server-selected DTOs. They do not expose base lease, payment, maintenance-request, or work-order rows to owners.
- Owner UI at `/owner` and `/owner/approvals/:id`, with amount, scope, property/unit, evidence count, decision history, approve/reject controls, replay-safe submission, and setup/error states.
- Operator work-order detail now shows every exact-owner request and its decision state.

## Verification evidence

The embedded Postgres suite covers request creation for two co-owners, exact-owner projection isolation, cross-owner decision denial, MFA step-up, optimistic-version conflicts, idempotent replay and conflicting replay, append-only decision enforcement, operator projection, final release from `awaiting_approval`, and audit/outbox trace counts. Vitest covers approval/rejection input rules.

Run `npm run check` for ESLint, TypeScript, Vitest, the full forward migration chain, database authorization tests, and the production build.

## Deferred Phase 7 scope

- Owner statement snapshots, owner remittance records, and the owner accounting dashboard.
- Owner invitation/activation UX; the approval portal consumes an already-active `owner_entity` relationship.
- Maintenance cost posting through an approved journal template.
