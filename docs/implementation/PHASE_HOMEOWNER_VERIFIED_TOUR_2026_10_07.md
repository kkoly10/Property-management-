# Homeowner B3 verified tours — 2026-10-07

## Outcome
A visitor holding a published unlisted rental link can request a 30-minute tour using 1–3 preferred times, verify control of the submitted email address, and enter a landlord scheduling queue. The landlord can confirm exactly one submitted preference and provide a private meeting location. This slice does not screen, score, rank, approve, reserve, create an application, or enable marketplace discovery.

## Security and time boundary
- Public submit derives organization/property/unit from the published listing; those identifiers are not trusted from the browser.
- Pending requests are invisible to landlord reads until email verification succeeds.
- Verification uses an expiring hashed token; opening the page never consumes it.
- Rate limiting uses normalized email plus a keyed network hash, without storing raw network addresses.
- Visitor-local times are interpreted in the property IANA time zone and round-trip checked through UTC; DST gaps, duplicate choices, past times and out-of-horizon times are rejected.
- Confirmation requires current exact-property operator permission, optimistic version, an exact submitted preference, and a non-public meeting location.
- Confirmed 30-minute tours for the same unit may not overlap.

## Recovery
Public submit, verification and landlord confirmation are retry-safe. Ambiguous confirmation keeps the same operation key/body and locks competing choices until the original result is resolved.
## Local evidence
`pnpm check` passed on the final candidate:
- lint: 0 errors; 5 pre-existing unused-import warnings
- TypeScript: pass
- unit tests: 687 passed across 103 files
- database/adversarial suite: pass; authority 87 tables / 64 policies
- schedule check: 4 jobs, Vercel config in sync
- migration check: 79 expand / 2 contract migrations
- production build: pass
- Playwright: 265 passed

Focused B2+B3 coexistence checks passed 10/10 after scoping the older inquiry test to its own card. A separate B3 Playwright spec covers public tour intake, explicit verification, landlord queue behavior, and 390px/1440px layout.

Manual visual QA was performed on the built candidate at 390px and 1440px for the combined public listing and the landlord tour queue, plus the 390px verification page. Inquiry and tour actions remain visually distinct, the public page exposes only approved listing data, and the meeting location remains operator-only until confirmation.

## Release boundary
This is a local checkpoint only. No repository push, production migration, Vercel deployment, DNS/alias change, real email, or live calendar/payment action was performed.

## Next slice
B4 should define and implement applications with an applicant-specific authorization boundary and an explicit applicant-to-tenancy conversion transaction. Marketplace search/discovery remains later and must feed this same listing/prospect pipeline.
