# Homeowner B4 verified rental-application contract

Status: additive implementation contract under FD-HR-002–005. Local-only until release approval.

## Outcome
A visitor holding a published public rental listing may submit a bounded application, verify control of the submitted email, and receive private access to their own application status. B4 launched on unlisted share links; B5 later permits the same command for explicitly discoverable listings. A landlord may review verified applications and explicitly choose “Prepare lease” or close one. Crecy does not score, rank, recommend, approve automatically, or perform screening.

## V1 application data
- first name, last name, verified email (no phone number collected in this minimal slice)
- desired move-in date
- optional lease-term preference and applicant note
- immutable snapshot of listing title, rent/currency, and availability at submission

V1 deliberately does not collect race, ethnicity, religion, disability/medical information, sex/sexual orientation, family-status attributes, date of birth, government identifiers, credit, criminal history, bank data, income, employer data, or identity documents. Screening is outside this slice.

## Public flow
1. Published `/l/:publicId` offers a distinct application form. Its date picker respects the listing property's local calendar: no earlier than tomorrow/the listing's available date, and no later than local today + 365 days, matching the PostgreSQL acceptance window. When availability is farther out, the form explains why applications cannot yet be accepted rather than offering an impossible submission.
2. Submission derives organization/property/unit/listing scope from the public id and stores `pending_verification`.
3. A transactional email links to `rent.crecyos.com/applications/verify#token=...`; the credential remains in the URL fragment and GET never mutates state.
4. Explicit verification changes the application to `submitted` and returns a one-time application-access credential to the server route.
5. The route stores that credential only in a Secure/HttpOnly/SameSite=Lax cookie; only its SHA-256 hash is durable.
6. `/applications` uses that capability to show only the applicant's own sanitized application status and to permit withdrawal.
## Applicant access boundary
- Application access is not a Supabase operator/resident session and grants no access to Crecy OS or Crecy Living.
- The access token is random, hashed at rest, scoped to exactly one application, expires after 30 days, and is revoked on withdrawal/closure/conversion.
- Each verified application has its own HttpOnly host-only cookie keyed by its non-secret public reference. The public reference in `/applications?ref=...` selects the cookie but is never itself an authorization credential. Verifying a second application must not overwrite the first; withdrawing one clears only its own cookie.
- The production host router permits public submit, verify, status and withdraw APIs only on the rentals host, and permits operator prepare/close APIs only on the app host (localhost/development hosts remain usable). Unrecognized future application API paths fail closed. This is defense in depth, not a substitute for capability validation, PostgreSQL scope checks or independent HTTP-handler tests.
- Public application-status APIs use service role only after validating the access credential; the browser receives no application table grant.
- Verification-token replay never reveals the application-access token again. An already verified link is harmless unless the browser already holds its access cookie.
- Applicant submission UI accepts success only from a 202 response with an explicit `accepted:true` receipt; incomplete/ambiguous 2xx responses preserve the exact idempotency key and immutable request body for retry. Both the applicant UI and withdrawal HTTP handler require an exact-reference `withdrawn:true` / `status:'withdrawn'` receipt with a valid advancing version (the handler additionally requires a safe integer version of at least 2). A malformed RPC success envelope returns an ambiguous 502 **without clearing the applicant's only capability cookie**, allowing an idempotent retry. Route-level regressions now exercise these cookie/reference and receipt boundaries directly.
- The submission API itself requires the database RPC's explicit `accepted:true` before emitting an HTTP 202; a truthy but malformed RPC envelope fails closed at 503. The verification API rejects a database `verified:true` result lacking a canonical `APP-` reference, and also rejects a present-but-malformed access credential (502, no cookie). The applicant verification UI independently refuses to display success without the exact canonical reference format and an explicit boolean `accessGranted` outcome. Executable route-level regressions now cover first-use Set-Cookie, harmless verification replay, malformed references/credentials, exact-reference status selection with multiple cookies, duplicate references, mismatched status receipts, reference-specific withdrawal cookie clearance/preservation, malformed withdrawal receipts, production forwarded-IP fail-closed behavior, and malformed submit envelopes.

## Landlord workflow
- `/app/rentals/:unitId/applications` shows only verified applications in chronological order; no score, rank, recommendation, eligibility label, protected attribute, or automated decision is available.
- `Prepare lease` is an explicit human action. It may run for one application on a unit at a time.
- The command pre-fills the existing homeowner lease setup with the verified applicant identity, application rent snapshot, desired move-in date, zero opening balance and no signed document.
- The landlord remains responsible for reviewing/editing lease terms and obtaining the signed agreement before activation.
- Closing or applicant withdrawal during lease preparation cancels the unactivated application-linked draft so another applicant may be prepared.
- Operator prepare/close buttons require an application-scoped, status-specific, advancing-version receipt before treating a 2xx response as success. A missing/mismatched receipt preserves the original idempotency key for a safe retry, and ambiguous in-flight operations block conflicting actions or navigation into lease setup. A synchronous in-flight guard additionally prevents rapid opposite/same-action clicks from dispatching a second command before React renders its busy state. Focused React regressions cover both operation orders, malformed receipts, and batched competing clicks. The prepare HTTP endpoint independently validates the returned application ID, preparation status, advancing version, UUID setup and unit identifiers, and positive setup revision before sending 200; route-level tests now prove exact receipt acceptance, mismatched-receipt rejection, workspace-switch denial before RPC, and private/no-store operator responses.

## Application → tenancy conversion
- `private.homeowner_lease_setups.source_rental_application_id` binds an application-selected draft to the source application.
- Existing `activate_homeowner_lease_setup` remains the tenancy engine and keeps every document, scope, finance, date, overlap and retry gate.
- When a linked setup activates, the application must still be `lease_preparation`; the same transaction changes it to `converted` and stores the created household/tenancy ids.
- A withdrawn/closed application can never activate. Resident access is still granted only by the existing post-activation resident invitation flow.

## Lifecycle
`pending_verification → submitted → lease_preparation → converted`

`pending_verification → expired`; `submitted|lease_preparation → withdrawn|closed`.
## Abuse, privacy, and adversarial acceptance
- draft/paused/closed/unknown listing rejects new applications
- pending/unverified application is invisible to landlord reads
- wrong/expired verification token opens nothing; GET/prefetch cannot verify
- public submission replay creates one application, one rate attempt and one verification email
- same idempotency key with changed body is rejected
- email/network rate limits are normalized/keyed and return neutral accepted responses; a separate per-network PostgreSQL transaction advisory lock serializes the shared hourly budget across different listing IDs. The full-schema two-listing network-budget contention fixture passed against disposable PostgreSQL 17, including a competing-session lock wait and a neutral limit response without excess application or notification side effects. HTTP capability-isolation and deployment header provenance remain separate release gates.
- the production application route accepts only a syntactically valid IPv4/IPv6 source from edge-normalized `X-Forwarded-For` for its HMAC abuse budget; it never falls back to potentially upstream-controlled `X-Real-IP`, and missing/malformed values fail closed. Inquiry and tour intake share this defense. Direct-Vercel trust assumptions and any additional reverse proxy must be independently verified before release.
- pseudonymous application attempt hashes are kept beyond the 24-hour abuse budget but opportunistically pruned after 48 hours in bounded, skip-locked batches; inactivity can defer cleanup until a subsequent submission
- applicant status token cannot read another application, operator data, resident data, or private listing address
- wrong-property operator, outsider, resident and applicant capability cannot read application PII through base tables
- direct browser writes to application tables are denied
- application access cookie is private/no-store and never appears in a URL/query string
- only one `lease_preparation` application may exist for a unit. An isolated full-schema PostgreSQL test now holds the first applicant's preparation open while the competing applicant waits on the same unit lock; after the first commits, the second is rejected, exactly one draft/audit/outbox remains, and the second applicant retains private `submitted` status access.
- preparing a lease cannot overwrite another actor's/manual lease draft
- withdrawal/closure invalidates application-linked lease preparation before tenancy activation
- activation fails if source application is no longer in `lease_preparation`
- activation replay cannot create a second tenancy or mark another application converted
- applicant UI and landlord UI contain no automated ranking, qualification, recommendation, approval or protected-class decision support
- public/applicant/operator pages fit 390px and 1440px without horizontal overflow

## Executed HTTP certification evidence
Route-level Vitest coverage now exercises the application handlers directly with mocked authenticated/service database boundaries. It proves first verification sets only the exact reference's HttpOnly SameSite=Lax cookie; replay sets no new cookie; malformed references and present-but-malformed access credentials fail closed; two simultaneously held reference cookies select the requested capability; duplicate reference queries stop before RPC; a mismatched status receipt is denied; malformed/mismatched withdrawal receipts return 502 without clearing the capability; confirmed withdrawal clears only the requested reference cookie; production submission rejects missing/malformed forwarded IP even when X-Real-IP is supplied; valid forwarded IPv6 is keyed and raw addresses are not passed downstream; malformed submit envelopes are not reported as accepted; and operator preparation accepts only an exact advancing receipt while workspace switches stop before RPC. Positive and negative responses remain private/no-store.

## Production release prerequisites
Local B4 implementation certification does **not** attach or deploy `rent.crecyos.com`. Read-only Vercel inventory on October 9, 2026 shows the property-management project has seven custom/project domains, including `crecyos.com`, `app.crecyos.com`, `owner.crecyos.com`, and Crecy Living, but **not** `rent.crecyos.com`; the project currently reports no managed routes. Therefore the real rentals hostname and deployed forwarding-header topology remain production-release prerequisites requiring explicit infrastructure authorization. They do not invalidate the locally tested application lifecycle.

## Release boundary
B4 itself introduces no marketplace search/discovery; B5 later exposes the same application path from explicitly discoverable listings. No native applicant e-sign is introduced in B4; the selected applicant proceeds through the existing signed-agreement workflow, so resident access still begins only after a real tenancy is activated.
