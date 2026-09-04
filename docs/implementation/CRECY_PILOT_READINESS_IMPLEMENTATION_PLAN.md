# CRECY PILOT READINESS IMPLEMENTATION PLAN

**Purpose:** Authoritative execution plan for moving Crecy from its current production state to **Pilot Ready**.

**Audience:** Claude Code / senior engineering implementation agent.

**Status:** Founder-approved implementation authority for pilot closure.

**Plan revision:** 1.1 — adds explicit authority supersession plus pilot operability, incident severity, pause triggers, application rollback, and database recovery rules.

**Important distinction:**
- **Pilot Ready** = Crecy is safe and operational enough to onboard the first controlled external landlord/property manager without engineering intervention.
- **Pilot Complete** = At least three real pilot organizations complete the binding pilot journeys and success criteria.
- **Public Launch Candidate** = A separate post-pilot milestone with broader country, legal, localization, accessibility, security, payment, and load requirements.

This plan does **not** authorize feature expansion beyond the P0 pilot scope.


## Authority and Supersession

This file **supersedes any older pilot-readiness planning file**, including a shorter file named `PILOT_READINESS_PLAN.md`, unless the founder explicitly re-promotes an older file.

Do not maintain two competing pilot-readiness authorities.

Historical plans may be retained only as evidence/history and must be clearly marked:

`SUPERSEDED — see CRECY_PILOT_READINESS_IMPLEMENTATION_PLAN.md`

The requirements in this file are intentionally stable. Current-state facts are not.

Therefore, before executing each phase, refresh:
- current `main`;
- current production SHA;
- current Vercel state;
- current Supabase state;
- current provider configuration;
- current open Critical/High defects.

Do **not** rewrite this plan merely because implementation commits have advanced. Update the checkpoint/current-state record instead.

---

# 0. EXECUTION RULES FOR CLAUDE CODE

Claude Code must treat this file as the pilot-readiness execution authority.

Do not replace this plan with another broad roadmap.

Do not silently reinterpret unfinished user workflows as “built” merely because:
- a table exists;
- an RPC exists;
- an API endpoint exists;
- tests pass against seeded data;
- the database can be manipulated manually to make the screen work.

A workflow is complete only when the intended user can traverse it through the Crecy product.

Do not optimize for test count.

Preserve valuable existing tests and add new regression coverage primarily for:
- money / ledger invariants;
- payments / Stripe webhook idempotency;
- RLS / cross-organization isolation;
- auth and service-role boundaries;
- imports that create financial or tenancy data;
- scheduler duplicate execution;
- malware scanning lifecycle;
- defects actually discovered while executing this plan.

For normal UI/product work:
- lint;
- typecheck;
- build;
- smallest targeted test;
- browser/visual smoke when appropriate.

Do not begin speculative features while this plan is incomplete.

At the start of each phase:
1. reconcile current `main`;
2. reconcile current production deployment;
3. inspect actual production/provider state;
4. do not trust stale reports when the live system can be queried.

---

# 1. GOAL

Move Crecy to:

> **PILOT READY = a first controlled external landlord/property manager can run the required Crecy workflows without direct SQL, database seeding as a substitute for product setup, manually changing document scan state, manually creating payment state, or manually invoking scheduled workers as proof that scheduling works.**

This plan ends at Pilot Ready.

The subsequent real pilot with at least three organizations determines whether Crecy becomes Pilot Complete.

---

# 2. CURRENT PRODUCT BASELINE

Crecy already has most of the underlying domain engine:

- organization onboarding;
- properties and units;
- residents and tenancies;
- CSV/XLSX/combined imports;
- lease records;
- double-entry ledger;
- recurring-rent engine;
- manual/external payments;
- reversals and write-offs;
- resident portal;
- maintenance requests;
- work-order backend/lifecycle;
- messaging;
- announcements;
- document/version architecture;
- owner statements;
- multi-organization isolation architecture;
- support/audit tooling;
- Stripe architecture;
- transactional notification worker;
- scanner lifecycle;
- scheduler architecture;
- public marketing;
- Crecy OS / Crecy Living / Crecy Owner domain architecture.

The remaining work is primarily:

1. production runtime activation;
2. incomplete operator workflows;
3. asynchronous file workflow correction;
4. provider certification;
5. legal activation;
6. operational safety;
7. a real no-shortcuts end-to-end certification.

---

# 3. PROGRAM STRUCTURE

Execute in this order:

1. **Phase 1 — Production Runtime Recovery**
2. **Phase 2 — Scanner + Document Workflow Completion**
3. **Phase 3 — Maintenance Completion**
4. **Phase 4 — Owner Setup Completion**
5. **Phase 5 — Communication + Identity Activation**
6. **Phase 6 — Stripe Test-Mode Certification**
7. **Phase 7 — Legal + Operational Safety**  
   This phase may run in parallel with Phases 2–6 where dependencies allow.
8. **Phase 8 — No-Shortcuts Certification**
9. **Phase 9 — Pilot-Ready Decision**
10. **Phase 10 — Real Three-Organization Pilot**

Do not skip directly to Phase 8 while earlier required gates remain red.

---

# 4. PHASE 1 — PRODUCTION RUNTIME RECOVERY

## Objective

Make the production infrastructure Crecy already has actually operate reliably.

## 1.1 Establish Production Truth

Record and verify:
- current `main` SHA;
- current production Vercel deployment SHA;
- production Vercel project;
- production Supabase project reference;
- applied migration inventory;
- contract migrations still unapplied, if any;
- production Supabase Auth Site URL;
- production Supabase Auth allowed redirect URLs;
- production storage configuration required by P0;
- configured production domains;
- relevant Vercel environment variables;
- relevant provider configuration.

Do not infer this from old runbooks.

### Exit criteria

One current checkpoint unambiguously identifies:
- which code is live;
- which database receives production data;
- which migrations are applied;
- which Auth configuration is active;
- which domains point to the deployment.

## 1.2 Fix Server-Side Supabase Runtime

Current production workers have been observed failing because:

`SUPABASE_SECRET_KEY is not configured.`

Configure the correct production server credential through the approved Vercel secret mechanism.

Requirements:
- server-only;
- never exposed to client bundles;
- `createAdminClient()` succeeds in production;
- missing/invalid configuration still fails loudly;
- Preview and Production configuration are intentional.

Redeploy if necessary.

### Verify

The following no longer fail because of the missing server credential:
- recurring-charge cron;
- notification cron;
- document-scan cron;
- operational-sweep/recovery cron.

### Exit criteria

All scheduled worker routes can connect to the intended Supabase project.

## 1.3 Scheduler Certification

Prove actual scheduled execution, not manual worker invocation.

### Recurring rent

Create a real eligible recurring-charge schedule using supported product setup.

Allow the real scheduler to invoke it.

Verify:
- correct property-local operational date;
- one charge;
- balanced journal;
- repeated/overlapping scheduler execution does not duplicate the charge.

### Notifications

Queue a real transactional notification.

Allow cron to:
- claim it;
- render it;
- send it through the configured provider.

### Document scans

Upload and finalize a real document.

Allow cron to:
- claim the scan;
- send the actual object to the configured scanner;
- process the verdict.

### Operational recovery

Exercise at least one safe representative stale/recovery condition.

### Exit criteria

All four runtime families have at least one successful scheduled execution.

## 1.4 Minimum Operational Alerting

Do not build a new observability platform.

Use Vercel alerting/logs plus existing Crecy runtime diagnostics.

A human must be able to notice:
- repeated recurring-charge failures;
- scanner dead letters / sustained scan failure;
- notification dead letters / sustained delivery failure;
- operational sweep degradation.

### Exit criteria

A critical worker cannot fail repeatedly for days without an actionable signal.

---

# 5. PHASE 2 — SCANNER + DOCUMENT WORKFLOW COMPLETION

## Objective

Turn the existing scan lifecycle into a product-safe asynchronous workflow.

## 2.1 Configure a Real Scanner

Use an actual scanner provider/relay.

Verify:
- safe file -> clean;
- malicious/test file -> rejected;
- provider outage -> document remains unavailable and retryable;
- stale/dead-letter recovery behaves correctly;
- scan verdict remains bound to the exact object/version/hash expected by the current security design.

### Exit criteria

Real uploaded bytes are processed by a real scanner.

## 2.2 Standardize Scan UX

Product surfaces must represent:

`upload -> quarantined/scanning -> clean | rejected`

### Pending

Show a clear processing state such as:

`Scanning…`

Do not allow the file to satisfy downstream requirements yet.

### Clean

File becomes usable.

### Rejected

Show a clear rejection state and provide replacement/re-upload where appropriate.

### Temporary failure

Keep the file unavailable and explain that processing is delayed.

Do not falsely mark it clean.

## 2.3 Audit All Scan-Dependent Flows

At minimum inspect and correct:
- lease upload;
- document center;
- document ZIP/import ingestion;
- resident maintenance attachments;
- work-order completion evidence.

### Exit criteria

No required workflow assumes:

`uploaded = usable`.

No normal workflow requires manually setting `upload_status='clean'`.

---

# 6. PHASE 3 — MAINTENANCE COMPLETION

## Objective

Make maintenance usable end-to-end for a brand-new organization.

## 3.1 Operator Vendor Directory

Add the smallest complete private vendor management workflow.

Recommended navigation:

`Maintenance -> Vendors`

Required:
- vendor list;
- create vendor;
- vendor detail;
- basic edit;
- email;
- phone;
- supported active/inactive/archive state.

Do NOT build:
- vendor login;
- vendor marketplace;
- ratings;
- bidding;
- commissions;
- public vendor network.

Crecy Vendor remains post-pilot by default.

### Exit criteria

A zero-vendor organization can create its first private vendor entirely through Crecy OS.

## 3.2 Vendor Creation from Work Order

When an operator is assigning a work order and no appropriate vendor exists:

Provide an obvious:

`Add vendor`

path.

After creation:
- return to the assignment context;
- allow the new vendor to be selected.

### Exit criteria

The maintenance UI never tells an operator to add a vendor without giving them a supported way to do it.

## 3.3 Repair Completion-Evidence Workflow

The known broken sequence is effectively:

`upload -> finalize -> immediately attempt completion`

while the evidence remains quarantined.

Do not weaken the existing rule requiring clean evidence.

Implement an asynchronous workflow.

Recommended flow:

1. Operator enters completion summary.
2. Operator enters final cost if applicable.
3. Operator uploads evidence.
4. File finalizes into scan lifecycle.
5. UI displays `Scanning`.
6. Work order remains safely incomplete.
7. Scanner returns `clean`.
8. Completion becomes available or safely proceeds.
9. Rejected evidence requires replacement.

### Exit criteria

A work order that requires evidence can be completed entirely through the normal UI using an actual scan verdict.

---

# 7. PHASE 4 — OWNER SETUP COMPLETION

## Objective

Allow operators to create the owner/property relationships already assumed by owner statements and invitations.

## 4.1 Owner Directory

Add a clear operator owner-management entry point.

Recommended navigation:

`Owners`

Required:
- owner list;
- add owner;
- owner detail;
- supported contact information.

## 4.2 Ownership Interests

Inside owner setup/detail:

Allow the operator to associate the owner with a property using the existing ownership-interest model.

Required fields should come from the existing domain/schema and may include:
- property;
- ownership share/percentage/allocation;
- effective-from date;
- effective-to date where applicable;
- any existing required legal/entity identifiers already supported.

Do not invent a second owner model.

Do not bypass existing validation.

### Exit criteria

A new organization can create the owner/property interest required by existing owner statement logic without direct DB insertion.

## 4.3 Reuse Existing Owner Functionality

After owner setup, reuse existing:
- owner invitation;
- owner portal;
- statement generation;
- immutable statement snapshots;
- CSV export;
- property-scoped authorization.

Do not rewrite the owner accounting engine.

## 4.4 Owner Maintenance Approval

Exercise one real approval-required work order.

Flow:

`operator work order`
-> approval threshold reached
-> owner receives request
-> owner authenticates
-> owner sees only authorized request/property
-> owner approves or rejects
-> work-order lifecycle proceeds according to existing rules
-> decision remains audited.

If current policy requires AAL2/MFA for the approval, exercise the real step-up path.

### Exit criteria

One real owner approval works without SQL, operator bypass, or seeded approval state.

---

# 8. PHASE 5 — COMMUNICATION + IDENTITY ACTIVATION

## Objective

Make invitations reliably create usable users on the correct Crecy surface.

## 5.1 Transactional Email Provider

Use the current Resend implementation and the actual current sending-domain convention.

Do not revert to stale `notifications.*` assumptions.

Confirm the intended current mail domains, including the current `mail.*` convention where applicable.

Verify:
- provider API key;
- internal relay secret;
- DNS;
- SPF;
- DKIM;
- DMARC posture appropriate for pilot;
- Resend domain verification;
- retry behavior;
- idempotency behavior.

## 5.2 Resident Invitation

Real flow:

operator invites resident
-> actual email arrives
-> link opens Crecy Living
-> Auth activation completes
-> resident lands on the correct resident surface.

Use a genuinely new email account for certification.

## 5.3 Owner Invitation

Real flow:

operator invites owner
-> actual email arrives
-> link opens `owner.crecyos.com`
-> activation completes
-> owner sees only authorized property information.

## 5.4 Staff Invitation

Real flow:

operator invites staff
-> email arrives
-> staff activates
-> role/property scope applies.

Then verify one revoke:
- operator revokes access;
- access disappears on next authorized interaction.

## 5.5 Supabase Auth Production Configuration

Verify and configure the real production settings.

Canonical surfaces:
- Crecy OS: `https://app.crecyos.com`
- Crecy Living: `https://crecyliving.com`
- Crecy Owner: `https://owner.crecyos.com`

Configure:
- Site URL;
- exact required redirect URLs;
- narrow community-domain callback support only if the actual flow needs dynamic subdomains;
- password reset;
- email confirmation;
- invitation activation.

Do not use overly broad redirect wildcards for convenience.

### Exit criteria

Resident, owner, and staff activation all work from actual inbox messages.

---

# 9. PHASE 6 — STRIPE TEST-MODE CERTIFICATION

## Objective

Prove the payment system through the real operator and resident interfaces.

Stripe remains required for binding P0 pilot certification.

## 6.1 Operator Connect Setup

From Crecy OS payment settings:

1. Operator starts Stripe Connect onboarding.
2. Operator completes Stripe TEST onboarding.
3. Stripe returns to `app.crecyos.com`.
4. Crecy reflects the connected-account eligibility/state.
5. Resident payment capability becomes available where appropriate.

Do not seed connected-account state directly.

## 6.2 Resident Payment

Resident:

1. signs into Crecy Living;
2. sees correct balance;
3. starts payment;
4. enters Stripe test flow;
5. completes the payment;
6. returns to the same validated Living origin.

## 6.3 Backend Payment Proof

Verify:

Stripe signed webhook
-> canonical payment
-> allocation
-> receipt
-> reconciliation state
-> resident balance update.

Replay the same webhook.

Verify:
- no duplicate canonical payment;
- no duplicate allocation.

Exercise one relevant failed/returned state if readily available without creating another major testing project.

### Exit criteria

Complete operator -> Stripe -> resident -> webhook -> ledger/reconciliation journey passes.

---

# 10. PHASE 7 — LEGAL + OPERATIONAL SAFETY

This phase may run in parallel with Phases 2–6 where dependencies allow.

## 7.1 Pilot Legal Package

Engineering must not decide what legal package is sufficient.

Engineering responsibility:
- versioned legal registry works;
- publication state works;
- consent binding works;
- missing/unpublished required documents fail closed;
- exact accepted version/hash is persisted.

Founder/counsel responsibility:
- determine the minimum approved package for a controlled external pilot.

At minimum current operator onboarding requires:
- Operator Terms;
- Privacy Notice.

The broader compliance authority also identifies other potentially required documents, including:
- Resident/Owner Portal Terms;
- DPA;
- Subprocessor List;
- E-Sign;
- Payment disclosure;
- Communications notice;
- retention/security/privacy documents.

Do not automatically publish drafts.

Once approved:
- assign final version;
- effective date;
- content hash;
- publication state;
- deploy;
- verify consent evidence.

### Exit criteria

The counsel/founder-approved pilot legal package is deliberately published.

## 7.2 Restore Drill

Perform one real restore exercise.

Preferred sequence:

1. identify the backup/snapshot source;
2. restore into an isolated safe environment;
3. verify representative:
   - organization;
   - property/unit;
   - resident/tenancy;
   - ledger transaction;
   - payment metadata;
   - owner relationship;
   - document metadata;
4. record:
   - date;
   - source;
   - procedure;
   - result;
   - defects discovered.

Do not turn this into a multi-region DR project.

### Exit criteria

One successful documented restore test.

## 7.3 Security Release Gate

Run one bounded release check.

Verify:
- existing RLS/adversarial suite green;
- multi-org isolation green;
- production server secrets remain server-only;
- Supabase security advisors reviewed;
- no known unresolved Critical/High product-security issue;
- no launch-blocking dependency vulnerability;
- support access remains controlled/audited;
- no committed/exposed production secrets.

If a real Critical/High defect is found:
- fix it before Pilot Ready;
- add targeted regression coverage.

Do not start another giant security program.

### Exit criteria

Zero known unresolved Critical/High security issues.

## 7.4 Support / Diagnostic Proof

The pilot requires support to investigate without editing production directly.

During certification:
- create one representative support problem/event;
- use existing support/audit/correlation tooling to identify what happened;
- do not directly edit production data to resolve the investigation.

### Privacy-request operational smoke

A controlled pilot holds real resident and owner personal data, so the pilot must be able to receive
and route one data-subject request before it admits real people — not merely be able to respond to
security incidents.

Submit or create one representative access / correction / deletion request through the supported
privacy workflow, then prove it can be located, routed and investigated without direct SQL.

This is a bounded operational smoke. It is **not** authorization to build a privacy-rights product
program, expand the request taxonomy, or add jurisdictional workflows.

### Exit criteria

- One representative pilot issue can be investigated without direct SQL manipulation.
- One representative privacy request can be located and routed without direct SQL manipulation.

---


## 7.5 Pilot Operability and Incident Response

### Objective

Crecy must not only work once. During a controlled pilot, the founder must be able to know when a critical workflow breaks, decide whether to pause the affected capability, and recover safely.

This is a **small-pilot operating model**, not a 24/7 enterprise SRE program.

### Operational owner

During the controlled pilot:

> **The founder is the named operational owner / on-call human.**

If another person becomes responsible for pilot operations, record the replacement explicitly in the checkpoint.

There must always be one named human responsible for receiving and acting on P0/P1 operational signals.

### Error tracking

Wire **Sentry or an equivalent error-tracking service** if an existing connected service is available and suitable.

Minimum useful coverage:
- server runtime exceptions;
- critical API failures;
- client exceptions that block a required P0 journey;
- environment;
- release / Git SHA;
- request or correlation identifier where available;
- route / surface.

Error tracking must not become a new product program.

#### Privacy / data rules

Do not send sensitive customer content merely to improve debugging.

Scrub or exclude:
- passwords;
- session tokens;
- invitation tokens;
- signed document tokens;
- Stripe secrets or raw provider credentials;
- payment method details;
- lease/document contents;
- maintenance message bodies or photos;
- resident message bodies;
- unnecessary resident PII;
- owner statement contents beyond safe identifiers/metadata;
- service-role credentials;
- Authorization/Cookie header contents.

Prefer IDs, sanitized error codes, release SHA, route, and correlation IDs.

### Severity model

#### P0 — Stop / contain immediately

Examples:
- cross-organization or cross-resident data exposure;
- unauthorized privileged access;
- confirmed secret exposure;
- canonical payment duplicated or materially corrupted;
- unbalanced journal created by a production mutation;
- recurring rent duplicated across a pilot portfolio;
- destructive data corruption;
- confirmed security incident involving protected pilot data.

Required response:
1. stop or isolate the affected capability;
2. preserve logs/evidence;
3. identify affected organizations/data;
4. do not continue normal pilot use of the affected workflow;
5. fix or safely recover;
6. run the relevant critical regression and affected no-shortcuts journey before re-enabling.

#### P1 — Major degradation

Examples:
- recurring-charge scheduler stops;
- Stripe payment flow unavailable;
- scanner unavailable for a sustained period;
- transactional invitations cannot be delivered;
- owner/resident authentication callback failure;
- restore/backup capability unavailable;
- critical worker repeatedly returns 5xx.

Required response:
1. acknowledge and investigate promptly;
2. pause only the affected capability when needed;
3. preserve unrelated healthy pilot functions when safe;
4. communicate workaround/status to affected pilot users where necessary;
5. re-certify the affected workflow after the fix.

#### P2 — Isolated non-critical defect

Examples:
- localized UI defect;
- copy/formatting problem;
- non-blocking email formatting issue;
- isolated visual problem;
- minor workflow friction that does not corrupt data or break authorization.

Required response:
- record;
- prioritize normally;
- do not shut down the pilot unless the defect reveals a larger risk.

### Pause triggers

At minimum, pause the affected production capability when any of these occurs:
- any confirmed P0;
- repeated duplicate-payment or duplicate-rent behavior;
- unbalanced journals caused by a live command;
- cross-org isolation failure;
- scanner begins accepting unverified/rejected objects as safe;
- Auth misrouting can expose another audience or organization;
- worker failures make automated rent generation unreliable and the system cannot safely determine what was or was not posted.

Fail closed where the existing design already supports it.

A scanner outage, for example, should leave files quarantined rather than weakening the clean-file requirement.

### Rollout record

For each production pilot deployment, record:
- release SHA;
- deployment ID;
- time promoted;
- migrations applied;
- provider/config changes;
- last-known-good application deployment;
- any irreversible migration/data change introduced in the release.

### Application rollback

A bad application release may be rolled back to the **last-known-good Vercel deployment** only if it remains compatible with the current production schema and provider configuration.

Before rollback, check:
- whether new migrations were applied;
- whether the old application can safely operate against the new schema;
- whether background workers from the old build would interpret current rows correctly;
- whether Stripe/webhook/provider contracts changed.

Do not assume an application rollback is safe merely because Vercel can promote an earlier deployment.

### Database/schema incident rule

Crecy uses forward migrations.

Therefore:

> **Do not automatically reverse production migrations as a generic rollback strategy.**

For schema/data incidents choose deliberately among:
- pause affected capability;
- forward-fix;
- restore from verified backup into an approved recovery path;
- application rollback when schema-compatible.

A destructive down-migration must never be improvised during a pilot incident.

### Recovery / restore coupling

The restore drill in §7.2 is part of the incident model, not documentation theater.

Before admitting the first real pilot operator:
- the restore procedure must have been exercised;
- the responsible operational owner must know where the runbook/evidence is;
- the last successful restore date must be recorded.

### Re-enable rule

After a P0 or serious P1 fix:

Do not re-enable the affected capability solely because the deploy succeeded.

Require:
1. resulting production state verified;
2. targeted critical regression green;
3. affected real-provider/runtime path exercised where practical;
4. no-shortcuts journey resumed from the affected point or rerun where state integrity is uncertain.

### Exit criteria

Pilot operability is PASS when:
- one named operational owner exists;
- error tracking/critical runtime visibility is configured;
- P0/P1/P2 severity rules are documented;
- pause triggers are documented;
- last-known-good application deployment is recorded;
- application rollback compatibility rule is documented;
- database incidents explicitly use deliberate forward-fix/restore logic rather than blind down-migration;
- the restore drill has passed.


---

# 11. PHASE 8 — NO-SHORTCUTS CERTIFICATION

## Objective

Simulate the first real pilot organization from a clean starting point.

This is the central Pilot Ready gate.

## 8.1 Certification Starting State

Start with:
- brand-new operator Auth account;
- brand-new organization;
- zero private vendor records;
- zero owner entities/interests;
- no seeded resident relationship used as a substitute for product setup;
- no Stripe connected-account state;
- no manually cleaned documents.

Fixtures may be used while debugging.

The final PASS must not rely on them as substitutes for normal product workflows.

## 8.2 Journey A — Acquisition / Company Setup

1. Visit `crecyos.com`.
2. Navigate product/pricing.
3. Start signup.
4. Create new operator account.
5. Accept actual published legal documents.
6. Create organization.
7. Create operating entity.
8. Create accounting book.

## 8.3 Journey B — Portfolio

1. Create property.
2. Create unit.
3. Import or create occupied resident/lease data through supported workflow.
4. Create opening balance where applicable.
5. Upload real lease/document.
6. Real scanner processes it to clean.

## 8.4 Journey C — Staff

1. Invite a second staff/operator user.
2. Assign role.
3. Restrict to one property where appropriate.
4. User accepts invitation.
5. Verify authorized property is visible.
6. Verify unauthorized property is not visible.
7. Revoke or retain depending on the journey.

## 8.5 Journey D — Maintenance

1. Resident submits maintenance request.
2. Include actual attachment/photo if supported.
3. Operator triages.
4. Operator creates vendor through Crecy OS.
5. Operator assigns the new vendor.
6. Advance work-order lifecycle.
7. Enter completion summary/cost.
8. Upload completion evidence.
9. Evidence enters scanner.
10. Real scanner returns clean.
11. Work order completes.

## 8.6 Journey E — Owner

1. Operator creates owner through UI.
2. Operator creates property ownership interest.
3. Operator sends owner invitation.
4. Real email arrives.
5. Owner activates.
6. Owner sees only authorized property.

Then exercise one approval-required maintenance case:

7. Work order triggers owner approval.
8. Owner receives/accesses request.
9. Owner approves or rejects.
10. Work order proceeds according to existing rules.

Then:

11. Operator creates/finalizes owner statement.
12. Owner sees statement.

## 8.7 Journey F — Rent Automation

1. Configure recurring rent schedule.
2. Wait for actual scheduler.
3. Verify:
   - charge generated;
   - correct operational date;
   - balanced journal;
   - exactly one canonical charge.

Do not manually invoke the recurring-charge worker as certification proof.

## 8.8 Journey G — Resident Activation

1. Send actual resident invitation email.
2. Resident activates from that email.
3. Resident enters Crecy Living.
4. Verify:
   - correct property;
   - correct tenancy;
   - correct balance;
   - authorized documents;
   - authorized maintenance;
   - no unrelated organization data.

Use a genuinely new resident email for final certification.

## 8.9 Journey H — Payment

1. Operator completes Stripe TEST Connect onboarding through Crecy.
2. Resident starts payment.
3. Stripe completes payment.
4. Return lands on correct Living origin.
5. Signed webhook processes.
6. Allocation appears.
7. Receipt appears.
8. Reconciliation state is correct.
9. Replay webhook.
10. Verify no duplicate canonical payment.

## 8.10 Journey I — Multi-Organization Isolation

Create/join Organization B.

Switch A -> B.

Verify representative surfaces:
- properties;
- residents;
- maintenance;
- payments;
- documents;
- owners.

No cross-organization data may appear.

Also verify revoked/expired membership behavior if practical using existing controls.

## 8.11 Journey J — Support

Create or identify one issue/event from this certification.

Use the existing support/diagnostic tools to investigate it without direct production database manipulation.

---

# 12. FORBIDDEN CERTIFICATION SHORTCUTS

The final certification is INVALID if it relies on:

- direct SQL to create required vendor records;
- direct SQL to create required owner entities/interests;
- manually changing document scan state to `clean`;
- pre-cleaning files outside the real scan lifecycle;
- manually creating a canonical payment;
- seeding Stripe-connected-account state;
- manually invoking scheduled workers as proof of scheduler behavior;
- bypassing legal publication;
- using preconfirmed resident/owner Auth accounts instead of actual invitations;
- direct production DB edits to repair the normal product journey.

Debugging may use controlled fixtures.

Final certification may not.

---

# 13. PHASE 9 — PILOT READY DECISION

Crecy may be declared **PILOT READY** only when ALL of the following are green.

## Gate 1 — Production identity
- production Vercel deployment identified;
- production Supabase project identified;
- migrations verified;
- Auth configuration verified;
- storage configuration verified.

## Gate 2 — Runtime
- server Supabase secret works;
- recurring-charge cron succeeds;
- notification cron succeeds;
- scanner cron succeeds;
- recovery cron succeeds;
- basic failure visibility exists.

## Gate 3 — Scanner
- real provider exercised;
- clean path works;
- rejected path works;
- async file UX works.

## Gate 4 — Communication/Auth
- resident email arrives and activates;
- owner email arrives and activates;
- staff email arrives and activates;
- links land on correct surface.

## Gate 5 — Maintenance
- vendor management works;
- assignment works;
- evidence scan works;
- work-order completion works.

## Gate 6 — Owner
- owner creation works;
- ownership interest works;
- invitation works;
- owner statement works;
- one owner approval works.

## Gate 7 — Stripe
- operator Connect setup works;
- resident test payment works;
- signed webhook works;
- allocation/receipt/reconciliation work;
- replay does not duplicate payment.

## Gate 8 — Legal
- counsel/founder-approved pilot legal package is deliberately published.

## Gate 9 — Operational safety
- restore drill complete;
- zero known unresolved Critical/High security issues;
- support diagnostic proof complete;
- named pilot operational owner exists;
- critical error/runtime visibility is configured;
- pause/rollback rules are documented;
- last-known-good compatible application deployment is recorded.

## Gate 10 — Full certification
- entire no-shortcuts certification journey passes.

When all ten gates are green:

> **STATUS = PILOT READY**

At that point Crecy may accept Pilot Organization #1.

---

# 14. PHASE 10 — REAL PILOT

Pilot Ready is not Pilot Complete.

After Pilot Ready:

## Pilot Organization 1
- onboard;
- observe actual usage;
- fix real P0 defects;
- do not automatically expand scope based on every request.

## Pilot Organization 2
- onboard after high-severity Pilot 1 defects are resolved.

## Pilot Organization 3
- onboard and repeat.

---

# 15. PILOT COMPLETE GATE

The binding pilot becomes complete only when at least three pilot organizations complete the required journeys and the binding success criteria are met.

Measure:

- import commit success >= 98% after user-correctable validation;
- no cross-tenant access;
- no unbalanced journal transactions;
- no duplicate canonical payments from replayed webhooks;
- resident task completion >= 95% for pay / view receipt / submit maintenance;
- **operator performance target:** p95 interactive screen load < 2.5s on the reference workload;
- **resident performance target:** p95 initial meaningful content < 2.5s on mid-tier mobile over 4G;
- zero unresolved Critical/High security issues;
- documented restore evidence;
- support investigations use audit/correlation tooling rather than direct production edits.

When these pass:

> **STATUS = PILOT COMPLETE**

---

# 16. PUBLIC LAUNCH IS A SEPARATE PROGRAM

Do not equate Pilot Complete with broad North America launch readiness.

The post-pilot launch program separately includes items such as:

- production payment certification by country;
- Canadian / Quebec French requirements;
- Mexico Spanish legal/commercial review;
- SaaS tax/invoice treatment;
- broader legal publication;
- accessibility audit;
- penetration testing;
- load/performance testing;
- expanded recovery evidence;
- localized pricing/commercial rollout.

Those are outside this Pilot Readiness Implementation Plan.

---

# 17. CHECKPOINT REPORT FORMAT

Do not report raw test counts as the primary readiness measure.

At every checkpoint report:

## Repository
- current `main` SHA
- current production SHA

## Runtime
- Supabase server runtime: PASS / FAIL
- recurring cron: PASS / FAIL
- notification cron: PASS / FAIL
- scan cron: PASS / FAIL
- recovery cron: PASS / FAIL
- failure alerting: PASS / FAIL

## Providers
- scanner: configured / exercised / certified
- Resend: configured / delivered / activation certified
- Stripe: configured / Connect certified / resident payment certified

## Product closure
- async scan UX: PASS / FAIL
- completion evidence: PASS / FAIL
- vendor operator UI: PASS / FAIL
- owner setup UI: PASS / FAIL
- owner approval: PASS / FAIL
- staff lifecycle: PASS / FAIL

## Human / operational
- legal package: draft / under review / published
- restore drill: PASS / FAIL
- security gate: PASS / FAIL
- support investigation: PASS / FAIL
- operational owner: NAMED / MISSING
- error tracking / runtime visibility: PASS / FAIL
- last-known-good deployment: SHA / deployment ID / MISSING
- active P0/P1 incident: NONE / description

## Certification
- no-shortcuts journey: NOT RUN / RUNNING / PASS / FAIL
- exact failure point if FAIL

## Overall state
Use one of:
- Built
- Pilot Candidate
- Pilot Ready
- Pilot Complete
- Public Launch Candidate

Never collapse these states into one misleading completion percentage.

---

# 18. EXECUTION PRINCIPLE

From this point forward:

> **Fix what prevents a real operator from completing the business.**

Do not optimize for theoretical completeness.

Do not add speculative features.

Do not count backend primitives as completed user journeys.

Do not replace real-provider verification with mocks.

Do not replace scheduled execution with manual worker calls.

Do not replace actual UI setup with seeded database records.

The implementation program ends when a real first pilot can use Crecy without engineering intervention.


---

# APPENDIX A — BLOCKER → AFFECTED JOURNEY / GATE MAP

Triage aid restored from the earlier planning file. This table is **structural**: it records which
journeys and gates a blocker affects, not whether that blocker is currently open. Current status
belongs in the checkpoint (§17), never here — a plan that carries its own progress goes stale and
starts lying.

Journeys are those in §8. Gates are those in §13.

| Blocker | Journeys blocked (§8) | Gate (§13) |
| --- | --- | --- |
| Server Supabase credential unusable in production | C, D, E, F, G, H, J | Gate 2 |
| Scheduled execution unproven (cron cannot run workers) | D, F, G, H | Gate 2 |
| No transactional mail provider configured | C, E, G | Gate 4 |
| Auth Site URL / redirect allowlist wrong for an audience | A, C, E, G | Gate 4 |
| No real malware scanner configured | B, D, E | Gate 3 |
| Asynchronous scan UX absent (pending/clean/rejected/retry) | B, D, E | Gate 3 |
| Operator vendor directory absent | D | Gate 5 |
| Completion-evidence workflow absent | D | Gate 5 |
| Owner directory / ownership interest setup absent | E | Gate 6 |
| Owner approval workflow absent | E | Gate 6 |
| Stripe Connect / test-mode payment not certified | H | Gate 7 |
| Legal package unpublished (consent fails closed) | A | Gate 8 |
| Restore drill not performed | — (admission gate) | Gate 9 |
| No named operational owner / no error visibility | — (admission gate) | Gate 9 |
| Unresolved Critical/High security defect | — (admission gate) | Gate 9 |
| Support + privacy request not investigable without SQL | J | Gate 9 |

**Reading the map.** A blocker touching many journeys is not automatically the most urgent one; a
blocker on the *admission* gates (9) can hold the pilot even though it blocks no single journey.
Use this to sequence work, not to declare progress.
