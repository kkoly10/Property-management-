import type { LegalDocument } from "@/lib/legal/types";

/**
 * The consumer ESIGN consent disclosure shown before a resident or owner signs a document.
 *
 * The federal ESIGN Act (15 U.S.C. § 7001(c)) makes an electronic record valid for a *consumer* only if,
 * before consenting, the consumer is told — clearly and conspicuously — of the right to a paper copy, the
 * right to withdraw consent and any consequences, the hardware and software needed to access and keep the
 * records, and how to update their contact information, and then consents electronically. UETA adds that
 * the signature must be made with intent and be attributable to the signer and the specific record. This
 * disclosure is the artifact that satisfies the consent-and-disclosure half; the signing command captures
 * the intent-and-attribution half (identity, the exact document bytes, IP, device, and a tamper-evident
 * seal).
 *
 * A new version is a new artifact, never an edit of a published one. `sign_document` records the exact
 * version string a signer was shown, so a change here that kept this version would silently rewrite the
 * disclosure behind every past signature.
 */
export const esignConsent: LegalDocument = {
  code: "esign_consent",
  title: "Consent to Sign Electronically",
  audience: "public",
  locale: "en-US",
  jurisdictions: ["*"],
  version: "1.0.0",
  effectiveDate: "2026-09-04",
  state: "published",
  route: "/legal/esign-consent",
  body: `# Consent to Use Electronic Records and Signatures

**Effective 2026-09-04 · Version 1.0.0**

Please read this before you sign. It explains your rights when you sign a document electronically through
Crecy, and it applies to the document you are about to sign and to your electronic signature on it.

## 1. Your agreement to sign electronically

By signing electronically, you agree that your electronic signature on this document is legally the same
as a handwritten signature on paper, and that you intend it to sign and to be bound by the document. You
also agree to receive this document and records about your signing electronically rather than on paper.
Your consent applies to this signing; it does not commit you to sign anything else electronically in the
future.

## 2. Your right to a paper copy

You have the right to receive a paper copy of any document you sign here and of your signing record. To
request one, ask the property manager or owner who sent you the document, or email the address on your
signing confirmation. Crecy does not charge you a fee for a paper copy, though the party who sent you the
document may have its own policy.

## 3. Your right to withdraw consent

You may decline to sign, and you may withdraw your consent to sign electronically at any time before you
complete signing, at no cost and with no penalty from Crecy. If you withdraw consent, ask the sender to
provide the document another way. Withdrawing consent does not undo a document you have already signed —
that signature and record remain valid.

## 4. Keeping a copy

After you sign, you will be shown a signing certificate that records what you signed, when, and from where.
You can view it, print it, or save it as a PDF from your browser at any time while you have portal access.
Download or print a copy for your own records.

## 5. Hardware and software you need

To sign and to keep these records you need: a current web browser (for example, a recent version of
Chrome, Safari, Edge, or Firefox); a connection to the internet; an email account able to receive messages
from Crecy; and a device that can display and print or save PDF files. If these requirements change in a
way that could stop you from accessing or keeping your records, you will be told and given the chance to
withdraw consent without penalty.

## 6. Keeping your contact information current

So that we and the sender can reach you about a document you signed, keep the email address and phone
number on your Crecy portal up to date. You can update them in your portal settings, or ask the property
manager or owner who invited you.

## 7. Who provides the signing service

Crecy provides the software that records the signature. Crecy is not a party to the document you sign, is
not your lawyer, and does not give legal advice. Questions about what the document means should go to the
property manager or owner who sent it.

**Checking the box on the signing screen means you have read this disclosure, meet the requirements above,
and consent to sign this document electronically.**`,
};
