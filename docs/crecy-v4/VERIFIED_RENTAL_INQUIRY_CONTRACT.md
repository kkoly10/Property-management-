# Homeowner B2 verified rental-inquiry contract

Status: additive implementation contract under FD-HR-002–005. Local-only until release approval.

## Outcome
A visitor holding a published unlisted rental link can send a question to the landlord. The question
does not enter the landlord workflow until the visitor proves control of the submitted email address.
B2 is contact intake only: no screening, scoring, ranking, application decision, eligibility inference
or marketplace discovery is implemented.

## Public flow
1. Published `/l/:publicId` shows an inquiry form.
2. Visitor supplies first name, last name, email and a bounded question about the rental.
3. The public command validates the still-published listing, rate limits by private hashed signals,
   creates a `pending_verification` inquiry and queues one verification email.
4. Email links to `rent.crecyos.com/inquiries/verify#token=...`. The credential stays in the URL fragment,
   so ordinary HTTP requests, access logs and referrers do not receive it.
5. The verification page does not mutate on GET. The person explicitly presses Verify; only the POST
   consumes the token.
6. Successful verification changes the inquiry to `open`. Only then can the landlord read it.
## Privacy and authorization
- Base inquiry rows contain contact PII and are never anonymous-readable.
- Landlord reads require current `lease.manage` or `property.manage` scope on the exact property.
- Pending/unverified inquiries are excluded from the landlord workspace.
- The public browser gets no direct table grant and no service-role credential.
- The inquiry stores the listing/property/unit relationship at intake so a later listing edit cannot
  silently retarget the lead to another rental.
- The form asks only for contact identity and a rental question. It does not collect protected-class
  attributes, income, credit, criminal history, identification documents or screening data.

## Verification credential
- Raw token: a 64-character opaque hex credential derived from two independent strong UUID draws and SHA-256; only its SHA-256 hash is durable in the verification table.
- The raw token is temporarily present in the private notification job payload only while delivery is
  pending; a terminal-job trigger scrubs it on sent/dead-letter/cancel.
- Verification expires after 60 minutes.
- Refresh/retry after a successful verify is idempotent; an expired/unknown token returns one generic
  invalid-or-expired response.
- Email-link GET never consumes the token, protecting the flow from mail-link scanners/prefetchers.

## Abuse controls
- Public create is service-role-only behind a validated HTTP endpoint.
- DB rate limits use hashed normalized email and a server-supplied hashed network signal; raw IP is not stored.
- Per listing/email: at most 5 submissions in 24 hours. Per network signal: at most 20 per hour.
- Idempotent replay is checked before rate accounting, so a lost response cannot spend the rate budget twice.
- Invalid fields return validation errors; accepted/rate-limited create responses remain neutral enough not to
  reveal whether an email has already contacted the listing.
## Landlord workflow
- `/app/rentals/:unitId/inquiries` shows verified inquiries newest-first with name, verified email,
  question, received time and status.
- A landlord may mark an open inquiry closed. B2 has no approve/reject, score, rank or applicant state.
- The listing-management page links to inquiries; closing a listing does not erase already-verified inquiries.

## Adversarial acceptance
- draft/paused/closed/unknown listing cannot accept an inquiry.
- forged organization/listing ids never come from the public body; scope is derived from the public listing id.
- pending inquiry is invisible to landlord reads.
- wrong/expired verification token opens nothing.
- link scanner GET does not verify.
- token replay after success returns the same verified inquiry, not another row.
- idempotent submit replay queues one email and records one rate attempt.
- changed body with same idempotency key is rejected.
- rate limit cannot be bypassed by changing case/whitespace of email.
- outsider, resident and wrong-property operator cannot read inquiry PII.
- direct browser writes to inquiry tables are denied.
- inquiry form and emails never promise availability, acceptance, approval or response time.
- public and operator pages fit 390px and 1440px without horizontal overflow.
