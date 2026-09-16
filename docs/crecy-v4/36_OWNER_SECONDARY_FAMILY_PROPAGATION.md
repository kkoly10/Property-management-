# Crecy Owner Secondary-Family Propagation

**Review date:** 2026-09-15
**Scope:** statement detail, approval detail, documents, messages, conversation detail, preferences
**Authority:** files 29–35 plus current executable owner, document, messaging, and notification contracts

## Verdict

The secondary Owner routes now inherit the canonical Owner shell and financial/reporting grammar without becoming one repeated dashboard template.

The family has six deliberately different jobs:

- statement detail is a finalized financial record;
- approval detail is a decision dossier;
- documents are an ownership document register;
- messages are a correspondence register;
- conversation detail is a chronological correspondence record;
- preferences are a user-bound control and delivery-diagnostics record.

No page in this batch renders the generic `Card` component on the Owner path. Cards remain available to unrelated legacy/default presentations and are not used as the Owner composition.

## 1. Statement detail

`/owner/statements/:statementId` now provides:

- one continuous financial band with a dominant net owner position;
- a mobile owner-allocation list and desktop account ledger table;
- a dedicated immutable-record region with full integrity hash, version, journal-entry count, transaction count, and finalization time;
- a continuous remittance register;
- CSV export and print/PDF controls;
- print-specific removal of application chrome.

Preserved contract:

- `get_owner_statement_detail` remains the only read model;
- the CSV endpoint serializes that same owner-scoped DTO;
- resident-level and payment-level detail remains excluded;
- no currencies are aggregated or converted.

## 2. Approval detail

`/owner/approvals/:approvalId` now behaves as one decision dossier:

- exact owner/property/unit relationship leads the record;
- requested scope is separated from the financial exposure;
- evidence count and work-order state are factual dossier fields;
- request and decision events form a chronology;
- the exact decision control sits in a distinct decision region.

Preserved contract:

- the page still reads the relationship-scoped owner approval workspace;
- approval/rejection still posts to `respond_to_owner_approval` through the existing HTTP route;
- optimistic version, idempotency, one-decision, scope, and MFA step-up behavior is unchanged;
- no evidence files, internal notes, vendor details, or resident data were invented or exposed.

## 3. Ownership documents

`/owner/documents` is now a continuous register with separate columns/rows for document identity, delivery evidence, record state, and actions.

Preserved contract:

- the read remains the recipient-visible `document_deliveries` projection;
- downloads still require the latest `clean` scan state;
- receipt acknowledgement remains exact-recipient, evidence-hash, legal-version, and idempotency controlled;
- signing and certificate routes remain separate ceremonies.

## 4. Owner correspondence

`/owner/messages` uses a relationship/property/latest-correspondence register. `/owner/messages/:conversationId` renders messages as a chronological ownership record rather than consumer chat bubbles.

Preserved contract:

- relationship users still read `get_relationship_conversation_workspace`;
- detail still reads `get_conversation_detail`;
- sends still use `send_conversation_message` with participant authorization and an idempotency key;
- no unread counts, new participants, or unsupported owner identities were added.

## 5. Preferences

`/owner/preferences` now uses one continuous report-like control surface. Transactional channels, accessibility, marketing-consent status, and delivery diagnostics are separate sections connected by shared dividers rather than four independent settings cards.

Preserved contract:

- the record remains user-bound rather than owner-entity- or organization-bound;
- the same preference record continues to serve Owner, Living, and Operator entry points;
- version checks, idempotency, verified-phone requirements, and provider-availability language are unchanged;
- diagnostics remain sanitized and never reveal addresses, provider identifiers, or payloads;
- marketing consent remains separate and off on this screen.

## 6. Responsive and accessibility behavior

- mobile statement rows replace the wide ledger table rather than hiding financial detail;
- document and correspondence registers stack into labeled record rows at narrow widths;
- the approval dossier places the decision region after the evidence/scope record on mobile and beside it on desktop;
- the preferences matrix keeps its existing mobile fieldset alternative so all channel controls remain reachable;
- semantic headings, tables, fieldsets, labels, `aria-live`, focus rings, and real button/link behavior remain present;
- print output removes navigation and retains statement identity.

## 7. Adversarial review

The family passes the source/rendered-markup genericness gate:

- no Owner route imports the generic `Card` component;
- local server-rendered Owner routes contain zero `data-slot="card"` instances;
- the former duplicate white headers and `#f6f8fb` page canvases are removed;
- the statement no longer has five equal KPI cards;
- the approval no longer has two generic summary cards or uppercase scope/amount labels;
- documents no longer render one card per delivery;
- Owner messages no longer use the default card list or chat-bubble thread;
- Owner preferences no longer render four independent card panels;
- pills remain limited to real statuses.

In grayscale and without the wordmark, the product remains identifiable through financial hierarchy, record integrity, remittance/account ledgers, decision chronology, and restrained ownership registers.

## 8. Validation and remaining boundary

Local validation at the review state:

- ESLint: zero errors; five pre-existing warnings in Operator routes;
- TypeScript: pass;
- Vitest: 68 files, 460 tests pass;
- executable schema validation: pass;
- scheduler configuration check: pass;
- migration ordering check: pass;
- local Next.js production build: pass;
- all seven Owner URLs, including the `/owner` anchor, return HTTP 200 in local preview mode.

Browser screenshot certification is not claimed. The cloud browser cannot access the local loopback server and the local Playwright browser binary was unavailable. Final visual certification still requires the approved 390 px, tablet, 1024 px, 1440 px, and 200% text-zoom screenshot pass before production deployment.

A single local commit was prepared for the batch. No remote branch, pull request, push, merge, Vercel build, or deployment was created.
