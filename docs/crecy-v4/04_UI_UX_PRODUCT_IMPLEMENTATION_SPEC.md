# UI/UX Product Implementation Specification

**Purpose:** Define how the architecture becomes a coherent, safe, accessible product. This is an implementation specification, not a mood board.

---

## 1. Experience model

The platform is one brand with four role-specific products:

```text
Operator OS      — high-density operations and decisions
Resident App     — mobile-first obligations, payments, help, documents
Owner Portal     — transparency, statements, evidence, approvals
Vendor Workspace — assigned jobs, schedule, quote, evidence, completion
```

Shared identity, statuses, documents, and notifications do not mean shared navigation or identical pages.

## 2. Product principles

1. Home screens show actionable exceptions before analytics.
2. Every workflow answers: current state, responsible party, next action, deadline, and blocker.
3. Financial amounts always expose the underlying trail.
4. Destructive, legal, permission, and financial actions require explicit review.
5. Role-specific data is minimized; users do not see unavailable menu items that they can never use.
6. Mobile workflows are camera- and interruption-aware.
7. Empty states teach the next meaningful action.
8. Error states preserve entered data and explain recovery.
9. Status is expressed through text and icon, never color alone.
10. Resident language avoids accounting jargon; operator financial screens may use precise accounting terminology with explanations.

---

## 3. Design-system baseline

The baseline is final enough to implement and may later be rebranded through tokens.

### 3.1 Typography

- Product font: `Geist Sans`, fallback `Inter`, system sans-serif
- Monospace: `Geist Mono` for references and diagnostics only
- Base operator text: 14–16 px
- Base resident text: 16 px minimum
- Tabular numerals for financial amounts

Type scale:

| Token | Size/line | Use |
|---|---|---|
| `display-lg` | 40/48 | public marketing only |
| `heading-xl` | 30/38 | product section title |
| `heading-lg` | 24/32 | page title |
| `heading-md` | 20/28 | panel title |
| `body-lg` | 18/28 | resident primary copy |
| `body-md` | 16/24 | default body |
| `body-sm` | 14/20 | dense operator tables |
| `label-sm` | 12/16 | metadata, never essential instructions alone |

### 3.2 Color tokens

Reference light theme:

```text
canvas                 #F6F7F9
panel                  #FFFFFF
panel_subtle           #F0F3F6
text_primary           #111827
text_secondary         #4B5563
text_muted             #6B7280
border                 #D8DEE6
brand_primary          #2457D6
brand_primary_hover    #1E46AF
brand_on_primary       #FFFFFF
focus_ring             #3B82F6
success                #15803D
warning                #B45309
danger                 #B42318
info                    #1D4ED8
finance_positive       #166534
finance_negative       #B42318
```

Dark mode is not a launch requirement unless selected by founder. Tokens must permit later support.

Contrast must meet WCAG 2.2 AA. Status colors require labels/icons.

### 3.3 Spacing and layout

- Base spacing unit: 4 px
- Common gaps: 8, 12, 16, 24, 32, 48
- Operator max content width: 1600 px
- Resident max content width: 720 px
- Desktop grid: 12 columns
- Tablet: 8 columns
- Mobile: 4 columns

Breakpoints:

```text
sm  640
md  768
lg  1024
xl  1280
2xl 1536
```

### 3.4 Radius and elevation

- Inputs/buttons: 8 px
- Panels/cards: 12 px
- Modals/drawers: 16 px
- Elevation is subtle and reserved for overlays; borders define most panels

### 3.5 Motion

- 120–180 ms for hover and small state changes
- 180–240 ms for drawers/modals
- Respect reduced-motion preference
- Never animate financial values in a way that obscures change

---

## 4. Application shells

## 4.1 Operator shell

Desktop:

```text
┌─────────────┬─────────────────────────────────────────────────────┐
│ Sidebar     │ Top bar: org switcher | search | create | alerts  │
│             ├─────────────────────────────────────────────────────┤
│ Navigation  │ Breadcrumb / page title / page actions             │
│             ├─────────────────────────────────────────────────────┤
│             │ Main content                                       │
└─────────────┴─────────────────────────────────────────────────────┘
```

- Sidebar width: 248 px expanded, 72 px collapsed
- Sidebar collapse state persists per user/device
- Organization switcher always displays current organization and environment indicator outside production
- Global search shortcut: `/` or `Cmd/Ctrl+K`
- “Create” menu contains only actions the user can perform

Tablet/mobile operator shell:

- Sidebar becomes drawer
- Tables convert to prioritized cards only where information remains understandable
- Accounting/reconciliation may remain desktop-required, with clear message rather than broken mobile UI

## 4.2 Resident shell

Mobile bottom navigation:

```text
Home | Payments | Maintenance | Messages | More
```

- Primary due/pay action may be sticky when a balance is due
- Critical notices appear before promotional or informational content
- Resident never selects organization unless they belong to multiple operator environments; tenancy switcher appears in More

## 4.3 Owner shell

Desktop/tablet primary navigation:

```text
Overview | Properties | Statements | Activity | Documents | Settings
```

Mobile uses bottom navigation or compact tabs depending on number of accessible properties.

## 4.4 Vendor shell

```text
Jobs | Schedule | Messages | Profile
```

No portfolio, owner, resident, or accounting navigation.

---

## 5. Operator information architecture

Primary navigation:

1. Home
2. Portfolio
3. Residents
4. Leasing
5. Money
6. Maintenance
7. Owners
8. Reports
9. Communications
10. Documents
11. Settings

Navigation items may be hidden by entitlement or permission. Hidden permission does not replace server authorization.

## 6. Operator home screen

### 6.1 Purpose

Show what needs attention now, operational health, and the next meaningful actions.

### 6.2 Layout

```text
Page title + date range + property scope

[Collected this month] [Outstanding] [Occupancy] [Open maintenance]

Needs your attention
- Failed/unmatched payments
- Leases awaiting signature
- Overdue resident balances
- Urgent maintenance/SLA risk
- Owner approvals
- Import or integration failures

Portfolio pulse                  Upcoming
- occupancy by property          - due/renewal dates
- collection trend               - inspections
- maintenance trend              - scheduled work

Recent activity
```

### 6.3 Rules

- Attention items sort by severity, deadline, financial/legal impact, and age
- Each item has owner, reason, due time, and direct resolution action
- Summary metrics include data cutoff and scope
- No chart without an operator decision it supports

---

## 7. Core operator screen contracts

## 7.1 Portfolio list

Required columns:

- property
- location
- units
- occupied/vacant/offline
- collection status
- open maintenance
- owner(s)
- assigned manager

Features:

- saved filters
- bulk assignment/export where authorized
- table density preference
- keyboard navigation
- global and scoped search

## 7.2 Property detail

Tabs:

```text
Overview | Units | Residents | Leasing | Money | Maintenance | Inspections | Owners | Documents | Activity
```

Header contains property name, status, address, assigned manager, occupancy summary, and primary action.

Every tab inherits property scope and avoids duplicate filters.

## 7.3 Unit detail

Header:

- unit code
- property/building
- operational status
- occupancy status
- current tenancy
- next availability

Sections:

- current residents
- lease and charges
- open maintenance
- inspections
- documents
- listing draft
- history

## 7.4 Resident detail

Tabs:

```text
Overview | Household | Tenancy | Money | Maintenance | Documents | Messages | Activity
```

Sensitive data is masked by default. Identity documents require permission and logged reveal.

## 7.5 Leasing pipeline

Kanban is optional; table view is mandatory for accessibility and scale.

Stages:

```text
Inquiry → Application → Review → Approved → Lease draft → Signatures → Move-in
```

Each card/row shows unit, household, age in stage, blocker, owner, and next action.

## 7.6 Lease creation wizard

Steps:

1. Unit and household
2. Parties and responsibilities
3. Dates and possession
4. Rent schedule
5. Deposits, fees, services
6. Jurisdiction-specific clauses/options
7. Review structured terms
8. Generate document preview
9. Signature routing

Safety rules:

- Autosave draft
- Legal template/version displayed
- Financial schedule preview before generation
- Warnings require explicit acknowledgement
- Executed lease cannot return to edit mode

## 7.7 Money workspace

Subnavigation:

```text
Receivables | Payments | Deposits | Reconciliation | Owner accounting | Periods | Exports
```

### Receivables

- aging summary
- resident/tenancy rows
- due, overdue, unapplied credit
- payment-plan indicator
- next collection action

### Payment detail

Must display:

- amount and currency
- payer/tenancy
- method
- provider/manual source
- status timeline
- allocations
- fees
- settlement status
- refunds/reversals/disputes
- receipt
- audit history

### Reconciliation

Three-pane or equivalent workflow:

```text
Exception queue | Candidate details and matches | Resolution action/history
```

No “mark reconciled” action without selected evidence and permission.

## 7.8 Maintenance command center

Views:

- Attention queue
- All requests
- Work orders
- Schedule
- Vendors
- SLA report

Request detail layout:

```text
Header/status/priority
Issue and evidence
Resident access and contact instructions
Timeline and messages
Work orders/assignments/quotes
Cost and approval
Resident-visible status preview
```

Internal notes are visually and technically separated from resident-visible communication.

## 7.9 Owner statement screen

- period and cutoff
- property-level income/expense summary
- reserve changes
- management fees
- owner payable/remittance
- supporting transaction drill-down
- finalization status
- downloadable immutable document

A draft statement is visibly watermarked. Finalized statement totals cannot be edited.

---

## 8. Resident experience contracts

## 8.1 Resident home

Priority order:

1. Urgent legal/safety notice
2. Amount due and due date
3. Primary payment action
4. Failed/pending payment status
5. Open maintenance status
6. Action required on lease/renewal/move-out
7. Latest management message
8. Documents and household shortcuts

Example composition:

```text
Good morning, Maya

Rent due July 31
$1,250.00
[Pay now] [View details]

Action needed
Your renewal offer expires in 6 days.
[Review offer]

Maintenance
Kitchen sink leak — Scheduled for Tue, 10–12
[View request]

Latest message
Management: Water service inspection Friday...
```

## 8.2 Payment flow

1. Show total due and itemized charges
2. Allow approved custom amount only when policy permits
3. Select method
4. Show fees before confirmation
5. Confirm amount, method, and expected processing
6. Redirect/complete provider action
7. Return to pending state until authoritative confirmation
8. Show receipt only after succeeded state

Never display “Paid” based only on browser redirect.

## 8.3 Maintenance submission

Steps:

1. Category and urgency
2. Plain-language description
3. Photos/video with compression and upload progress
4. Access permission and pets/safety notes
5. Preferred scheduling windows
6. Review and submit

Emergency language must direct residents to appropriate emergency channels and must not imply the app is monitored continuously unless it is.

## 8.4 Resident maintenance status

Resident vocabulary:

```text
Submitted → Management reviewing → Scheduled → Repair in progress → Waiting for your confirmation → Completed
```

Internal vendor, cost, owner-approval, and staff-note details remain hidden unless explicitly intended for the resident.

## 8.5 Documents

- Lease and amendments
- Notices
- Receipts
- Move-in inspection
- Renewal documents
- Move-out statement

Each document displays type, date, status, and source. Signed documents show signature completion and immutable version.

---

## 9. Owner portal contracts

## 9.1 Owner overview

```text
Net owner position | Occupancy | Rent collected | Expenses | Upcoming remittance

Requires approval
- maintenance expense
- reserve contribution
- management decision

Property performance
Statement history
Recent evidence/activity
```

Every total includes reporting period, cutoff, and currency.

## 9.2 Approval flow

- Explain request and consequence in plain language
- Show quote/evidence and management recommendation
- Show property and reserve impact
- Approve/decline/request information
- Require reason for decline
- Record immutable decision timeline

## 9.3 Privacy boundary

Owners may see occupancy and lease-level financial summaries only as allowed by management agreement and jurisdiction. They do not automatically receive resident IDs, screening details, private messages, or sensitive payment credentials.

## 9.4 Payout destination change

- masked current destination
- step-up authentication
- entry and verification of new destination
- notification to authorized operator/accountant
- configured hold period
- secondary approval when enabled
- visible audit timeline

---

## 10. Vendor workspace contracts

## 10.1 Job list

Each job shows:

- scheduled window
- property/unit access label
- issue category and priority
- acceptance status
- quote/evidence requirements
- contact route

## 10.2 Job detail

- scope and allowed resident-visible information
- safe access instructions
- schedule
- messages
- quote submission
- before/after evidence
- parts/cost entry if permitted
- completion checklist

Vendor cannot browse residents or units outside assigned work.

---

## 11. Universal interaction patterns

## 11.1 Object header

Every major object uses:

```text
Title/reference | status | relationship context | primary action | secondary menu
```

## 11.2 Timeline

Used for lease, payment, maintenance, statement, application, and support history. Timeline separates:

- user actions
- system events
- provider events
- communications
- audit-only events

## 11.3 Forms

- Labels always visible
- Required/optional clear before submission
- Inline validation plus submission summary
- Preserve entered values on recoverable errors
- Currency input respects locale but stores minor units
- Dangerous defaults are never preselected

## 11.4 Tables

- Sticky header for long tables
- Sort and filters are keyboard accessible
- Column customization persists per user
- Bulk actions display selected count and scope
- Export is permissioned and audited
- Horizontal scrolling is not the primary mobile strategy

## 11.5 Drawers versus pages

Use drawer for quick read or low-risk edit. Use full page for:

- lease creation/execution
- payment/refund/reversal
- period close/reopen
- owner statement finalization
- permission changes
- imports
- maintenance expense approval above threshold

## 11.6 Confirmation levels

- Ordinary action: immediate with undo where safe
- Significant action: confirmation dialog
- Financial/legal action: review page with explicit acknowledgement
- High-risk action: step-up authentication and optional dual approval

---

## 12. States and recovery

Every screen defines:

- initial loading
- empty
- filtered-empty
- permission denied
- validation error
- provider unavailable
- degraded/read-only
- stale data
- partial success
- offline draft where supported

### Degraded examples

- Payment provider unavailable: allow viewing balance and prior receipts; disable new online payment; explain alternatives
- Messaging provider unavailable: preserve message and show queued state
- Realtime unavailable: fall back to polling and display last-updated time
- Report generation delayed: queue job and notify when ready

---

## 13. Low-bandwidth and offline policy

Supported offline drafts:

- maintenance request text and compressed evidence queue
- inspection checklist and evidence queue
- unsent message draft

Not supported offline:

- payment confirmation
- lease execution
- financial posting
- owner approval
- permission changes

Uploads must be resumable where possible, compress images client-side, and expose progress/retry.

---

## 14. Accessibility requirements

- WCAG 2.2 AA target
- Full keyboard access for operator workflows
- Logical focus order and visible focus ring
- Screen-reader labels for status, icons, and financial values
- Minimum 44×44 touch target for resident/vendor mobile actions
- Error summary with links to invalid fields
- No color-only meaning
- Reduced-motion support
- Text zoom to 200% without loss of core functionality
- Tables provide headers and accessible alternatives where cards are used
- Automated accessibility checks plus manual keyboard/screen-reader review on critical journeys

---

## 15. Localization requirements

- No concatenated translated sentences
- Layout supports 30% text expansion
- Currency, date, number, phone, and address formatting are locale-aware
- Legal terms derive from jurisdiction package
- Right-to-left readiness is maintained in component architecture, but RTL launch support is a separate acceptance item
- Translation keys are semantic, not copied English strings

---

## 16. Component inventory

### Primitives

Button, IconButton, Link, Input, Textarea, Select, Combobox, Checkbox, Radio, Switch, DatePicker, CurrencyInput, FileUpload, Badge, Tooltip, Dialog, Drawer, Popover, Toast, Tabs, Table, Pagination, Skeleton.

### Product patterns

- AttentionQueue
- MetricCard
- ObjectHeader
- StatusTimeline
- ActivityFeed
- MoneyBreakdown
- ApprovalPanel
- AuditHistory
- DocumentCard
- EvidenceGallery
- EmptyState
- FilterBar
- BulkActionBar
- ReconciliationMatcher
- PermissionBoundary
- OfflineQueueStatus

### Domain components

- LeaseStatus
- TenancySummary
- ChargeBreakdown
- PaymentAllocationTable
- SettlementStatus
- MaintenancePriority
- WorkOrderSchedule
- InspectionComparison
- OwnerStatementSummary
- EntitlementGate

Components are documented in Storybook or equivalent with default, loading, empty, error, disabled, permission-denied, and long-localized-content examples.

---

## 17. Screen inventory and launch priority

### P0 operator screens

- Authentication/MFA
- Organization onboarding
- Home
- Portfolio list
- Property detail
- Unit detail
- Resident directory/detail
- Leasing pipeline
- Lease wizard/detail
- Receivables
- Payment detail/manual payment
- Reconciliation
- Maintenance center/request/work order
- Inspection detail
- Owner directory/detail
- Owner statement draft/final
- Documents
- Staff/roles
- Imports
- Platform support diagnostics

### P0 resident screens

- Activation
- Home
- Charge detail
- Payment method/confirmation/result
- Receipts
- Maintenance create/detail
- Messages
- Documents
- Renewal/move-out action
- Profile/preferences

### P0 owner screens

- Activation
- Overview
- Property detail
- Statement list/detail
- Approval detail
- Documents
- Remittance history
- Security/settings

### P0 vendor screens

- Activation
- Jobs
- Job detail
- Quote
- Schedule
- Evidence/completion
- Messages
- Profile/documents

P1 screens include advanced reports, saved views, custom domains, broader automation, and deeper integrations.

---

## 18. UX acceptance gates

A workflow is not complete until:

1. Happy path works end to end.
2. Permission restrictions are visible and server-enforced.
3. Empty, loading, validation, provider-failure, and retry states exist.
4. Mobile/responsive behavior is verified for its intended audience.
5. Keyboard and screen-reader behavior is reviewed.
6. Financial/legal actions display consequences and audit context.
7. User-facing status matches backend state machine.
8. Analytics events capture funnel, failure, and recovery.
9. Copy is reviewed for role vocabulary and jurisdiction placeholders.
10. Screenshot or recorded evidence is attached to the phase completion report.

## 19. Research and validation gate

Before broad launch, test representative prototypes or working flows with:

- at least five operators in the launch segment
- at least five residents with varying digital familiarity
- at least three property owners when owner portal is launch-critical
- at least three maintenance coordinators/vendors for field workflows

Measure task completion, confusion points, time to complete, critical errors, and support questions. Findings must update the design decision log; user testing is not a ceremonial approval step.
