# P0 Screen and State Specifications v4.1

**Status:** Binding screen-level UX contract. Reference images establish visual direction; this file defines route, role, data, behavior, states, and responsive transformation.

## 1. Shared design behavior

- Font: Inter; Noto Sans fallback; JetBrains Mono for identifiers and financial/reference figures.
- Light-first. Indigo is primary action; teal/green is positive/supportive; amber is pending; red is destructive/failed/overdue.
- Operator uses desktop sidebar and responsive drawer. Resident uses mobile bottom navigation and compact web sidebar at larger breakpoints. Owner uses read-heavy sidebar.
- Dense financial tables support comfortable/compact row density.
- Charts never replace exact values or tables.
- All amounts show currency code when portfolio context can include multiple books.
- Every status includes text/icon, never color alone.
- Destructive, financial, and permission actions use explicit confirmation and reason capture where required.
- Unsupported legal automation is never shown as disabled “coming soon” inside an active workflow; operators upload their own documents.

## 2. Universal states

Every P0 route must implement:

| State | Required presentation |
|---|---|
| Loading | Skeleton matching final layout; no fake zero values |
| Empty | Explain why empty and one primary next action |
| Error | Human message, request ID, retry, safe support path |
| Offline/degraded | Preserve read cache/drafts where safe; no false payment success |
| Permission denied | Explain scope, do not reveal object existence/details |
| Plan unavailable | Explain required plan and preserve user work |
| Verification required | Payment setup requirements and link to Stripe-hosted flow |
| Pending | Explicit asynchronous status and expected next update |
| Success | Confirm result and show audit/reference link |
| Conflict | Show current version/state and safe refresh/retry |

## 3. Operator P0 screens

### O-01 Sign up and organization setup

- **Route:** `/signup`, `/onboarding/organization`
- **Role:** new operator
- **Purpose:** create organization and Growth trial.
- **Fields:** display name, customer path, headquarters country, locale, time zone, terms/privacy acknowledgement.
- **Primary action:** Create Crecy workspace.
- **States:** slug conflict, invalid locale/time zone, existing invitation, accepted terms version.
- **Responsive:** single column mobile; two-column explanation/form desktop.

### O-02 Operating entity and accounting book

- **Route:** `/onboarding/entity`
- **Role:** org owner/admin
- **Data:** legal/display name, country, entity type, currency, book name.
- **Behavior:** explain that each book has one currency; show examples for USD/CAD/MXN.
- **Primary action:** Create entity and book.
- **Restricted:** country/currency mismatch blocks submit.

### O-03 Payment connection setup

- **Route:** `/settings/payments`
- **Role:** org owner/admin with MFA
- **Data:** entity, country, provider connection status, charges/payouts capability, requirements due.
- **Actions:** Connect Stripe, Continue verification, Open Stripe Dashboard, Disable checkout.
- **States:** not connected, onboarding incomplete, requirements due, enabled, restricted, provider outage.
- **Copy:** “Rent is processed on your connected merchant account. Crecy does not hold your rent.”

### O-04 Operator command center

- **Route:** `/app`
- **Role:** operator member
- **Reference:** `design-references/03_operator_command_center.png`
- **Data:** rent collected, overdue balances, occupancy, open work orders, expiring leases, owner approvals, property performance, attention queue, reconciliation exceptions, activity.
- **Primary behavior:** attention-first; each KPI links to filtered workspace.
- **Filters:** book/currency, property, date.
- **Do not show:** fabricated growth percentages when no comparison data.

### O-05 Properties list

- **Route:** `/app/properties`
- **Role:** property read/manage
- **Data columns:** property, country/subdivision, book/currency, units, occupancy, overdue, open work orders, status.
- **Actions:** Add property, Import, Archive where allowed.
- **Empty:** Add manually or import portfolio.
- **Mobile:** cards with key status, not squeezed table.

### O-06 Property workspace

- **Route:** `/app/properties/:propertyId`
- **Reference:** `design-references/04_property_leasing_workspace.png`
- **Tabs:** Overview, Units, Residents, Leases, Documents, Activity.
- **Header:** property identity, country/subdivision, book/currency, occupancy, units, active tenancy count, expiring leases, outstanding balance.
- **Actions:** Add unit, Record lease, Invite resident, Upload document, Open Crecy Living portal.
- **Permission:** property scope required.

### O-07 Unit detail

- **Route:** `/app/properties/:propertyId/units/:unitId`
- **Data:** status, current tenancy, lease dates/rent, resident household, charges/payments summary, maintenance, documents, activity.
- **Actions:** Record tenancy, mark offline/active, upload document, create maintenance.
- **Conflict:** active tenancy prevents second activation.

### O-08 Residents list and resident detail

- **Routes:** `/app/residents`, `/app/residents/:personId`
- **List:** resident, property/unit, tenancy status, balance, last payment, maintenance status, invitation state.
- **Detail:** contact, household, tenancy, balance, charges, payments, documents, maintenance, messages, activity.
- **Privacy:** owner/vendor roles never see route.
- **Actions:** Invite/resend, record payment, upload document, close tenancy through workflow.

### O-09 Existing lease and tenancy workflow

- **Route:** `/app/leases/record`
- **Steps:** property/unit → household members → dates/rent/currency/frequency → signed document → opening balance → review → activate.
- **Rules:** operator-supplied disclaimer; one primary contact; no overlapping tenancy; book currency fixed.
- **Draft:** resumable.
- **Errors:** document scan pending, currency mismatch, duplicate active tenancy, missing primary contact.

### O-10 Import center

- **Routes:** `/app/imports`, `/app/imports/:jobId`
- **Steps:** upload → identify type → map columns → validate → review creates/updates/skips/errors → commit → report.
- **Required UI:** row-level errors; download error CSV; validation hash; original source retained; no commit with blocking errors.
- **Entitlement:** Free no bulk import; Starter basic CSV; Growth/Pro full.
- **Commit state:** progress plus safe retry; never duplicate committed rows.

### O-11 Documents

- **Routes:** `/app/documents`, contextual document tabs
- **Data:** title, type, source, property/unit/tenancy/owner, version, effective dates, scan state, acknowledgement/delivery.
- **Actions:** upload, replace with new version, download, share/deliver, archive.
- **Badge:** “Operator supplied — legal sufficiency not verified by Crecy.”
- **No destructive replace:** versions remain accessible to authorized operators.

### O-12 Payments and reconciliation

- **Route:** `/app/payments`
- **Reference:** `design-references/05_payments_reconciliation.png`
- **Summary:** collected, pending, failed, returned, unapplied.
- **Filters:** book/currency, country, property, method, provider status, reconciliation, date.
- **Table:** date, resident, property/unit, method, provider status, amount/currency, allocation, reconciliation.
- **Actions:** view detail, record manual payment, allocate, create correction/reversal, export.
- **Never:** editable balance field or “mark paid” without financial command.

### O-13 Payment detail drawer/page

- **Route:** `/app/payments/:paymentId`
- **Sections:** canonical status, provider account/IDs, resident/tenancy, amount, allocations, provider timeline, settlement/reconciliation, fees, journal link, receipt, audit history.
- **Actions:** retry only by new attempt; refund/correction only if enabled and confirmed; view in Stripe.
- **Pending:** explain delayed bank status; no receipt labeled final until succeeded.

### O-14 Record manual payment

- **Route:** modal/drawer from payments/resident detail
- **Fields:** source, amount/currency, received timestamp, reason, external reference, evidence, allocations.
- **Validation:** allocation total equals amount; evidence threshold; duplicate reference warning.
- **Confirmation:** review journal impact and receipt recipient.
- **Success:** payment reference, receipt, unreconciled status.

### O-15 Maintenance command center

- **Route:** `/app/maintenance`
- **Reference:** `design-references/06_maintenance_command_center.png`
- **Views:** attention list default; optional status board; calendar/schedule.
- **Summary:** open, overdue, response time, jobs today.
- **Statuses:** New, Triaged, Scheduled, In progress, Awaiting approval, Completed, Closed.
- **Filters:** property, category, priority, vendor/contact, status, SLA.
- **Actions:** triage, create work order, assign, schedule, request owner approval, complete.

### O-16 Maintenance/work-order detail

- **Route:** `/app/maintenance/:requestId`, `/app/work-orders/:workOrderId`
- **Data:** resident-visible description, internal notes separated, property/unit, access, photos, timeline, schedule, vendor, costs, approvals.
- **Actions:** add note, upload evidence, assign vendor, transition, request/record approval.
- **Privacy:** internal notes/cost/owner approval hidden from resident.

### O-17 Owners and ownership

- **Routes:** `/app/owners`, `/app/owners/:ownerId`
- **Data:** owner identity, properties, ownership fractions/effective periods, statement status, recorded remittances, approval requests.
- **Actions:** invite owner, link property interest, generate/finalize statement, record external remittance.
- **Rules:** effective ownership validation; no automated payout.

### O-18 Owner statement preparation/finalization

- **Route:** `/app/owner-statements/:draftId`
- **Data:** period, book/currency, income, expenses, fees, net position, source transaction drill-down.
- **Actions:** recalculate, resolve exceptions, finalize snapshot.
- **Finalized:** immutable; correction creates a new corrective statement/version.

### O-19 Organization/team/roles

- **Route:** `/settings/team`
- **Data:** members, role, property scopes, invitation/MFA/status.
- **Actions:** invite, change role/scope, suspend, revoke.
- **Confirmation:** financial/admin elevation requires MFA/step-up and audit reason.

### O-20 Plan and billing

- **Route:** `/settings/billing`
- **Data:** plan, localized price, active units, limits, trial/renewal, invoice history.
- **Actions:** upgrade/downgrade/cancel/export.
- **Source:** `11_PRICING_ENTITLEMENTS_AND_BILLING_SPEC.md`, never mock-image prices.

## 4. Resident P0 screens

### R-01 Community login/activation

- **Route:** `https://{community}.crecyliving.com/login`
- **Data:** community branding, operator contact, terms/privacy/e-sign as applicable.
- **Methods:** invitation activation, magic link, password/passkey as implemented.
- **States:** expired/revoked invitation, wrong email, locked account, no active tenancy.

### R-02 Resident home

- **Route:** `/home`
- **Reference:** `design-references/07_resident_home.png`
- **Priority:** balance/next due → Pay now → pending payment → open maintenance → management request → documents/announcements.
- **Bottom nav:** Home, Payments, Maintenance, Messages, More.
- **Do not include P0:** referral rewards shown in illustrative mock.

### R-03 Pay rent

- **Route:** `/payments/new`
- **Steps:** amount/charges → payment method → disclosures/mandate → provider checkout → return status.
- **Methods:** only provider/operator/country capabilities.
- **Pending:** bank debit/transfer stays pending; no false success.
- **Fees:** show provider/operator fee before confirmation; no Crecy resident surcharge P0.

### R-04 Payment history/detail/receipt

- **Routes:** `/payments`, `/payments/:paymentId`
- **Data:** status, amount/currency, date, allocations, method mask, receipt, returned/refund history.
- **Privacy:** resident sees only own tenancy payments.

### R-05 Maintenance submit

- **Route:** `/maintenance/new`
- **Fields:** category, title, description, photos, access permission, preferred times, contact.
- **Behavior:** emergency instructions are operator-configured; user-requested priority does not become official priority.
- **Offline:** save draft/photo queue; final submit requires server.

### R-06 Maintenance list/detail

- **Routes:** `/maintenance`, `/maintenance/:id`
- **Resident statuses:** Submitted, Reviewed, Scheduled, Being repaired, Waiting for confirmation, Completed.
- **Hidden:** internal notes, costs, owner approvals, vendor private data not intended for resident.
- **Actions:** add information/photo, message, confirm resolution.

### R-07 Documents

- **Route:** `/documents`
- **Data:** lease and operator-shared documents, version/effective date, acknowledgement, download.
- **Badge:** operator-supplied legal document where applicable.

### R-08 Messages/preferences

- **Routes:** `/messages`, `/more/preferences`
- **Data:** transactional conversation, notification choices, locale, accessibility preferences, privacy request link.
- **Marketing:** separate consent, off by default without lawful basis.
- **Persistence:** `profiles` plus user-bound `notification_preferences`; delivery diagnostics expose status and timestamps but never recipient addresses, provider identifiers, or payloads.

## 5. Owner P0 screens

### OW-01 Owner activation/login

- **Route:** `owner.crecyos.com/login`
- **Scope:** invitation tied to owner entity; no generic organization access.

### OW-02 Owner overview

- **Route:** `/owner`
- **Reference:** `design-references/08_owner_dashboard.png`
- **Data:** owned properties, occupancy, period income/expense/net, recent finalized statements, recorded distributions, approval requests.
- **Privacy:** no resident payment rows, personal contact details, screening, or internal staff notes.

### OW-03 Property performance

- **Route:** `/owner/properties/:propertyId`
- **Data:** occupancy, aggregate income/expense, maintenance summary/evidence approved for owner, documents.
- **Scope:** active ownership period only.

### OW-04 Statement detail

- **Route:** `/owner/statements/:snapshotId`
- **Data:** immutable statement values and authorized drill-down, downloadable PDF/CSV.
- **No edit:** disputes/messages route back to operator.

### OW-05 Approval request

- **Route:** `/owner/approvals/:id`
- **Data:** scope, estimate, evidence, reason, property, deadline.
- **Actions:** Approve/Reject with comment; step-up for configured threshold.

## 6. Platform support P0 screens

### A-01 Organization support lookup

- **Route:** `/admin/organizations`
- **Role:** platform support/admin
- **Data:** subscription, connection health, import/job/webhook errors, user invitations, correlation search.
- **Restrictions:** sensitive fields masked; no automatic resident document access.

### A-02 Incident/payment trace

- **Route:** `/admin/traces/:correlationId`
- **Data:** request, command, journal, outbox, provider webhook, notification chronology.
- **Actions:** replay safe failed job; never edit financial truth directly.

## 7. Responsive breakpoints

```text
mobile: < 640px
tablet: 640–1023px
desktop: 1024–1439px
wide: >= 1440px
```

- Operator tables become prioritized cards or horizontal-scroll tables on mobile; critical actions remain reachable.
- Resident is designed mobile first; desktop uses max-width content with sidebar.
- Owner charts collapse below KPI cards; tables remain readable.
- Side drawers become full-screen sheets on mobile.

## 8. Reference-image corrections

- Pricing image values are illustrative; use file 11.
- Marketing image trust logos, traction, metrics, SOC 2, and “enterprise-grade” claims are not approved.
- Resident referral reward is not P0.
- Vendor quote recipient is operator/authorized owner, never resident by default.
- Four total product surfaces exist; P0 actively ships three by default.
- Data in images is fictional and must not appear as actual customer data/testimonials.

## 9. UX acceptance tests

For each P0 journey test:

- keyboard-only completion;
- screen reader labels and focus order;
- 200% text zoom;
- English and Spanish content expansion;
- French structural readiness;
- permission-restricted actor;
- empty/loading/error/offline/pending/success/conflict;
- mobile 390px and desktop 1440px;
- no misleading payment or legal state;
- correct audit/reference after command.


## v4.1 screen persistence contracts

- Resident/operator messages use `conversations`, `conversation_participants`, and `messages`; send action calls `SendConversationMessage`.
- Announcements use `announcements` and `announcement_deliveries`; publish action calls `PublishAnnouncement`.
- Plan and billing uses `localized_price_books`, `plan_prices`, `organization_subscriptions`, `usage_records`, `billing_invoices`, and `billing_invoice_lines`; changes call `ChangeSubscription`.
- Document share/deliver/acknowledge uses `document_deliveries` and `document_acknowledgements`; upload states come from `private.upload_grants` and `document_versions.upload_status`.
- Owner approvals use `owner_approval_requests` and append-only `owner_approval_decisions`; no decision is stored only as a mutable field on a work order.
- Privacy request screens use `privacy_requests`; export/deletion work is represented by private jobs and visible status.
- Relationship users never receive raw operator tables when a sanitized projection is specified. Owner lease/maintenance and vendor assignment pages use the v4.1 reporting projections.
