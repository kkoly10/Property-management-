# Court-defensible electronic signatures (ESIGN / UETA)

**Status:** implemented, green under `npm run test:db` + `npm run check` (embedded Postgres). Live
connected-certification is pending the paused Supabase project being resumed.

## Why

"Signing" a delivered document was an acknowledgement of type `accepted` whose only evidence was the
file's own content hash, supplied by the client and stored unverified. That binds *which file* but proves
nothing about *who* signed, *when*, from *where*, with what *intent*, or under what *consent* — the four
things the U.S. ESIGN Act (15 U.S.C. §7001) and UETA require an electronic signature to demonstrate to be
enforceable, and the things a DocuSign Certificate of Completion records.

## What was built (one vertical slice)

- **Migration** `20260904120000_phase_2_document_signatures.sql`
  - `public.document_signatures` — append-only evidence table (SELECT-only from the browser; no command
    updates or deletes a row). RLS: the signer reads their own signature, a document manager reads any
    signature on the version.
  - `private.safe_inet(text)` — parses the first address from an `X-Forwarded-For` list, never throwing.
  - `public.sign_document(...)` — the command. Captures, server-side:
    - **Intent** — an explicit signing act carrying the exact affirmation text shown.
    - **Consent** — an ESIGN electronic-records consent, versioned, written to `consent_records`.
    - **Attribution** — bound to `auth.uid()` = the addressed recipient, to the exact document version and
      its own `sha256_hex` (never a client-supplied hash), with IP, user agent and auth-assurance level.
    - **Tamper-evidence** — `signature_seal`, a SHA-256 over every evidence field (timestamp normalized to
      UTC) that recomputes from the stored row; a short `verification_code` for the certificate.
    - Also writes a backward-compatible `accepted` acknowledgement so existing "Signed" state keeps
      working, and finally populates `audit.audit_events.ip_hash` (unused since phase 1).
- **Validation** `signDocumentSchema` — consent and intent are `literal(true)`; the edge refuses an
  unenforceable signature before the command runs.
- **API** `POST /api/v1/document-deliveries/[deliveryId]/signature` — captures `x-forwarded-for` and
  `user-agent` from the request (never the body) and forwards them.
- **Legal** `src/lib/legal/documents/esign-consent.ts` — the versioned §7001(c) consumer disclosure
  (paper-copy right, withdrawal right, hardware/software), registered in the legal registry but NOT in
  `ORGANIZATION_CONSENT_CODES`, so it gates signing, not workspace creation.
- **UI**
  - `/documents/[deliveryId]/sign` — a three-step ceremony (Consent → Review → Sign) that shows the full
    disclosure, adopts a typed signature, and records the exact affirmation.
  - `/documents/[deliveryId]/certificate` — the Certificate of Completion: verification code, signer, the
    statement signed, delivered→viewed→signed chain of custody, document fingerprint, IP, device, auth
    level, consent version, and the tamper-evident seal. Printable to PDF (the retention affordance).
  - Resident and owner document lists route "Review & sign" to the ceremony and expose the certificate.

## Verification

`test:db` drives `sign_document` and asserts: the returned certificate payload; that the bound hash equals
the delivered version's own `sha256_hex`; the IP is parsed from the forwarded-for list; the user agent,
ESIGN consent record, and delivered/viewed chain of custody are captured; the backward-compatible
`accepted` acknowledgement is written; **the seal recomputes from the stored row**; the audit event
carries a populated `ip_hash`; RLS isolates signer / outsider / manager; and the row is append-only
(authenticated holds no UPDATE/DELETE). Rejection paths: forbidden non-recipient, missing consent, missing
intent, short name.

## Not yet done

- A server-rendered immutable PDF of the certificate (browser print-to-PDF ships; a stored PDF is a
  tracked follow-up, same as owner statements).
- A drawn-signature capture (typed adopted signature ships; drawing is a later enhancement).
- Live connected-certification against the migrated Supabase project (blocked on the paused project).
