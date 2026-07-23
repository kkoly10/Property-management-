# Phase 6 Progress Report — Vendors and Work Order Lifecycle

**Status:** vendor directory, work-order assignment, and the operator-side status lifecycle implemented; Phase 6 remains in progress
**Date:** 2026-07-23

## Implemented scope

- Organization-managed private vendor directory (`create_vendor`, `get_operator_vendor_directory`), scoped to org-wide `maintenance.manage`/`maintenance.read` roles per the authoritative RLS policy.
- Property-scoped `create_and_assign_work_order` command that triages a maintenance request, optionally assigns a vendor, sets the official priority, and opens a work order.
- Explicit work-order state machine via `transition_work_order`: `accept → schedule → start → complete → close`, plus `cancel` from any non-terminal state. Each transition is idempotent, optimistically versioned, audited, and evented.
- Configurable owner-approval threshold (`organizations.settings.work_order_owner_approval_threshold_minor`) and completion-evidence requirement (`organizations.settings.work_order_completion_evidence_required`, default on).
- Completion evidence reuses the existing document upload-grant pipeline, extended with a `work_order` parent-resource type authorized by property-scoped `maintenance.manage`.
- The parent maintenance request's status and resident-visible projection stay in sync with the work order automatically.
- Operator UI: maintenance list links into a request detail page with a vendor-assignment form (when no active work order exists) or a status-action panel (accept/schedule/start/complete-with-evidence/close/cancel) when one does.

## Deferred scope

- Owner approve/reject of high-cost work orders. No owner login or portal exists yet (Phase 7). A work order that requires owner approval reaches `awaiting_approval` and **stays blocked** there — it deliberately cannot be completed by an operator self-approving. This preserves the "owner approval threshold cannot be bypassed" rule rather than faking it.
- Vendor self-service/login (Crecy Vendor). Per the pilot MVP scope, vendors are operator-managed contact records only; the RLS policy's vendor-user-relationship branch is wired for forward compatibility but nothing in this slice creates a `vendor_contact` relationship or vendor session.
- Inspections, quotes, scheduling conflicts/calendars, and maintenance cost posting to the ledger (the delivery plan's Phase 6 exit criterion "maintenance cost posts through approved journal template" is not yet implemented — `actual_cost_minor` is recorded on the work order but not journaled).
- Reassigning a vendor on an existing (`draft`) unassigned work order; today assignment only happens at creation.

## Architecture and controls

- `vendors` and `work_orders` follow the same organization/property composite-FK and RLS conventions as every prior phase; `work_orders` additionally enforces "one active work order per maintenance request" with a partial unique index, not just an application-level check.
- `create_and_assign_work_order` and `transition_work_order` both perform their idempotency-replay lookup **before** any check whose result depends on the command's own prior side effects (mirroring `submit_maintenance_request`), so replaying a successful request returns the canonical response instead of spuriously failing.
- The vendor RLS policy (`vendors_operator_or_self_read`) matches the authoritative spec's grant conditions, with one correction: the `EXISTS` subquery's `id` reference is qualified as `vendors.id` — the unqualified form in the spec text resolves against `work_orders.id` (which also has an `id` column) and silently denies all access.
- `finalize_document` gained a `work_order` branch to resolve `property_id`/`unit_id` for completion-evidence uploads; without it, work-order-parented documents would persist with a null `property_id` and fail every downstream evidence check.
- Owner-approval and completion-evidence requirements are read from `organizations.settings`, matching the existing `manual_payment_evidence_threshold_minor` pattern. Unlike that field, the owner-approval threshold is unset (not required) by default, and completion evidence is required by default — this reflects the underlying rule ("required by default; explicit non-scope items opt out"), not a copy of the payment default's implicit zero threshold.

## Files

- `supabase/migrations/20260723090000_phase_6_work_orders.sql`
- `src/app/api/v1/vendors/route.ts`
- `src/app/api/v1/work-orders/route.ts`
- `src/app/api/v1/work-orders/[workOrderId]/transitions/route.ts`
- `src/app/app/maintenance/page.tsx`
- `src/app/app/maintenance/[requestId]/`
- `src/lib/data/maintenance.ts`
- `src/lib/validation/maintenance.ts`
- `src/lib/validation/documents.ts`
- `scripts/validate-schema.mjs`

## Verification evidence

The embedded Postgres harness (`validateRecurringCharges` in `scripts/validate-schema.mjs`, which runs the full migration chain through this file) covers: vendor creation and replay, organization-wide vs. property-scoped vendor authorization, work-order creation and replay, duplicate-active-work-order rejection, the full accept→schedule→start→complete→close transition chain with version increments, stale-version rejection, invalid-transition rejection, completion-evidence enforcement (including the real `create_document_upload_grant`/`finalize_document` path for a `work_order` parent), the owner-approval threshold blocking completion and holding a work order at `awaiting_approval`, cancellation from that blocked state, cross-organization isolation, and the audit/outbox trace counts.

Run `npm run check` for ESLint, TypeScript, Vitest, embedded Postgres, and the production build — all pass. The operator maintenance list and request-detail pages were smoke-tested in setup-preview mode (no Supabase project configured in this environment) and render without errors.

## Forward-fix policy and known risks

Migrations are forward-only. The main remaining risks are the owner-approval dead-end until Phase 7 exists, no maintenance-cost ledger posting yet, and no vendor reassignment path for an unassigned work order.
