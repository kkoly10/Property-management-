# v4.1.1 Contract Correction Validation

**Status:** specification and persistence corrections implemented and verified
**Date:** 2026-07-22

## Applied authority changes

- Replaced authoritative files `00`, `12`, `13`, `14`, `17`, and root `AGENTS.md` from the merged v4.1.1 package.
- Added correction history files `25` and `26`.
- Added the canonical `payment_refunds` persistence contract and property/resident RLS.
- Added server-derived `actor_scope` to application idempotency records with `NULLS NOT DISTINCT` uniqueness for pre-organization commands.
- Added RLS-027 through RLS-030, which were required by the application prompt but absent from the supplied matrix.

## Archive defects corrected during disposable execution

1. `receivable_accounts.public_reference` was removed while its unique constraint remained. The required non-null column was restored.
2. Sanitized `reporting` views were granted `SELECT` without schema `USAGE`. The authenticated role now receives least-privilege usage on the reporting schema.
3. The correction prompt required tests through RLS-030 while the matrix ended at RLS-026. The missing cases now cover exact co-owner identity, resident work-order projection, delivery-only announcements, and property-scoped imports/documents.
4. The archive dropped existing cross-organization and same-property composite constraints. Those keys and foreign keys were restored for units, work orders, owner statements/remittances/approvals, announcements, and import source documents.
5. Canonical refunds lost their database over-refund enforcement. A deferred currency and refundable-total constraint now protects both the authority baseline and the decomposed application migration.

## Executable evidence

The embedded PostgreSQL harness now verifies:

- all 73 authority tables and 58 policies load successfully;
- a co-owner sees one exact owner statement/remittance, not the other co-owner's rows;
- a resident sees zero base work orders and one sanitized status projection with no cost, completion-note, or approval fields;
- a same-property resident sees only the explicitly delivered announcement;
- a property-scoped manager sees one assigned property, document, and non-portfolio import;
- idempotency records receive a server-derived actor scope and duplicate system/pre-organization scopes are rejected;
- persisted refunds are visible only to authorized finance operators and the related resident;
- nonfailed refunds cannot exceed the payment and cannot cross currencies;
- failed refunds do not consume the refundable amount;
- authenticated clients cannot forge refund rows through the Data API;
- an unrelated user sees zero refunds.

Run `npm run check` to execute lint, TypeScript, unit tests, the embedded database suite, and the production build.

## Scope boundary

This correction establishes persistence and authorization only. Provider refund execution, manual-payment reversal journals, and operator correction UI remain the next finance vertical.
