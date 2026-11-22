# Homeowner B3 verified tour-request contract

Status: additive implementation contract under FD-HR-002–005. Local-only until release approval.

## Outcome
A visitor holding a published unlisted rental link can request an in-person tour by proposing one to
three times in the rental property's local time zone. The request does not enter the landlord workspace
until the visitor proves control of the submitted email address.

The landlord may confirm one proposed time. A confirmation is scheduling only: it is not application
approval, screening, ranking, qualification, or a promise that the rental will remain available.

## Public flow
1. Published `/l/:publicId` offers a separate tour-request card.
2. Visitor supplies first/last name, email and 1–3 preferred local date/times.
3. Server derives organization/property/unit/time zone from the public listing; none are trusted from the body.
4. A pending request is created and one verification email is queued.
5. Email points to `rent.crecyos.com/tours/verify#token=...`.
6. GET never mutates. Explicit POST verification changes the request to `requested`.

## Time model
- Preferences are entered and displayed in the property's IANA time zone.
- Server converts each proposed local timestamp to UTC and rejects invalid DST-gap round trips.
- Preferences must be distinct, in the future, and no more than 60 days ahead.
- A tour slot is 30 minutes in B3.
- Confirmation stores the chosen preference and immutable UTC start/end plus the property time zone.
- The landlord explicitly confirms or edits a private meeting location. It is never copied into the public listing.
- The confirmed meeting location is sent only in the transactional confirmation email to the verified requester.
- No calendar-provider integration or automatic conflict promise is made in B3.

## Privacy and authorization
- Base tour/contact rows are never anonymous-readable or writable.
- Pending/expired requests are excluded from landlord reads.
- Landlord reads and confirmation require current `lease.manage` or `property.manage` on the exact property.
- Contact fields are limited to name/email; no protected-class, income, credit, criminal or ID data is collected.
- Existing resident, owner and unrelated operator relationships grant no prospect access.

## Verification and abuse controls
- Verification uses a 64-hex random credential; only its SHA-256 hash is durable.
- Raw token exists only in the queued private notification payload and is scrubbed on terminal job states.
- Token expires after 60 minutes; replay after success is idempotent.
- Public submit uses neutral responses, normalized-email limits and a keyed network hash; raw network addresses are not stored.
- Production intake requires a valid IPv4/IPv6 `X-Forwarded-For` edge source; missing/malformed values fail closed without an `X-Real-IP` fallback. This is source-format hardening, not attestation of the deployed proxy chain.
- Same request replay is checked before rate accounting and queues one verification message.
- Public idempotency storage is namespaced by listing/email actor scope to avoid legacy null-user collisions.

## Landlord workflow
- `/app/rentals/:unitId/tours` shows verified requests newest-first.
- Each request shows verified contact, submitted preferences in property-local time and status.
- Landlord may confirm exactly one submitted preference and the private meeting location.
- Confirmation queues a transactional email naming the confirmed time, time zone and meeting location.
- If no proposed time works, the landlord may reply by email; B3 does not invent an automated rejection state.

## Adversarial acceptance
- draft/paused/closed/unknown listing cannot accept a tour.
- malformed, duplicate, past, >60-day or DST-gap preferences are rejected.
- renter device time zone cannot alter server interpretation.
- pending request is invisible to landlord RLS.
- invalid/expired token confirms nothing; token replay creates no second request.
- same submit replay records one rate attempt and one email.
- changed body with same idempotency key conflicts.
- wrong-property staff, outsider, resident and anonymous readers cannot access tour PII.
- direct table writes are denied.
- only a preference belonging to that exact tour can be confirmed.
- stale confirmation version conflicts; retry with the same operation key returns the first result.
- confirmation mail is queued once and carries no screening/approval wording.
- public/operator pages fit 390px and 1440px without horizontal overflow.
