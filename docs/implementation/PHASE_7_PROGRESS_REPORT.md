# Phase 7 Progress Report — Owner Accounting Verticals

**Status:** exact-owner approvals and immutable owner statement snapshots implemented; remittance accounting remains in progress
**Date:** 2026-07-24

## Implemented scope

- Canonical `owner_entities`, `ownership_interests`, `owner_approval_requests`, and append-only `owner_approval_decisions` persistence with organization/property composite foreign keys and RLS.
- One approval request is created transactionally for every active ownership interest when a work order requires approval. Creation fails with `OWNER_APPROVER_NOT_CONFIGURED` instead of producing an unapprovable work order.
- `respond_to_owner_approval` implements the v4.1 `RespondToOwnerApproval` contract with exact `owner_entity_id` plus active-property ownership checks, optimistic request versioning, actor-scoped idempotency, audit records, and `owner_approval.responded` outbox events.
- Co-owners decide only their own requests. Any rejection makes the work order approval state rejected; all required owners must approve before an `awaiting_approval` work order becomes `completed`.
- Approval requests at or above the organization approval threshold require an `aal2` session.
- Owner and operator approval RPCs return bounded, server-selected DTOs. They do not expose base lease, payment, maintenance-request, or work-order rows to owners.
- Owner UI at `/owner` and `/owner/approvals/:id`, with amount, scope, property/unit, evidence count, decision history, approve/reject controls, replay-safe submission, and setup/error states.
- Operator work-order detail shows every exact-owner request and its decision state.
- Owner statement snapshots are calculated exclusively from posted property/book journal entries and effective-dated ownership interests.
- Co-owner allocation uses deterministic largest-remainder rounding per ledger line, so finalized owner totals reconcile to the property down to the minor currency unit.
- Rental/other income, expenses, account `4100` management fees, and net owner position are persisted in immutable, SHA-256-addressed statement snapshots.
- `FinalizeOwnerStatement` enforces both `owner.manage` and `finance.manage`, stable calculation hashes, actor-scoped idempotency, short book locking, audit records, and `owner_statement.finalized` plus `notification.requested` events.
- Ledger changes after finalization require a reason and create the next version in the same statement series. Existing snapshots and their sanitized account drill-down cannot be edited or deleted.
- Operators can prepare statements at `/app/owner-statements`; owners can read only snapshots tied to their exact `owner_entity_id` at `/owner` and `/owner/statements/:statementId`.
- Statement DTOs expose account-level aggregates only. They contain no resident identity, tenancy detail, payment rows, private maintenance notes, or unrestricted journal rows.

## Verification evidence

The embedded Postgres suite covers request creation for two co-owners, exact-owner projection isolation, cross-owner decision denial, MFA step-up, optimistic-version conflicts, idempotent replay and conflicting replay, append-only decision enforcement, operator projection, final release from `awaiting_approval`, and audit/outbox trace counts.

It also covers posted-ledger-only calculation, incomplete ownership rejection, cent-perfect co-owner reconciliation, stale calculation hashes, finalization replay, exact-owner statement RLS, sanitized statement DTOs, append-only snapshots, corrective versioning, and statement audit/outbox/notification traces. Vitest covers approval/rejection and statement-period/hash input rules. The operator preparation and owner statement-detail routes were verified in a production build through a real browser.

Run `npm run check` for ESLint, TypeScript, Vitest, the full forward migration chain, database authorization tests, and the production build.

## Deferred Phase 7 scope

- Owner remittance records and owner-payable/remittance journal templates.
- PDF/CSV statement document generation and immutable document-version attachment.
- Owner invitation/activation UX; the portal consumes an already-active `owner_entity` relationship.
- Maintenance cost posting through an approved journal template.
