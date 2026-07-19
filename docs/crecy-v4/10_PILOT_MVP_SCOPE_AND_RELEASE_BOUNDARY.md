# Pilot MVP Scope and Release Boundary

**Binding scope:** Defines “MVP,” “pilot complete,” and “North America launch candidate.”

## Pilot objective

Prove that a growing landlord or small property manager can migrate an occupied portfolio, serve residents, collect/reconcile rent, manage maintenance, and provide basic owner transparency without spreadsheets, payment screenshots, scattered documents, or disconnected portals.

The pilot is not a full enterprise PMS/accounting replacement.

## P0 surfaces

### Crecy OS — required

Organization/staff, portfolio/property/unit setup, imports, residents/households/tenancies, existing lease records, rent schedules/charges/payments/receipts/reconciliation, document version/delivery/acknowledgement, maintenance/work orders/private vendor contacts, owner links/basic statement snapshots, audit/support/notifications/settings.

### Crecy Living — required

Secure activation, balance/next due, eligible bank/card payments, pending/succeeded/failed/returned states, receipts/history, maintenance/photos/messages, operator-supplied lease/documents, announcements/contact management.

### Crecy Owner — required but basic

Property-scoped access, occupancy/income/expense summary, finalized statement snapshots, maintenance evidence/approvals, documents/messages, recorded distribution history.

### Crecy Vendor — post-pilot default

P0 stores and assigns private vendors internally. Vendor login/workspace is not required unless a signed pilot requires it.

## P0 vertical journeys

1. Operator signs up and chooses self-managing landlord or property-manager path.
2. Creates operating entity and accounting book.
3. Imports properties, units, residents, leases, opening balances, documents.
4. Import preview reports errors before atomic commit.
5. Activates tenancy with existing uploaded lease.
6. Charge schedule creates rent charge and balanced journal transaction.
7. Resident invitation exposes only their tenancy/property.
8. Resident pays through connected operator account in sandbox/staging.
9. Webhook idempotently records payment, allocation, receipt, reconciliation state.
10. Operator records controlled cash/external-transfer payment.
11. Resident submits maintenance with photos.
12. Operator triages, assigns private vendor/contact, updates status, stores evidence.
13. Owner sees property-scoped performance and finalized statement snapshot.
14. Support investigates through audit/correlation tooling without database edits.

## Explicit exclusions from pilot completion

- public rental marketplace or public vendor network;
- public ratings, bidding, commissions;
- applicant screening/credit/adverse action;
- automated legal templates/notices or compliance certification;
- online security-deposit collection;
- automated owner payouts or pooled funds;
- full trust accounting, bank feeds, automated bank reconciliation, tax filing;
- full accrual accounting, period close, consolidation, fixed assets;
- native iOS/Android apps;
- resident/refer-a-friend rewards, amenity booking, social community;
- autonomous AI housing/legal/accounting decisions;
- public API/integration catalog;
- dark mode;
- Ghana/Nigeria/Singapore production payments;
- custom domains in pilot;
- SOC 2 claim/certification.

## North America release candidate additions

Before broad public launch add production payment verification per country; French parity for broad Canadian launch; reviewed Spanish commercial/legal localization for Mexico; country subscription tax/invoice behavior; production terms/privacy/DPA/consent/cancellation; payment disclosures/support runbooks; load/accessibility/penetration/recovery testing; localized pricing pages.

## Pilot success metrics

- At least three pilot organizations complete all vertical journeys.
- Import commit success ≥98% after correctable validation.
- Zero cross-tenant access in adversarial RLS suite.
- Zero unbalanced journal transactions.
- Replayed webhooks never create duplicate canonical payments.
- ≥95% resident task completion for pay/view receipt/submit maintenance in usability testing.
- Operator p95 interactive screen load <2.5s on reference workload.
- Resident p95 meaningful content <2.5s on mid-tier mobile/4G.
- Zero unresolved critical/high security issues.
- Documented restore test.
- Support investigations use audit/correlation tooling rather than manual production edits.
