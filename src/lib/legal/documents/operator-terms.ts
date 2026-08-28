import type { LegalDocument } from "@/lib/legal/types";

/**
 * DRAFT PLACEHOLDER — not legal advice and not approved for production.
 *
 * A coding agent may draft this and build the publishing mechanism; moving `state` to "published" is a
 * professional gate that belongs to a human, per the founder register and file 27 §5.A4. While it is a
 * draft, production organization creation FAILS CLOSED rather than recording consent against it.
 */
export const operatorTerms: LegalDocument = {
  code: "operator_terms",
  title: "Crecy Operator Terms of Service",
  audience: "operator",
  locale: "en-US",
  jurisdictions: ["*"],
  version: "0.1.0-draft",
  effectiveDate: "2026-08-28",
  state: "draft",
  route: "/legal/operator-terms",
  body: `# Crecy Operator Terms of Service

**Status: DRAFT — pending legal review. Not binding until published.**

## 1. Who these terms are between

These terms are between Crecy ("we", "us") and the organization that creates a Crecy workspace ("you",
"the operator"). The person who creates the workspace confirms they are authorized to accept these terms
on the organization's behalf.

## 2. What Crecy provides

Crecy is a rental operating system. We provide the software that records your properties, leases,
residents, owners, maintenance work and financial ledger, and that presents portals to the residents,
owners and vendors you invite.

We are a software provider. We are not your agent, not a party to your leases, not a property manager,
not a broker, not a lender, and not an escrow agent. Nothing in the product is legal, tax, accounting or
compliance advice.

## 3. Your data and your tenants' data

You remain the controller of the operational records you enter and of the personal data of the people
you invite. We process that data to provide the service and on your instructions. Each organization's
data is isolated from every other organization's.

You are responsible for having a lawful basis to enter a person's data, for the accuracy of what you
enter, and for honoring the rights of the people whose data you hold.

## 4. Money, ledgers and payments

Crecy records double-entry financial history. Posted financial records are append-only: corrections are
made by posting reversing entries, never by editing history. You are responsible for the accuracy of
what you post and for your own accounting, tax and regulatory obligations.

Where you connect a payment provider, that provider's own agreement governs the movement of funds
between you and your residents. We record and reconcile those movements; we do not hold your funds.

## 5. Acceptable use

Do not use Crecy to break the law, to discriminate unlawfully in housing, to send communications the
recipient has not agreed to receive, to upload malicious files, or to attempt to reach another
organization's data.

## 6. Availability, changes and termination

We may change the service and these terms. A material change to these terms is published as a new
version with its own effective date, and you will be asked to accept it. You may stop using Crecy at any
time; we may suspend an account that is being used in breach of section 5.

## 7. Warranties and liability

The service is provided as-is to the fullest extent the law allows. Nothing here limits liability that
cannot lawfully be limited.

## 8. Contact

Questions about these terms: legal@crecy.example.
`,
};
