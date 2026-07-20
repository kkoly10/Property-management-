# Crecy Agent Rules

Read `docs/crecy-v4/00_READ_ME_FIRST.md` first. This v4.1.1 package supersedes all previous specifications.

## Sources of truth

- Founder/product decisions: `docs/crecy-v4/07_FOUNDER_DECISION_REGISTER.md`
- MVP scope: `docs/crecy-v4/10_PILOT_MVP_SCOPE_AND_RELEASE_BOUNDARY.md`
- Pricing/entitlements: `docs/crecy-v4/11_PRICING_ENTITLEMENTS_AND_BILLING_SPEC.md`
- Schema: `docs/crecy-v4/12_P0_EXECUTABLE_SCHEMA.sql`
- RLS/tests: `docs/crecy-v4/13_P0_RLS_POLICIES_AND_TEST_MATRIX.md`
- Commands/events: `docs/crecy-v4/14_P0_COMMAND_API_EVENT_CONTRACTS.md`
- UX/screens: `docs/crecy-v4/15_P0_SCREEN_AND_STATE_SPECIFICATIONS.md`
- Claims: `docs/crecy-v4/18_MARKETING_CLAIMS_AND_EVIDENCE_POLICY.md`

## Required behavior

- Reconnaissance before implementation.
- One vertical slice at a time.
- Forward-only reviewed migrations.
- All financial writes transactional, balanced, idempotent, audited, and evented.
- All exposed tenant data protected by RLS and negative tests.
- Operators own legal documents and rental decisions.
- Rent uses connected-operator direct charges; Crecy does not custody rent.
- Excluded P0 features stay excluded.
- Unchecked professional launch evidence is never represented as approved.


## v4.1 mandatory checks

- Files `docs/crecy-v4/12_P0_EXECUTABLE_SCHEMA.sql` through `docs/crecy-v4/17_P0_DATA_CONTRACT_TRACEABILITY_MATRIX.md` must be present as ordinary files. Do not depend on `.crecy-bootstrap` or a materialization workflow.
- Implement only commands that have matching persistence and traceability entries.
- Owners and vendors must use sanitized projections/server DTOs, never full lease, payment, maintenance, or work-order table rows.
- Property-scoped memberships must honor `starts_at`, `ends_at`, and explicit scopes on every data path.
