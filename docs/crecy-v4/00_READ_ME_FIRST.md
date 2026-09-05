# Crecy Senior Engineering Specification — v4.2 Launch-Layer Correction

**Status:** Authoritative implementation package  
**Product:** Crecy global rental operating system  
**Original authority date:** 2026-07-19  
**Launch-layer correction date:** 2026-08-27  
**Commercial launch family:** United States, Canada, Mexico  
**First controlled pilot:** United States with Virginia-based operators, without jurisdiction-certified legal automation

## v4.2 authority

This directory is the authoritative **Crecy v4.2** implementation package. v4.2 preserves the strong v4.1.1 product-engine contracts and adds a binding Launch Layer / Runtime Readiness correction in `27_LAUNCH_LAYER_AND_RUNTIME_READINESS_SPEC.md`.

The correction exists because feature/pilot implementation had advanced much farther than public marketing, unattended runtime operation, legal publication/version binding, and launch certification. Coding agents must no longer treat product implementation completion as equivalent to runtime, pilot, beta, or public-launch completion.

## 1. Authority and supersession

This folder is the only authoritative implementation source. It supersedes every earlier v1, v2, or v3 ZIP, extracted folder, questionnaire, chat prompt, and generated-image caption.

When statements conflict, use this order:

1. Executable migrations / shipped code for current runtime truth
2. `07_FOUNDER_DECISION_REGISTER.md`
3. `27_LAUNCH_LAYER_AND_RUNTIME_READINESS_SPEC.md` for launch/runtime/public-surface readiness
4. `10_PILOT_MVP_SCOPE_AND_RELEASE_BOUNDARY.md`
5. `11_PRICING_ENTITLEMENTS_AND_BILLING_SPEC.md`
6. `14_P0_COMMAND_API_EVENT_CONTRACTS.md`
7. `15_P0_SCREEN_AND_STATE_SPECIFICATIONS.md`
8. `18_MARKETING_CLAIMS_AND_EVIDENCE_POLICY.md`
9. Target architecture specifications
10. Reference images

Reference images never override security, finance, permissions, pricing, accessibility, claims, launch gates, or written behavior.

## 2. Product definition

Crecy is a B2B2C property-management SaaS platform.

- **Crecy OS:** operator workspace and paying-customer product
- **Crecy Living:** resident portal/PWA
- **Crecy Owner:** owner transparency portal
- **Crecy Vendor:** private invited-vendor workspace, deferred until after the pilot unless required by a signed pilot

Operators supply and control their leases, addenda, notices, property rules, fees, deposits, applicant decisions, and legal documents. Crecy stores, versions, delivers, signs when enabled, and operationalizes those documents, but does not certify their legal sufficiency.

## 3. Three-system launch model

Crecy is evaluated as three systems:

1. **Product Layer** — OS/Living/Owner, ledger, payments, maintenance, imports, documents, communications, support.
2. **Runtime Layer** — schedulers, document scanning, workers, provider connectivity, canonical organization context, observability, deployment, backup/restore.
3. **Launch Layer** — public website, pricing, product story, trust, SEO, signup conversion, legal publishing/version binding, commercial claims, and production launch posture.

The five completion states in file 27 are binding and must be reported separately:

- product implementation complete;
- runtime operationally complete;
- public launch surface complete;
- provider configured/certified;
- launch certified.

No agent may collapse these states into one completion percentage or use `complete` without naming the layer.

## 4. Gate 0 status

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
- marketing/public-site implementation;
- legal-publication infrastructure;
- scheduler/scanner/runtime infrastructure;
- staging deployment.

Professional evidence remains required before production activation of specific regulated behaviors. The checklist is a production gate, not a blocker to building the product or its launch infrastructure.

## 5. Pilot MVP boundary

The pilot is intentionally smaller than the target platform. P0 includes:

- organization, staff, roles, property scopes;
- operating entities and single-currency accounting books;
- property/unit setup and bulk import;
- resident, household, tenancy, and existing-lease records;
- operator-supplied document import, versioning, delivery, acknowledgement, and a real scan lifecycle;
- recurring rent schedules, charges, double-entry ledger, receipts, and unattended generation orchestration;
- manual cash/external-transfer recording with controls;
- Stripe-connected operator onboarding and direct-charge sandbox flows;
- resident portal for balance, payment, receipts, documents, messages, and maintenance;
- operator maintenance triage and private vendor/contact assignment;
- basic owner portal, statement snapshots, property performance, and approvals;
- audit log, consent records, outbox/jobs, privacy export/delete scaffolding;
- canonical multi-organization operator context;
- English, Spanish, and French architecture; English and Spanish P0 content complete, French complete before broad Canadian public launch.

Public launch additionally requires the Launch Layer and Runtime Layer gates in file 27.

See `10_PILOT_MVP_SCOPE_AND_RELEASE_BOUNDARY.md` for product exclusions and file 27 for runtime/public-launch requirements.

## 6. Corrected build order

1. Run repository reconnaissance and map existing code before modifying a sensitive vertical.
2. Preserve/refactor strong shipped product-engine work rather than rewriting it.
3. Complete **Batch A** from file 27: document scan lifecycle, scheduler/orchestrator, canonical active-organization context, legal publication/version binding.
4. Complete **Batch B** from file 27: homepage, product, pricing, Crecy Living marketing, security/trust, pilot, legal center shell, SEO/navigation/host behavior.
5. Complete **Batch C** from file 27: transactional mail activation, Stripe certification, Vercel deployment/cron/domain configuration, observability, restore drill.
6. Maintain forward-only migrations and RLS/adversarial tests.
7. Run the launch certification journey beginning with an anonymous prospective customer, not only authenticated command tests.
8. Only designated human owners may approve production launch.

## 7. File map

- `01_PRODUCT_AND_SYSTEM_ARCHITECTURE_SPEC.md` — target architecture
- `02_CANONICAL_DATA_MODEL_AND_RLS_SPEC.md` — relational and authorization model
- `03_FINANCIAL_PAYMENT_API_EVENT_SECURITY_SPEC.md` — financial/security target contracts
- `04_UI_UX_PRODUCT_IMPLEMENTATION_SPEC.md` — target UX architecture
- `05_DELIVERY_PLAN_TESTS_AND_ACCEPTANCE_GATES.md` — target delivery sequence and service objectives
- `07_FOUNDER_DECISION_REGISTER.md` — closed founder decisions
- `08_GLOBAL_COUNTRY_PROFILE_AND_PAYMENT_ORCHESTRATION_SPEC.md` — global/country/payment architecture
- `09_PRIVACY_SECURITY_COMPLIANCE_AND_LEGAL_DOCUMENT_SPEC.md` — platform compliance baseline
- `10_PILOT_MVP_SCOPE_AND_RELEASE_BOUNDARY.md` — binding lean product MVP
- `11_PRICING_ENTITLEMENTS_AND_BILLING_SPEC.md` — binding prices and feature limits
- `12_P0_EXECUTABLE_SCHEMA.sql` — executable schema baseline
- `13_P0_RLS_POLICIES_AND_TEST_MATRIX.md` — exact policies, sanitized projections, and attack cases
- `14_P0_COMMAND_API_EVENT_CONTRACTS.md` — exact P0 commands, errors, persistence, and events
- `15_P0_SCREEN_AND_STATE_SPECIFICATIONS.md` — route-level product UX contracts
- `16_BRAND_FIGMA_COMPONENT_VISUAL_DIRECTION.md` — locked Crecy brand/system decisions
- `17_P0_DATA_CONTRACT_TRACEABILITY_MATRIX.md` — route-to-table-to-policy-to-event traceability
- `18_MARKETING_CLAIMS_AND_EVIDENCE_POLICY.md` — safe claims and prohibited unsupported claims
- `20_COUNSEL_AND_COMPLIANCE_LAUNCH_CHECKLIST.md` — professional production evidence
- `21_GATE_0_COMPLETION_REPORT.md` — original Gate 0 resolution record
- `22_CODEX_CLAUDE_EXECUTION_PROMPT.md` — historical implementation instruction
- `23_V4_1_CORRECTION_REPORT.md` — v4.1 correction history
- `24_CODEX_APPLY_V4_1_PROMPT.md` — historical v4.1 application prompt
- `25_V4_1_1_CORRECTION_REPORT.md` — targeted v4.1.1 correction history
- `26_CODEX_APPLY_V4_1_1_PROMPT.md` — historical v4.1.1 application/validation prompt
- `27_LAUNCH_LAYER_AND_RUNTIME_READINESS_SPEC.md` — **binding launch/runtime/public-surface recovery program**
- `28_BRAND_IDENTITY_ASSET_SYSTEM.md` — founder-approved production logo, favicon, app-icon, product-lockup, and placement system
- `29_VISUAL_SYSTEM_FOUNDATION.md` — binding semantic themes, Crecy layout primitives, anti-generic rules, and redesign rollout order
- `30_VISUAL_ADVERSARIAL_REVIEW.md` — adversarial assessment of generic-design risks and required surface signatures
- `31_ANCHOR_SCREEN_ADVERSARIAL_REVIEW.md` — cross-surface review of the implemented OS, Living, Owner, and Marketing anchor screens plus propagation gates
- `AGENTS.md` — repository agent rules

## 8. Non-negotiable invariants

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
- No claim of SOC 2 compliance, customer traction, performance, country readiness, or other unsupported evidence.
- Quarantined/scanning/rejected documents never become usable merely to make an E2E pass.
- A worker without a real caller is not runtime-complete.
- An implicit first organization is not a valid multi-organization context model.
- Consent evidence must point to an actual published artifact/version shown to the user.
- A successful build is not proof of deployment.
- A restore runbook is not proof of recoverability until a restore drill is executed.
