# 25 — Crecy v4.1.1 Correction Report

**Status:** Binding targeted correction to v4.1. No product-scope decisions changed.

## Closed defects

1. Removed grants from file 12 for views created only in file 13; grants now occur after view creation.
2. Added `private.is_owner_entity()` and required exact `owner_entity_id` matching for owner statements, remittances, approval requests, and approval decisions.
3. Removed resident access to base `work_orders`; added `reporting.resident_work_order_statuses` without costs, vendor scope, completion notes, or owner-approval fields.
4. Changed relationship announcement access to explicit `announcement_deliveries` rows; same-property residency is not sufficient.
5. Added server-derived `actor_scope` and `UNIQUE NULLS NOT DISTINCT` idempotency protection for pre-organization commands.
6. Added canonical `public.payment_refunds` persistence and aligned `RefundPayment` response/events.
7. Added property scope to non-portfolio imports and narrowed import/document-delivery policies to the relevant property.
8. Corrected the file map and added files 23–26; removed the nonexistent file 19 and the obsolete image-manifest description for file 17.

## Execution gate

Do not store real resident/payment data until the decomposed migrations execute successfully in a disposable PostgreSQL/Supabase environment and RLS cases RLS-001 through RLS-030 pass.

## Repository execution note

Disposable execution found that the v4.1.1 archive removed `receivable_accounts.public_reference` while retaining `UNIQUE (organization_id, public_reference)`. The repository copy restores the required non-null column so the authoritative schema remains executable and preserves the existing receivable-account identifier contract.

The archive application prompt also required RLS-001 through RLS-030 while its test matrix ended at RLS-026. The repository copy adds RLS-027 through RLS-030 for the four v4.1.1 isolation corrections: exact co-owner identity, resident work-order projection, delivery-only announcements, and property-scoped import/document access.

Authenticated relationship users were granted `SELECT` on sanitized `reporting` views without `USAGE` on the `reporting` schema. The repository policy SQL adds that least-privilege schema grant so the intended owner, vendor, and resident projections are executable.

The supplied v4.1.1 schema also dropped existing organization/property composite keys and foreign keys for units, work orders, owner statements/remittances/approvals, announcements, and import source documents. The repository copy restores those invariants, as required by the no-constraint-weakening execution rule, and adds the missing deferred currency/over-refund constraint.
