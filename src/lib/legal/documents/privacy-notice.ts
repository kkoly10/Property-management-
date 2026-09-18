import type { LegalDocument } from "@/lib/legal/types";

/**
 * PILOT RELEASE — published for the Crecy controlled pilot on founder approval.
 *
 * This is version 1.0.1, effective 2026-09-18. It corrects 1.0.0 (2026-09-04) in three respects, all of
 * them statements of fact rather than commitments:
 *
 *   * the contact address, which was the placeholder `privacy@crecy.example` and is now the real
 *     `privacy@crecyos.com`;
 *   * section 4 listed "scan uploaded files" among the things service providers do. Malware scanning is
 *     deliberately not active for the controlled pilot, so the notice was describing an inspection that
 *     does not happen. The claim is removed rather than reversed: the notice now simply does not say
 *     anything about scanning, because promising that files are NOT inspected would be a new statement
 *     rather than the withdrawal of an inaccurate one.
 *   * section 4 also named the "vendor" among the people who can see a record. There is no vendor
 *     portal in the launch product, so a vendor cannot see anything. Section 1 still names vendors,
 *     correctly: an operator does enter records ABOUT vendors, which is a different claim from a vendor
 *     having access.
 *
 * Nothing was added and no commitment changed. Removing a claim about a capability that is not active
 * is not a removal of functionality.
 *
 * A new version is a new artifact, never an edit of a published one. 1.0.0 was NOT rewritten in place —
 * it is preserved verbatim at `@/lib/legal/documents/archive/privacy-notice-1.0.0.ts` so that a
 * consent record naming it can still be checked against the bytes that were actually accepted. A later
 * revision must bump the version again and archive this one the same way.
 *
 * The `**Effective … · Version …**` line inside the body must agree with the metadata above it; a test
 * asserts it, because a body that states a different version than the artifact it lives in would put
 * one version in the page badge and another in the text a person actually reads.
 */
export const privacyNotice: LegalDocument = {
  code: "privacy_notice",
  title: "Crecy Privacy Notice",
  audience: "public",
  locale: "en-US",
  jurisdictions: ["*"],
  version: "1.0.1",
  effectiveDate: "2026-09-18",
  state: "published",
  route: "/legal/privacy-notice",
  body: `# Crecy Privacy Notice

**Effective 2026-09-18 · Version 1.0.1 · Published for the Crecy controlled pilot.**

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

Only the people in your organization whose role and property scope permit it, and the resident or owner
the record is about. We use service providers to host the product, deliver messages and process
payments; each is bound to handle data only as instructed.

## 5. How long we keep it

Financial and audit history is retained as long as the law requires it and cannot be edited after it is
posted. Other records are kept while the workspace is active and for a limited period afterwards.

## 6. Your rights

Depending on where you live, you may request access to your data, correction, deletion, export,
restriction, or to object to or withdraw consent for a particular use. Crecy provides a request centre
in the product for this. Where the data belongs to an operator's workspace we will route your request to
that operator and support them in answering it.

## 7. Contact

Privacy questions: privacy@crecyos.com.
`,
};
