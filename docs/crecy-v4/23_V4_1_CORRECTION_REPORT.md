# 23 — Crecy v4.1 Correction Report

## Closed defects

1. Files 12–17 are distributed as normal files; no GitHub Actions materialization is required.
2. Persistence added for idempotency, Stripe webhook deduplication, invitations, messaging, announcements, notification delivery, document delivery/acknowledgement, upload quarantine/scanning, privacy requests, owner approval history, localized pricing, usage, and invoices.
3. `work_orders.version` and `maintenance_requests.public_reference/version` now match command contracts.
4. Owner statements support immutable correction versions and PDF/CSV document-version links.
5. Required P0 financial, access, messaging, announcement, billing, privacy, remittance, document and owner-approval commands are explicit.
6. Membership effective dates are enforced in property access. Property-scoped roles no longer gain organization-wide people/finance/owner/vendor access through broad permission checks.
7. Owner/vendor screens use sanitized projections; full resident lease, payment and maintenance rows are not granted to those relationships.
8. Cross-organization composite integrity constraints cover core P0 relationships.
9. Product name is locked as Crecy; only final logo artwork remains open.

## Development gate

Phase 1 foundation may begin after SQL syntax/migration decomposition review and adversarial RLS tests are scaffolded. Payments, resident production data and owner portal production access remain blocked until the associated tests and professional production evidence pass.

## v4.1.1 repository review corrections

The repository application review on 2026-07-20 additionally:

1. moves reporting-view grants after the views exist so the schema transaction can commit;
2. binds owner statement, remittance, and approval access to both property and `owner_entity_id`;
3. removes resident access to cost-bearing `work_orders` rows and adds a sanitized resident projection;
4. binds announcement reads to explicit deliveries, including selected-tenancy audiences;
5. makes nullable organization idempotency keys deduplicate with `NULLS NOT DISTINCT`;
6. adds canonical `payment_refunds` persistence and refund traceability;
7. narrows document-delivery and import reads to effective property scope;
8. adds missing composite organization/property foreign keys for owner and work-order paths; and
9. corrects the authority file map and SQL policy syntax found during dependency review.
