# Delivery Plan, Tests, SLOs, Capacity, and Acceptance Gates

**Purpose:** Convert the architecture into bounded vertical slices with measurable completion criteria. No phase is complete because files exist or screens render.

---

## 1. Delivery method

Implement vertical slices that include:

- database and migration
- RLS and permissions
- domain command/query
- audit and events
- role-specific UI
- failure handling
- observability
- automated tests
- documentation

Avoid horizontal phases such as “build all tables” or “build all UI” without completing real workflows.

Every phase ends with a release candidate that can be demonstrated through one or more end-to-end user journeys.

## 2. Gate 0 — discovery and decisions

### Required outputs

- repository reconnaissance and architecture map
- preserve/refactor/replace/remove classification
- screen inventory and UX gap map
- current schema versus target schema
- decision register with founder answers
- payment/legal blocker register
- data migration strategy
- ADRs for tenancy, ledger, flow of funds, and RLS
- test strategy and environment plan
- implementation roadmap with dependency graph

### Exit criteria

- No unresolved product decision blocks Phase 1
- External legal/payment decisions are isolated behind disabled flags or reference adapters
- Existing production data risks are documented
- Founder approves launch segment and reference jurisdiction

---

## 3. Phase 1 — platform foundation and organization access

### Vertical journeys

1. Founder creates organization and trial.
2. Organization owner invites staff.
3. Staff activates account and sees only permitted navigation.
4. Organization owner assigns property scope.
5. Revoked staff loses sensitive access immediately.

### Build scope

- organization, subscription, plan, entitlement, usage foundations
- profile, membership, role, permission, and property scope
- MFA and privileged-session rules
- operator shell and settings
- audit event pipeline
- feature flags
- baseline observability
- RLS test harness

### Exit criteria

- cross-organization and scoped-role tests pass
- privileged roles require MFA
- support access is audited
- no authorization depends on editable metadata
- entitlement service controls one real feature and one usage limit

---

## 4. Phase 2 — portfolio, people, ownership, and imports

### Vertical journeys

1. Operator imports 100 properties/units/residents from template.
2. Operator corrects validation errors and commits import atomically.
3. Operator opens a property and sees unit, owner, and resident relationships.
4. Owner is invited and sees only owned properties.

### Build scope

- properties, buildings, units, unit types, addresses
- people, households, owner entities, ownership interests
- management agreements
- private vendor records
- import staging, mapping, validation, commit, rollback report
- portfolio and owner directory UI

### Exit criteria

- duplicate and cross-organization references are rejected
- import rerun is idempotent
- 10k-row reference import completes within target without request timeout
- owner isolation tests pass
- original import source and result report are retained

---

## 5. Phase 3 — leasing and tenancy

### Vertical journeys

1. Operator creates household and application.
2. Approved application produces lease draft.
3. Structured terms generate a versioned document.
4. Required parties sign.
5. Lease executes and tenancy activates.
6. Resident receives activation and sees lease.

### Build scope

- application, lease, party, term, signature, document version
- tenancy and member periods
- lease wizard and detail
- resident activation and document view
- signature-provider reference adapter or local sandbox adapter

### Exit criteria

- invalid transitions fail with stable error codes
- executed lease and signed document are immutable
- required signatures are enforced
- overlapping possession is prevented
- jurisdiction/template version is retained

---

## 6. Phase 4 — ledger, charges, payments, and resident balance

### Vertical journeys

1. Executed lease creates charge schedule.
2. Scheduled job posts rent charge once.
3. Operator records manual payment and allocation.
4. Resident sees updated balance and receipt.
5. Accountant reverses an incorrect payment through approved command.
6. Closed accounting period blocks ordinary posting.

### Build scope

- chart of accounts
- journal transaction and entry engine
- receivable account, schedules, charges, payments, allocations
- receipts, deposits, credits, reversals, write-offs
- period close/reopen
- resident payment/balance views
- financial audit and reporting basics

### Exit criteria

- every journal balances
- rerunning charge generation produces no duplicate
- allocation invariants pass property tests
- balance is reproducible from ledger and allocations
- no direct client mutation of posted financial tables
- example journals reconcile to expected totals

---

## 7. Phase 5 — online payment and reconciliation

### Vertical journeys

1. Resident initiates online payment.
2. Provider callback/redirect does not prematurely mark success.
3. Signed webhook succeeds payment exactly once.
4. Payment allocates and receipt is generated.
5. Settlement is imported and matched.
6. Amount mismatch creates exception.
7. Refund and dispute update financial history without deletion.

### Build scope

- payment provider adapter
- provider connections and events
- webhook inbox and replay
- settlement batches/items
- bank transaction import
- reconciliation matcher and exception queue
- payment failure and retry UX

### Exit criteria

- duplicate and out-of-order webhook tests pass
- signature failure does not mutate business state
- webhook acknowledgment remains inside provider budget
- settlement mismatch cannot be silently closed
- reconciliation trail links payment, provider, settlement, and bank record

---

## 8. Phase 6 — maintenance, inspections, and private vendors

### Vertical journeys

1. Resident submits issue with compressed evidence.
2. Operator triages and creates work order.
3. Private vendor accepts, quotes, schedules, and completes.
4. Operator/owner approves cost when required.
5. Resident confirms resolution.
6. Inspection documents before/after condition.

### Build scope

- maintenance request and work-order state machines
- vendor invitation and assignment
- scheduling, quotes, costs, approvals, evidence
- inspection templates, sessions, items, comparison
- resident and vendor mobile workflows

### Exit criteria

- vendor sees only assigned work
- resident-visible and internal notes are separated
- evidence upload resumes after interruption
- approved quotes are immutable/versioned
- maintenance cost posts through approved journal template
- SLA and stale-work monitoring exists

---

## 9. Phase 7 — owner accounting, statements, and remittance records

### Vertical journeys

1. System calculates property performance and owner payable.
2. Accountant reviews draft statement and drill-down.
3. Finalization creates immutable snapshot/document.
4. Owner sees statement and approval requests.
5. Operator records remittance and reconciliation evidence.

### Build scope

- owner subledger dimensions
- statement calculation and snapshot
- management fees/reserves/ownership allocation
- owner approval workflow
- remittance record
- payout destination security workflow, disabled unless approved

### Exit criteria

- statement totals reconcile to ledger cutoff
- finalized statement cannot be edited
- owner sees no unauthorized resident PII
- ownership fractions/effective dates are respected
- remittance records reconcile to owner payable

---

## 10. Phase 8 — reporting, communications, support, and launch hardening

### Build scope

- operator dashboards and reporting projections
- notification templates/preferences/delivery diagnostics
- global search and exports
- platform control plane
- incident tools and support sessions
- data export/deletion workflows
- backup restoration runbook
- accessibility and localization hardening
- onboarding guidance and in-product help

### Exit criteria

- operational dashboards cite cutoff and scope
- failed jobs/webhooks are diagnosable and replayable
- support actions are audited and constrained
- backup restoration test completes within RTO
- critical journeys pass accessibility review
- launch checklist and incident playbooks are approved

---

## 11. Nonfunctional workload envelope

The modular monolith must be proven against the reference launch envelope before marketplace work.

### Reference launch envelope

- 200 organizations
- 50,000 managed units
- 150,000 resident/owner/vendor identities
- 500,000 recurring charges per month
- 150,000 payment attempts per month
- 1,000,000 notification deliveries per month
- 250,000 maintenance requests per year
- 5,000,000 document/evidence objects
- 2,000 concurrent resident sessions at peak
- 300 concurrent operator sessions at peak
- Largest organization: 5,000 units
- Largest supported import: 100,000 rows through async pipeline

These are engineering targets, not sales forecasts.

## 12. Service-level objectives

| Service measure | Target |
|---|---:|
| Operator/resident monthly availability | 99.9% excluding announced maintenance |
| p95 cached/simple read | < 500 ms server response |
| p95 ordinary command | < 900 ms excluding external provider time |
| Payment webhook acknowledgement | < 2 seconds or provider-specific stricter target |
| p95 queue lag for ordinary notifications | < 60 seconds |
| Urgent operational event queue lag | < 15 seconds |
| Search p95 within organization | < 750 ms at reference envelope |
| Dashboard initial useful content | < 2.5 seconds on typical broadband |
| Resident key screen on constrained mobile | < 3.5 seconds with optimized assets |
| RPO for transactional database | ≤ 5 minutes |
| RTO for critical service | ≤ 2 hours |
| Critical document recovery | ≤ 4 hours |

External-provider outages are excluded from platform availability only when the platform provides a correct degraded state.

## 13. Performance budgets

- Initial resident JavaScript target: ≤ 220 KB compressed, excluding provider SDK loaded on demand
- Initial operator shell target: ≤ 350 KB compressed, route chunks loaded on demand
- Public vacancy page LCP: ≤ 2.5 seconds p75
- Images compressed and responsive; original inspection evidence retained only when required
- Lists paginate or virtualize beyond 100 visible records
- No synchronous request waits for bulk report, import, or mass notification completion

## 14. Cost guardrails

At 10,000 active managed units, target monthly core platform costs, excluding payment processing and pass-through messaging:

- compute/database/storage/queue: ≤ $0.35 per active unit
- observability: ≤ 15% of core platform infrastructure cost
- ordinary document storage: ≤ $0.08 per active unit, with evidence retention policy
- AI: disabled by default and separately metered
- SMS/WhatsApp: pass-through or plan-metered; never unbounded

A phase that introduces a material unit-cost increase must include cost model and entitlement strategy.

## 15. Testing pyramid and required suites

### Unit

- domain state transitions
- financial journal builders
- allocation and proration
- jurisdiction policy resolution
- entitlement decisions
- normalization and validation

### Database/RLS

- every role/resource matrix path
- negative cross-tenant access
- immutable record enforcement
- balanced journal constraint
- idempotency uniqueness
- migration/backfill behavior

### Integration

- payment provider sandbox
- signature callbacks
- queue retries and dead-letter
- storage policies and signed URL expiry
- messaging provider failures
- import/export

### Contract

- API request/response schemas
- error codes
- event envelopes and versions
- webhook inputs
- integration adapter conformance

### End-to-end

At minimum:

1. organization and staff onboarding
2. property/unit/owner import
3. lease to active tenancy
4. charge to payment to receipt to settlement
5. maintenance to work order to cost and completion
6. owner statement to remittance record
7. revocation/permission boundary
8. provider outage and retry

### Security

- authorization bypass attempts
- IDOR/BOLA
- webhook spoof/replay
- upload abuse
- rate limiting
- support impersonation
- payout destination takeover if enabled

### Accessibility

Automated checks do not replace manual keyboard and screen-reader tests on P0 journeys.

## 16. Release strategy

- Trunk-based development or short-lived branches
- Feature flags for incomplete/high-risk functionality
- Expand-and-contract schema migration
- Preview environment per change when practical
- Staging verification with production-like data volume and synthetic PII
- Canary/controlled rollout for payment and financial changes
- Rollback plan documented before production release
- Financial migrations use forward-fix scripts and reconciliation reports rather than unsafe destructive rollback

## 17. Phase completion report

Every phase produces `docs/implementation/PHASE_<N>_COMPLETION_REPORT.md` with:

- intended scope and actual scope
- architecture decisions
- files and migrations
- schema and RLS changes
- commands/events added
- UI flows and screenshots
- tests and exact results
- performance and cost observations
- security review
- migration/backfill evidence
- known risks and deferred work
- rollback/forward-fix plan
- acceptance checklist

“No tests were run” means the phase is not complete.

## 18. Production launch gate

Launch requires approval across:

### Product

- P0 workflows complete
- operator and resident validation findings addressed
- pricing and entitlements configured
- support and onboarding content ready

### Engineering

- all P0 tests passing
- SLO and load tests meet reference envelope or accepted reduced launch envelope
- migrations rehearsed
- no unresolved P0/P1 defects

### Finance/payments

- flow of funds approved
- journal examples reconciled
- provider webhook and settlement tests pass
- deposit behavior approved or disabled

### Security/privacy

- RLS suite passes
- threat model reviewed
- MFA and step-up controls active
- privacy/retention operations configured
- critical external review scheduled/completed according to risk

### Operations

- backups and restoration tested
- incident and provider-outage runbooks ready
- monitoring and alerts active
- support access controlled
- status communication process defined

### Legal

- terms, privacy notice, lease/notice template approvals, e-sign validity, and jurisdiction-specific rules completed by qualified reviewers

The coding agent may declare “implementation complete for phase.” Only designated human owners may declare “approved for production launch.”
