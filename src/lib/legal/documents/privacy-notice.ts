import type { LegalDocument } from "@/lib/legal/types";

/**
 * DRAFT PLACEHOLDER — not legal advice and not approved for production. See operator-terms.ts.
 */
export const privacyNotice: LegalDocument = {
  code: "privacy_notice",
  title: "Crecy Privacy Notice",
  audience: "public",
  locale: "en-US",
  jurisdictions: ["*"],
  version: "0.1.0-draft",
  effectiveDate: "2026-08-28",
  state: "draft",
  route: "/legal/privacy-notice",
  body: `# Crecy Privacy Notice

**Status: DRAFT — pending legal review. Not binding until published.**

## 1. Two different roles

Crecy handles personal data in two distinct roles, and which one applies changes your rights and who to
contact.

- **As a processor**, for the operational records an operator enters about their residents, owners and
  vendors. The operator decides what is collected and why; we act on their instructions.
- **As a controller**, for the accounts of the people who sign in to Crecy, for security and audit logs,
  and for the information we need to run and bill the service.

## 2. What we collect

Account information (name, email, authentication factors). Operational records an operator enters
(people, households, tenancies, payments, maintenance, documents). Security and audit records of actions
taken in the product. Technical records needed to deliver the service.

We do not sell personal data, and we do not use the operational records in a workspace to advertise to
anyone.

## 3. Why we hold it

To provide the product, to keep financial and audit history accurate and tamper-evident, to secure
accounts, to send transactional messages about your tenancy, payments, maintenance and documents, and to
meet legal obligations.

Transactional messages about access and security — invitations in particular — cannot be turned off,
because losing one would lock a person out of their own records. Category notifications can.

## 4. Who else sees it

Only the people in your organization whose role and property scope permit it, and the resident, owner or
vendor the record is about. We use service providers to host the product, deliver messages, scan
uploaded files and process payments; each is bound to handle data only as instructed.

## 5. How long we keep it

Financial and audit history is retained as long as the law requires it and cannot be edited after it is
posted. Other records are kept while the workspace is active and for a limited period afterwards.

## 6. Your rights

Depending on where you live, you may request access to your data, correction, deletion, export,
restriction, or to object to or withdraw consent for a particular use. Crecy provides a request centre
in the product for this. Where the data belongs to an operator's workspace we will route your request to
that operator and support them in answering it.

## 7. Contact

Privacy questions: privacy@crecy.example.
`,
};
