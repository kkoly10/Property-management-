# Pilot MVP Scope and Release Boundary

**Binding scope:** This file defines what “MVP,” “pilot complete,” and “North America launch candidate” mean.

## 1. Pilot objective

Prove that a growing landlord or small property manager can migrate an occupied portfolio, serve residents, collect and reconcile rent, manage maintenance, and provide basic owner transparency without spreadsheets, payment screenshots, scattered documents, or disconnected portals.

The pilot is not a full replacement for enterprise PMS/accounting software.

## 2. P0 users and surfaces

### Crecy OS — required

- organization and staff setup;
- portfolio, property, building, and unit setup;
- import center;
- residents, households, tenancy, existing lease data;
- rent schedule, charges, payments, receipts, reconciliation;
- document storage/version/delivery/acknowledgement;
- maintenance triage and work orders;
- invited private vendor/contact records;
- owner/property links and basic statement snapshots;
- audit, support diagnostics, notifications, and settings.

### Crecy Living — required

- invite/magic-link or secure account activation;
- home balance and next due amount;
- bank/card payment where connected operator is eligible;
- pending/succeeded/failed/returned status;
- receipts and payment history;
- maintenance submit/status/photos/messages;
- lease and operator-supplied documents;
- announcements and contact management.

### Crecy Owner — required but intentionally basic

- invitation and property-scoped access;
- occupancy and income/expense summary;
- finalized owner statement snapshots;
- maintenance evidence and approval requests;
- documents and messages;
- recorded distribution/remittance history.

### Crecy Vendor — post-pilot default

P0 operators can store and assign private vendors/contacts internally. A vendor login/workspace is not required for pilot completion unless a signed pilot specifically requires it.

## 3. P0 vertical journeys

1. Operator signs up and selects self-managing landlord or property-manager path.
2. Operator creates an operating entity and accounting book.
3. Operator imports properties, units, residents, leases, opening balances, and documents.
4. Import preview reports validation errors before commit.
5. Operator activates a tenancy with an existing uploaded lease.
6. Charge schedule creates rent charge and balanced journal transaction.
7. Resident is invited and sees only their tenancy/property information.
8. Resident pays through the operator’s connected account in sandbox/staging.
9. Webhook idempotently records payment, allocation, receipt, and reconciliation state.
10. Operator records a controlled cash/external-transfer payment.
11. Resident submits maintenance with photos.
12. Operator triages, assigns a private vendor/contact, updates status, and stores completion evidence.
13. Owner sees property-scoped performance and a finalized statement snapshot.
14. Support/admin can investigate the journey without direct database manipulation.

## 4. P0 modules

### Foundation

- Supabase Auth, PostgreSQL, RLS, private storage
- organization/operating entity/book hierarchy
- roles, permissions, property scopes
- audit events and outbox jobs
- feature entitlements
- consent and locale preferences

### Portfolio/imports

- CSV/XLSX ingest through reviewed server process
- column mapping, preview, row errors, dedupe, atomic commit
- document ZIP upload with manifest mapping
- original source preservation and import report

### Lease/tenancy

- record existing lease and structured operational terms
- upload signed lease/addenda
- activate/close tenancy
- renewal dates and reminders
- no certified template library or legal notice generation

### Finance/payments

- double-entry P0 ledger
- rent and configured recurring charges
- payment allocation
- manual payments with evidence
- Stripe direct-charge sandbox flow
- ACH/ACSS/MXN bank-transfer/card status abstraction
- refunds/reversals/returned debit handling
- transaction and audit timeline
- basic reconciliation exceptions

### Maintenance

- request, triage, work order, assignment, schedule, status, evidence, cost record
- operator-created private vendors
- no public network or bidding marketplace

### Owner

- ownership interests
- basic income/expense/occupancy projection
- immutable statement snapshot
- manual remittance record
- approval request for configured maintenance threshold

## 5. Explicitly excluded from pilot completion

- public rental marketplace;
- public/open vendor network, public ratings, bidding, commissions;
- applicant screening, credit reports, adverse action;
- automated lease/legal notice generation or legal compliance certification;
- online security-deposit collection;
- automated owner payouts or pooled funds;
- full trust accounting, bank feeds, automated bank reconciliation, tax filing;
- full accrual accounting, period close UI, consolidation, fixed assets;
- native iOS/Android applications;
- resident rewards, referral rewards, amenity booking, social community features;
- AI applicant decisions, legal drafting, autonomous accounting actions;
- public APIs and broad third-party integration catalog;
- dark mode;
- Ghana, Nigeria, Singapore production payments;
- custom domains in pilot;
- SOC 2 claim or certification.

## 6. North America release candidate after pilot

Before broad public launch across the U.S., Canada, and Mexico, add:

- production payment methods verified in each country;
- French product/commercial parity required for broad Canadian public launch;
- Spanish legal/commercial translation review for Mexico;
- country-specific subscription tax/invoice behavior;
- production privacy, terms, DPA, consent, and cancellation documents;
- country payment disclosures and support runbooks;
- load, accessibility, penetration, and recovery tests;
- localized pricing pages from the approved price book.

## 7. Pilot success metrics

Pilot passes when at least three pilot organizations can complete the vertical journeys and meet:

- import commit success ≥ 98% after user-correctable validation;
- no cross-tenant access in adversarial RLS suite;
- no unbalanced journal transactions;
- no duplicate canonical payments from replayed webhook events;
- ≥ 95% resident task completion in usability testing for pay/view receipt/submit maintenance;
- p95 interactive operator screen load under 2.5 seconds on reference workload;
- p95 resident initial meaningful content under 2.5 seconds on mid-tier mobile/4G test;
- zero unresolved critical/high security issues;
- documented restore test;
- every support investigation uses audit/correlation tooling rather than manual production edits.
