# Homeowner B1 shared listing — 2026-09-26

## Outcome

A self-managing landlord can now create an unlisted Crecy rental page without depending on Crecy
marketplace traffic. The listing is a separate sanitized advertising snapshot tied to the private rental
record. B1 intentionally does not implement Crecy discovery, inquiries, tours, applications or screening.

The management entry is `/app/rentals/:unitId/listing`. The public share shape is
`rent.crecyos.com/l/:publicId`. Host routing is implemented locally, but the production hostname/DNS
has not been activated.

## Data and security

- New `rental_listings` and `rental_listing_photos` tables are private at the base-table layer.
- Only self-managing workspaces with current `property.manage` can mutate a listing.
- Public reads use a service-only sanitized DTO; the browser receives no anonymous table/RPC grant.
- Public location is city/region/country only. Street and postal code never enter the public DTO.
- Photos reuse the private document upload + malware-scan lifecycle and must be exact scanner-clean
  versions from the same organization/property/unit.
- Listing photos are advertising media: they are excluded from the document register and blocked from
  recipient document delivery by a database trigger.
- Public media uses short-lived signed private-storage URLs.

## Lifecycle

- One non-closed listing can exist for a unit at a time.
- A saved change to a published/paused listing returns the changed snapshot to `draft`; it cannot alter
  live public content without another explicit publish.
- Publish requires an unlisted listing, a meaningful description and at least one clean photo.
- Pausing hides the listing immediately.
- Link rotation changes the public UUID; the previous URL no longer resolves.
- Closing is terminal for that listing record, but a later relisting creates a fresh record/public UUID.
- Save, status transition and link-rotation commands are version-checked, durably idempotent, audited
  and evented.
- The client retains the exact operation key/body after an ambiguous network/server response and locks
  editing until the same operation is retried.

## Host/indexing boundary

`rent.crecyos.com` is classified as its own Crecy surface. Only the `/l/:publicId` share family is
served there; product routes canonicalize to the operator app and unrelated paths fail closed. Marketing
or product-host share paths canonicalize to the rentals host.

Share pages emit noindex/nofollow and robots disallows only `/l/` (with the slash), preserving the
indexable `/landlords` page. Share pages skip Supabase Auth/session construction and return
`Cache-Control: private, no-store`; marketing pages retain their shared-cache behavior.

## Adversarial coverage

The disposable PGlite contract test proves draft privacy, scanner-clean media gating, wrong-unit photo
denial, street/postal omission, paused/closed public denial, old-link revocation, outsider denial,
relisting after close, and live-edit-to-draft behavior. It also proves listing-photo upload type/parent
constraints and rejects direct document-delivery insertion for listing media.

Component regression tests prove that ambiguous draft-save and publish responses retry the identical
payload and idempotency key. Host tests prove the rental share page constructs no auth client and stays
no-store.

## Final local gate

`pnpm check` exit 0 on the final candidate:
- lint: 0 errors; 5 pre-existing unused-import warnings
- TypeScript: pass
- unit tests: 663 passed across 93 files
- database/adversarial suite: pass; authority 80 tables / 61 policies
- schedule check: 4 jobs, Vercel config in sync
- migration check: 77 expand / 2 contract migrations
- production build: pass
- Playwright: 251 passed

Visual QA was also performed on the built candidate at 390px and 1440px for both the landlord listing
editor and the public share page. The editor remained usable without horizontal overflow; the public page
showed only coarse location and approved advertising details.

## Connected rehearsal blocker

A disposable connected Supabase rehearsal is still blocked by the Mac's Colima/containerd I/O failure.
The Crecy Supabase production project has no existing preview branch. No paid Supabase branch was
created and no production schema/data was touched.

## Release boundary

This work remains local. No repository push, PR, production migration, Vercel deployment, DNS/alias
change, real email, payment or charge was performed. `rent.crecyos.com` is an implemented routing
contract, not yet an activated production hostname.

## Next slice

B2 should add prospect identity + verified inquiry intake against an already-working shared listing,
then tour requests. Applications should follow only after the applicant authorization model and
applicant-to-tenancy conversion transaction are defined and tested. Marketplace discovery remains later
and must feed the same listing/prospect pipeline rather than create a parallel workflow.
