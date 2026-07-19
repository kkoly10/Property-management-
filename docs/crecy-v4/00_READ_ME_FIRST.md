# Crecy Senior Engineering Specification — v4 Gate 0 Complete

**Status:** Authoritative implementation package  
**Product:** Crecy global rental operating system  
**Authority date:** 2026-07-19  
**Commercial launch family:** United States, Canada, Mexico  
**First controlled pilot:** United States with Virginia-based operators, without jurisdiction-certified legal automation

## Authority and supersession

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

## Product definition

Crecy is a B2B2C property-management SaaS platform.

- **Crecy OS:** operator workspace and paying-customer product
- **Crecy Living:** resident portal/PWA
- **Crecy Owner:** owner transparency portal
- **Crecy Vendor:** private invited-vendor workspace, deferred until after the pilot unless required by a signed pilot

Operators supply and control their leases, addenda, notices, property rules, fees, deposits, applicant decisions, and legal documents. Crecy stores, versions, delivers, signs when enabled, and operationalizes those documents, but does not certify their legal sufficiency.

## Gate 0 status

Founder-controlled product decisions are closed in `07_FOUNDER_DECISION_REGISTER.md`.

Gate 0 permits repository scaffolding, migrations, RLS, UI implementation, sandbox Stripe Connect, testing, accessibility/localization implementation, and staging. Professional evidence remains required before production activation of affected regulated behavior; the checklist is a production gate, not a blocker to building.

## Build order

1. Run repository reconnaissance and map existing code.
2. Adopt design tokens and application shells.
3. Materialize and decompose the P0 schema into reviewed migrations.
4. Implement and attack-test RLS before feature UI.
5. Deliver one vertical journey at a time.
6. Use sandbox providers until production gates pass.
7. Run adversarial security, financial-integrity, accessibility, and UX reviews after each sensitive phase.

## Non-negotiable invariants

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
- No public marketplace, open vendor network, screening, or automated owner payout in P0.
- No claim of SOC 2 compliance, customer traction, performance, or country readiness without evidence.

## Complete-package materialization

If `12_P0_EXECUTABLE_SCHEMA.sql` is missing, run:

```bash
bash scripts/materialize-crecy-v4.sh
```

Then commit the extracted and checksum-verified files before implementation.
