# Codex / Claude Code Execution Prompt

Treat `docs/crecy-v4` as the only authoritative Crecy specification. Earlier ZIPs, v2/v3 folders, generated-image text, and prior questionnaires are superseded.

## Mandatory preflight

1. Read root `AGENTS.md` and `00_READ_ME_FIRST.md`.
2. Verify `12_P0_EXECUTABLE_SCHEMA.sql` exists.
3. If missing, run `bash scripts/materialize-crecy-v4.sh`, verify checksums, and commit the extracted files before implementation.

## Reading order

1. `00_READ_ME_FIRST.md`
2. `07_FOUNDER_DECISION_REGISTER.md`
3. `10_PILOT_MVP_SCOPE_AND_RELEASE_BOUNDARY.md`
4. `11_PRICING_ENTITLEMENTS_AND_BILLING_SPEC.md`
5. `12_P0_EXECUTABLE_SCHEMA.sql`
6. `13_P0_RLS_POLICIES_AND_TEST_MATRIX.md`
7. `14_P0_COMMAND_API_EVENT_CONTRACTS.md`
8. `15_P0_SCREEN_AND_STATE_SPECIFICATIONS.md`
9. `18_MARKETING_CLAIMS_AND_EVIDENCE_POLICY.md`
10. Remaining target architecture/compliance/brand/source files

## First response: reconnaissance, not broad coding

Produce repository architecture, dependencies/runtimes, schema/migrations, routes/screens, auth/RLS/storage/payments, Preserve/Refactor/Replace/Remove/Missing mapping, v4 conflicts, Phase 1 PR slices, and exact validation commands.

Do not reopen founder decisions or claim legal/compliance evidence is complete.

## Implementation order

1. Design tokens, shells, lint/type/test infrastructure.
2. Organization/operating entity/accounting book/roles schema.
3. RLS helpers/policies/storage grants/adversarial tests.
4. Portfolio/property/unit/import vertical.
5. Resident/lease/tenancy/document vertical.
6. Ledger/charges/manual-payment vertical.
7. Stripe sandbox direct-charge/webhook vertical.
8. Resident payment/receipt vertical.
9. Maintenance vertical.
10. Basic owner portal/statement vertical.
11. Privacy, accessibility, localization, tracing, launch hardening.

Use one small draft PR per vertical/security-sensitive unit. Never implement the whole platform in one change.

## Non-negotiable rules

- Do not invent landlord-tenant legal rules/templates or certify operator documents.
- Do not collect security deposits online.
- Do not build screening, marketplace, open vendor network, automated owner payouts, or native apps in P0.
- Do not use destination charges for P0 rent or mix SaaS billing with rent.
- Do not edit posted financial history; reverse it.
- Do not permit cross-book/cross-currency journal transactions.
- Do not bypass RLS from browser code or use service role without explicit command authorization.
- Do not use image prices/claims as requirements.
- Do not declare completion without tests and evidence.

## Slice completion report

Return scope, files, migrations, permissions/RLS, commands/events, screens/states, tests/results, security/financial checks, deviations, unresolved production evidence, and recommended next slice.
