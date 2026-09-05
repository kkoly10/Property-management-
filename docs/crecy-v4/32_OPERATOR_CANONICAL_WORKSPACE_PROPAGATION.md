# Crecy OS Canonical Workspaces — Propagation Review

**Review date:** 2026-09-05  
**Scope:** property detail, payments, maintenance queue, maintenance detail, and maintenance action controls  
**Authority:** files 29–31 plus current executable data/command contracts

## Verdict

The first Operator propagation batch now extends the command-center visual grammar into four high-value workspaces without mechanically restyling every route.

The batch deliberately keeps each domain structurally different:

- property detail behaves like an object workspace;
- payments behaves like a finance/reconciliation desk;
- maintenance list behaves like an intake/triage operation;
- maintenance detail behaves like a work-order control record.

This is a stronger result than applying the same header + KPI cards + generic panels to every route.

## 1. Property detail

### Implemented
- property identity and address lead the page;
- connected operational strip for units, occupancy, book currency, and status;
- property foundation rendered as factual definition rows rather than mini cards;
- units rendered as an operational table;
- residents/leases rendered as relationship rows;
- unit creation stays in a dedicated sticky action workspace;
- existing property, unit, occupancy, lease, accounting-book, and plan-control data remains authoritative.

### Genericness check
The page no longer imports or renders the generic Card primitive. Removing purple and the Crecy logo still leaves a recognizable property object workspace.

## 2. Payments

### Implemented
- removed the six-card summary wall;
- connected summary strip separates outstanding exposure, collected receipts, review-needed payments, and reconciliation exceptions;
- recent payments are a dense financial register;
- provider settlements retain gross/fee/net accounting detail;
- reconciliation exceptions remain an explicit operator queue with evidence-backed resolution controls;
- resident balances and bad-debt write-off controls remain connected to the existing accounting commands.

### Financial safety
No currencies are silently combined. Outstanding values remain currency-separated. Existing receipt immutability, settlement reconciliation, and write-off command behavior is unchanged.

## 3. Maintenance queue

### Implemented
- connected open/triage/overdue/assigned summary;
- intake and triage use the Crecy Operator attention rail;
- active work has a separate in-motion lane;
- the full request register preserves requested urgency separately from official operator priority;
- vendor/work-order state remains visible without turning every request into a card.

### Genericness check
The page reads as an operating queue, not a dashboard of maintenance cards.

## 4. Maintenance detail

### Implemented
- request status, official priority, work-order state, and cost/approval context share one operational strip;
- resident report remains distinct from operator decisions;
- work-order data is presented as a record with scope, schedule, cost, completion, and cancellation history;
- owner approvals remain isolated to exact owner entities;
- triage/vendor assignment, status transitions, evidence scanning, completion, cancellation, and ledger cost posting remain the real interactive controls;
- the interactive maintenance forms now use Crecy workspace panels instead of generic Card wrappers.

### Safety preserved
The redesign does not bypass:
- work-order version checks;
- idempotency keys;
- evidence quarantine/scanning rules;
- owner-approval gates;
- cost-posting commands;
- cancellation reasons.

## 5. Source-level adversarial gate

A design regression test now checks that these propagated surfaces:
- do not import or render the generic Card primitive;
- retain their authoritative read models;
- retain their existing mutation endpoints;
- avoid the old six-card payment summary;
- avoid the former uppercase tracking-label motif;
- preserve domain-specific structure rather than one repeated page template.

## 6. What remains

This batch does **not** certify all Operator routes.

Still requiring deliberate propagation include:
- property list;
- residents;
- leases and lease recording;
- payment detail and payment recording;
- owners and owner statements;
- vendors;
- messages and announcements;
- documents;
- imports;
- settings/team surfaces.

Those should inherit the relevant canonical workspace pattern rather than receive a mechanical global restyle.

## 7. Visual certification status

Source-level and build-level review can reject obvious template regressions, but final visual certification still requires deployed screenshot review at the approved responsive widths and text zoom.

The next product-family propagation step after this Operator batch is the Crecy Living route family, unless a screenshot review exposes a blocking Operator layout issue.
