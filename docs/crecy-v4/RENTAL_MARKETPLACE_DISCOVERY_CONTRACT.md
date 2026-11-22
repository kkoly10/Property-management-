# Homeowner B5 rental marketplace discovery contract

Status: local additive implementation under FD-HR-002–005. Production release remains separately gated.

## Outcome
A landlord with an already-published shareable listing may explicitly opt that listing into Crecy discovery.
Renters browse the same listing object and enter the already-proven inquiry, tour and application pipeline.
There is no marketplace-only property, applicant, tenancy, or duplicate lead model.

## Visibility and consent
- `status` and `visibility` remain independent: only `published + discoverable` enters marketplace search.
- Existing listings never become discoverable automatically.
- Discovery is enabled only by an explicit landlord command after publication.
- Editing a listing returns it to `draft + unlisted`; republishing does not silently restore discovery.
- Pausing or closing a listing also returns it to `unlisted`.
- Re-enabling discovery therefore requires a fresh explicit action after any material lifecycle interruption.

## Public data boundary
- Search reads only the sanitized listing snapshot already used by public share pages.
- Street address, postal code, landlord identity, tenant data, payments, private documents and operator metadata are excluded.
- Search results expose coarse city/region/country, rent, availability, space attributes and one approved scanner-clean photo.
- Base listing and photo tables retain no anonymous SELECT grant; public reads remain service-role server DTOs.

## Search
- `rent.crecyos.com/search` is the marketplace browse surface; the rentals-host root resolves there once the host is released.
- Filters are bounded to country, region, locality, rent range, minimum bedrooms, space type and available-by date.
- Results are bounded and keyset-paginated newest-first; no relevance scoring or paid placement exists in B5.
- Only `published + discoverable` rows with at least one currently clean approved listing photo qualify.

## Indexing
- Unlisted listing pages remain `noindex,nofollow`.
- Discoverable listing pages may be indexable and carry their rentals-host canonical URL.
- Search itself may remain noindex until production marketplace release; indexability is not required for local certification.

## Adversarial acceptance
- guessed/draft/paused/closed/unlisted rows never appear in discovery
- wrong-property/outsider cannot change visibility
- stale-version and idempotency conflicts are rejected
- editing/pausing/closing removes search visibility atomically
- discovery toggle cannot bypass publication/photo readiness
- search filters cannot expose street/postal or private storage paths
- pagination cannot duplicate or skip stable rows when no data changes
- all discovery CTAs reuse existing listing inquiry/tour/application routes
## Local certification — October 9, 2026
- Embedded schema/lifecycle gate PASS: 91 authority tables / 65 RLS policies. Discovery proves explicit opt-in, unlisted exclusion, coarse-location-only DTO, service-role-only search, outsider/stale denial, fail-safe removal on edit/pause, no silent rediscovery after republish, stable two-row keyset pagination, and reuse of the existing inquiry/tour/application pipeline.
- HTTP/UI focused tests PASS: visibility route exact receipt/workspace boundaries, explicit add/remove discovery controls, search/filter validation, rentals-host routing, and session-independent/no-store behavior.
- Full local `pnpm check` PASS against the final source: **727/727 Vitest** across 108 files and **282/282 Playwright** tests, including discovery at 390px/1440px, privacy assertions, filter-empty state, and search-result handoff into the existing inquiry/tour/application listing page. Evidence: `/tmp/crecy-b5-20261009-cert-final.log`.
- Search and discoverable detail remain noindex in this local slice. Search-engine indexing is a later production-release decision.
- Production release remains separately blocked on attaching and verifying `rent.crecyos.com` plus the deployed proxy/header trust path. No production infrastructure was changed during B5.
