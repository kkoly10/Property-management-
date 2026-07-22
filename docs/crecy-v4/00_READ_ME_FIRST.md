# Crecy Senior Engineering Specification — v4 Gate 0 Complete

**Status:** Authoritative implementation package  
**Product:** Crecy global rental operating system  
**Authority date:** 2026-07-19
**Commercial launch family:** United States, Canada, Mexico  
**First controlled pilot:** United States with Virginia-based operators, without jurisdiction-certified legal automation

## v4.1.1 authority

This directory is the authoritative **Crecy v4.1.1** implementation package. v4.1.1 supersedes v4 wherever they conflict. Files `12` through `17` are normal repository files and must exist before implementation. No bootstrap or GitHub Action is required.

The v4.1.1 correction pass closes persistence, command/schema traceability, property-scoped authorization, relationship-user data minimization, and the final Crecy naming contradiction.

## 1. Authority and supersession

This folder is the only authoritative implementation source. It supersedes every earlier v1, v2, or v3 ZIP, extracted folder, questionnaire, and generated-image caption.

When statements conflict, use this order:

1. Executable SQL and exact v4 contracts
2. `07_FOUNDER_DECISION_REGISTER.md`
3. `10_PILOT_MVP_SCOPE_AND_RELEASE_BOUNDARY.md`
4. `11_PRICING_ENTITLEMENTS_AND_BILLING_SPEC.md`
5. `14_P0_COMMAND_API_EVENT_CONTRACTS.md`
6. `15_P0_SCREEN_AND_STATE_SPECIFICATIONS.md`
7. Target architecture specifications
8. Reference images

Reference images never override security, finance, permissions, pricing, accessibility, or written behavior.

## 2. Product definition

Crecy is a B2B2C property-management SaaS platform.

- **Crecy OS:** operator workspace and paying-customer product
- **Crecy Living:** resident portal/PWA
- **Crecy Owner:** owner transparency portal
- **Crecy Vendor:** private invited-vendor workspace, deferred until after the pilot unless required by a signed pilot

Operators supply and control their leases, addenda, notices, property rules, fees, deposits, applicant decisions, and legal documents. Crecy stores, versions, delivers, signs when enabled, and operationalizes those documents, but does not certify their legal sufficiency.

## 3. Gate 0 status

Founder-controlled product decisions are closed in `07_FOUNDER_DECISION_REGISTER.md`.

Gate 0 permits:

- repository scaffolding;
- database migrations;
- RLS implementation and attack tests;
- design-system implementation;
- operator/resident/owner P0 journeys;
- sandbox Stripe Connect integration;
- automated tests;
- accessibility and localization implementation;
- staging deployment.

Professional evidence remains required before production activation of specific regulated behaviors. The checklist is a production gate, not a blocker to building the product.

## 4. Pilot MVP boundary

The pilot is intentionally smaller than the target platform. P0 includes:

- organization, staff, roles, property scopes;
- operating entities and single-currency accounting books;
- property/unit setup and bulk import;
- resident, household, tenancy, and existing-lease records;
- operator-supplied document import, versioning, delivery, and acknowledgement;
- recurring rent schedules, charges, double-entry ledger, receipts;
- manual cash/external-transfer recording with controls;
- Stripe-connected operator onboarding and direct-charge sandbox flows;
- resident portal for balance, payment, receipts, documents, messages, and maintenance;
- operator maintenance triage and private vendor/contact assignment;
- basic owner portal, statement snapshots, property performance, and approvals;
- audit log, consent records, outbox/jobs, privacy export/delete scaffolding;
- English, Spanish, and French architecture; English and Spanish P0 content complete, French complete before broad Canadian public launch.

See `10_PILOT_MVP_SCOPE_AND_RELEASE_BOUNDARY.md` for exclusions.

## 5. Build order

1. Run repository reconnaissance and map all existing code.
2. Adopt design tokens and application shells.
3. Apply P0 schema in reviewable migrations; do not paste the entire SQL into one production migration without decomposition.
4. Implement and test RLS before feature UI.
5. Deliver one vertical journey at a time.
6. Use sandbox providers only until production gates pass.
7. Run adversarial security, financial-integrity, accessibility, and UX reviews after each sensitive phase.

## 6. File map

- `01_PRODUCT_AND_SYSTEM_ARCHITECTURE_SPEC.md` — target architecture
- `02_CANONICAL_DATA_MODEL_AND_RLS_SPEC.md` — relational and authorization model
- `03_FINANCIAL_PAYMENT_API_EVENT_SECURITY_SPEC.md` — financial/security target contracts
- `04_UI_UX_PRODUCT_IMPLEMENTATION_SPEC.md` — target UX architecture
- `05_DELIVERY_PLAN_TESTS_AND_ACCEPTANCE_GATES.md` — full target delivery sequence
- `07_FOUNDER_DECISION_REGISTER.md` — closed founder decisions
- `08_GLOBAL_COUNTRY_PROFILE_AND_PAYMENT_ORCHESTRATION_SPEC.md` — global/country/payment architecture
- `09_PRIVACY_SECURITY_COMPLIANCE_AND_LEGAL_DOCUMENT_SPEC.md` — platform compliance baseline
- `10_PILOT_MVP_SCOPE_AND_RELEASE_BOUNDARY.md` — binding lean MVP
- `11_PRICING_ENTITLEMENTS_AND_BILLING_SPEC.md` — binding prices and feature limits
- `12_P0_EXECUTABLE_SCHEMA.sql` — executable schema baseline
- `13_P0_RLS_POLICIES_AND_TEST_MATRIX.md` — exact policies, sanitized projections, and attack cases
- `14_P0_COMMAND_API_EVENT_CONTRACTS.md` — exact P0 commands, errors, persistence, and events
- `15_P0_SCREEN_AND_STATE_SPECIFICATIONS.md` — route-level UX contracts
- `16_BRAND_FIGMA_COMPONENT_VISUAL_DIRECTION.md` — locked Crecy brand/system decisions
- `17_P0_DATA_CONTRACT_TRACEABILITY_MATRIX.md` — route-to-table-to-policy-to-event traceability
- `18_MARKETING_CLAIMS_AND_EVIDENCE_POLICY.md` — safe claims
- `20_COUNSEL_AND_COMPLIANCE_LAUNCH_CHECKLIST.md` — production evidence
- `21_GATE_0_COMPLETION_REPORT.md` — Gate 0 resolution record
- `22_CODEX_CLAUDE_EXECUTION_PROMPT.md` — implementation instruction
- `23_V4_1_CORRECTION_REPORT.md` — v4.1 correction history
- `24_CODEX_APPLY_V4_1_PROMPT.md` — historical v4.1 application prompt
- `25_V4_1_1_CORRECTION_REPORT.md` — targeted v4.1.1 correction history
- `26_CODEX_APPLY_V4_1_1_PROMPT.md` — current application and validation prompt
- `AGENTS.md` — repository agent rules

## 7. Non-negotiable invariants

- One organization may have many operating entities and accounting books.
- Each accounting book has one immutable functional currency after posting begins.
- A property belongs to one accounting book at a time.
- No journal transaction crosses books or currencies.
- Financial balances are derived, never manually edited.
- Posted financial history is corrected through reversals and new entries.
- Rent uses operator-controlled direct charges where supported; Crecy does not pool rent.
- Security deposits are not collected online in P0.
- No browser-accessible service-role usage.
- RLS is required on every exposed tenant table.
- No public marketplace or public vendor network in P0.
- No tenant screening in P0.
- No automated owner payouts in P0.
- No claim of SOC 2 compliance, customer traction, performance, or country readiness without evidence.
