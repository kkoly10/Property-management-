# Codex / Claude Code Execution Prompt

You are implementing Crecy. Treat this v4 folder as the only authoritative specification. Earlier ZIPs, v2/v3 folders, generated-image text, and prior questionnaires are superseded.

## Required reading order

1. `00_READ_ME_FIRST.md`
2. `07_FOUNDER_DECISION_REGISTER.md`
3. `10_PILOT_MVP_SCOPE_AND_RELEASE_BOUNDARY.md`
4. `11_PRICING_ENTITLEMENTS_AND_BILLING_SPEC.md`
5. `12_P0_EXECUTABLE_SCHEMA.sql`
6. `13_P0_RLS_POLICIES_AND_TEST_MATRIX.md`
7. `14_P0_COMMAND_API_EVENT_CONTRACTS.md`
8. `15_P0_SCREEN_AND_STATE_SPECIFICATIONS.md`
9. `18_MARKETING_CLAIMS_AND_EVIDENCE_POLICY.md`
10. Target architecture, compliance, brand, source, and checklist files

## First response—reconnaissance, not broad coding

Produce:

- repository architecture map;
- existing dependency/runtime inventory;
- schema/migration inventory;
- route/screen inventory;
- authentication/RLS/storage/payment inventory;
- mapping of every existing file/module to Preserve, Refactor, Replace, Remove, or Missing;
- conflicts with v4;
- proposed Phase 1 branch/PR slices;
- exact validation commands available in the repository.

Do not reopen founder decisions. Do not claim legal/compliance evidence is complete.

## Implementation order

1. Design tokens, app shells, lint/type/test infrastructure.
2. Organization/operating entity/accounting book/roles schema.
3. RLS helpers, policies, storage grants, adversarial tests.
4. Portfolio/property/unit and import vertical.
5. Resident/lease/tenancy/document vertical.
6. Ledger/charges/manual payments vertical.
7. Stripe sandbox direct-charge vertical and webhook tests.
8. Resident portal payment/receipt vertical.
9. Maintenance vertical.
10. Basic owner portal/statement vertical.
11. Privacy, accessibility, localization, support tracing, launch hardening.

Use one small draft PR per vertical or security-sensitive unit. Never implement the entire platform in one change.

## Non-negotiable rules

- Do not invent landlord-tenant legal rules or templates.
- Do not certify operator documents.
- Do not collect security deposits online.
- Do not build screening, marketplace, open vendor network, automated owner payouts, or native apps in P0.
- Do not use destination charges for P0 rent.
- Do not mix SaaS billing with rent.
- Do not edit posted financial history; reverse it.
- Do not permit cross-book/cross-currency journal transactions.
- Do not bypass RLS from browser code.
- Do not use service role without explicit command authorization.
- Do not use image prices or marketing claims as requirements.
- Do not claim completion without commands/tests/screenshots and acceptance evidence.

## Completion report for every slice

Return:

- scope completed;
- files changed;
- migrations added;
- permissions/RLS affected;
- commands/events implemented;
- screens/states implemented;
- tests run with results;
- security/financial risks checked;
- deviations from specification;
- unresolved production evidence;
- recommended next slice.
