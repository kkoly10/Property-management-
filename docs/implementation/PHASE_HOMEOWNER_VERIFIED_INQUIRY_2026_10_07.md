# Homeowner B2 verified inquiry — final local checkpoint

## Outcome
A visitor holding a published unlisted rental link can ask the landlord a question without creating a renter account.
The question remains hidden from the landlord until the visitor proves control of the submitted email address.

B2 adds:
- public inquiry form on `/l/:publicId`;
- server-side validation and neutral rate limiting;
- transactional verification email;
- explicit verification at `/inquiries/verify`;
- verified-only landlord inbox at `/app/rentals/:unitId/inquiries`;
- retry-safe close action for an open inquiry.

No screening, scoring, ranking, applicant decision, tour scheduling or marketplace discovery is included.

## Security and privacy boundary
Inquiry base rows contain contact PII and have no anonymous read/write grant.
Landlord reads require current `lease.manage` or `property.manage` scope on the exact property.
Pending/expired inquiries never enter landlord reads.

Verification credentials are stored only as SHA-256 hashes. The raw credential exists in the private
notification payload only until the email job reaches a terminal state, when a trigger removes it.
Verification links place the credential in the URL fragment and GET never verifies automatically.

Public submission rate limiting stores a keyed network hash rather than a raw network address.
Email matching is normalized before rate accounting. Idempotent replay is checked before consuming
another attempt, and the durable public idempotency key is namespaced by listing/email actor scope.

## Adversarial database evidence
The disposable PGlite contract proves pending-hidden/verified-visible behavior, invalid and expired token
denial, token replay, email/network limits, token scrubbing, wrong-property and outsider denial, direct
write denial, paused-listing rejection and retry-safe close.

## Final local gate — October 7, 2026
`pnpm check` exited 0 on the final B2 candidate:
- lint: 0 errors; existing warnings only;
- TypeScript: pass;
- unit/component/API tests: 678 passed across 99 files;
- database/adversarial suite: pass; authority 83 tables / 62 policies;
- schedule check: 4 jobs, Vercel config in sync;
- migration check: 78 expand / 2 contract migrations;
- production build: pass;
- Playwright: 258 passed.

Human visual QA also passed at 390px and 1440px for the public listing/inquiry form,
verification page and landlord verified-inquiry inbox.

## Release boundary
Local checkpoint only. No push, PR, production migration, Vercel deployment, DNS/alias change,
real verification email or production data change was performed.
