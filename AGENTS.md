# Crecy Agent Rules

Read `docs/crecy-v4/00_READ_ME_FIRST.md` first. The v4.2 package supersedes all previous specifications and chat-only implementation plans.

## Sources of truth

- Founder/product decisions: `docs/crecy-v4/07_FOUNDER_DECISION_REGISTER.md`
- Launch/runtime/public-surface readiness: `docs/crecy-v4/27_LAUNCH_LAYER_AND_RUNTIME_READINESS_SPEC.md`
- MVP product scope: `docs/crecy-v4/10_PILOT_MVP_SCOPE_AND_RELEASE_BOUNDARY.md`
- Pricing/entitlements: `docs/crecy-v4/11_PRICING_ENTITLEMENTS_AND_BILLING_SPEC.md`
- Schema: `docs/crecy-v4/12_P0_EXECUTABLE_SCHEMA.sql`
- RLS/tests: `docs/crecy-v4/13_P0_RLS_POLICIES_AND_TEST_MATRIX.md`
- Commands/events: `docs/crecy-v4/14_P0_COMMAND_API_EVENT_CONTRACTS.md`
- UX/screens: `docs/crecy-v4/15_P0_SCREEN_AND_STATE_SPECIFICATIONS.md`
- Claims: `docs/crecy-v4/18_MARKETING_CLAIMS_AND_EVIDENCE_POLICY.md`

## Required behavior

- Reconnaissance before implementation.
- Preserve strong shipped verticals; do not rewrite the ledger/RLS/import/payment engine merely because launch scope changed.
- One dependency-safe vertical slice at a time.
- Forward-only reviewed migrations.
- All financial writes transactional, balanced, idempotent, audited, and evented.
- All exposed tenant data protected by RLS and negative tests.
- Operators own legal documents and rental decisions.
- Rent uses connected-operator direct charges; Crecy does not custody rent.
- Excluded product features stay excluded unless a newer founder decision explicitly changes scope.
- Unchecked professional launch evidence is never represented as approved.
- A worker route with no real scheduler/caller is not runtime-complete.
- A quarantined document manually changed to `clean` for a test is not scan-lifecycle certification.
- Do not infer one organization with `.limit(1)` when a user may belong to multiple organizations.
- Consent evidence must identify an actual published legal artifact/version shown to the user.
- A passing build is not deployment evidence; a restore runbook is not restore evidence.

## Completion vocabulary — mandatory

Track and report these independently:

1. **Product implementation complete** — domain journey exists end to end and passes repository tests.
2. **Runtime operationally complete** — required unattended work has a real orchestrator, recovery, diagnostics, and execution evidence.
3. **Public launch surface complete** — anonymous users can discover, understand, price, trust, and enter Crecy through the required public routes.
4. **Provider configured/certified** — Stripe, transactional mail, scanning, or another external dependency is configured and actually exercised.
5. **Launch certified** — the launch journey in file 27 passes, deployment/restore evidence exists, and remaining professional gates are explicitly accounted for.

Never collapse those states into one percentage or claim `complete` without naming the layer.

## v4.1.1 / v4.2 mandatory checks

- Files `12_P0_EXECUTABLE_SCHEMA.sql` through `17_P0_DATA_CONTRACT_TRACEABILITY_MATRIX.md` must remain ordinary files. Do not depend on `.crecy-bootstrap` or a materialization workflow.
- Implement only commands that have matching persistence and traceability entries unless file 27 explicitly defines a new launch/runtime slice that must first add the missing contract/evidence.
- Owners and vendors must use sanitized projections/server DTOs, never full lease, payment, maintenance, or work-order table rows.
- Property-scoped memberships must honor `starts_at`, `ends_at`, and explicit scopes on every data path.
- Residents must never select base `work_orders`; use `reporting.resident_work_order_statuses` or an equivalent sanitized server DTO.
- Owner portal rows must match the authenticated `owner_entity_id`, not merely the property.
- Relationship announcements are readable only through explicit delivery rows.
- Marketing/public copy must obey file 18 and use file 11 for all pricing.
- Batch A in file 27 (scan lifecycle, scheduler/orchestrator, canonical organization context, legal version binding) precedes declaring a Crecy Launch Candidate.
