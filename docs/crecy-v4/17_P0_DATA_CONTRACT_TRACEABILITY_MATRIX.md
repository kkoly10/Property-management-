# 17 — P0 Data and Contract Traceability Matrix

**Status:** Mandatory v4.1.1 build contract. A P0 route is not ready until its command, tables, authorization predicate, audit event, domain event, and negative tests are all present.

| Capability | Primary tables | Command/query | Authorization | Required event/tests |
|---|---|---|---|---|
| Organization + trial | organizations, memberships, subscriptions, localized price books, private.idempotency_records(actor_scope) | CreateOrganization | authenticated/new org | organization.created; NULL-org replay returns same organization |
| Staff access | invitations, memberships, property scopes, plan entitlements, notification jobs | ManageStaffMembership + recipient-bound acceptance + sanitized team workspace | active organization.manage; exact property IDs; starts_at/ends_at; AAL2 for elevation/scope/revocation | membership invited/activated/changed/scopes_changed/revoked; seat limits, recipient mismatch, expired/revoked RLS, replay/version tests |
| Property/unit | operating entities, books, properties, units | CreateProperty/CreateUnit | property.manage + scope | property/unit created; cross-org FK attacks |
| Lease/tenancy | people, households, leases, tenancies, schedules | ActivateExistingLease | lease.manage + property scope | tenancy activated; overlapping unit denied |
| Recurring rent | charge schedules, charges, journal transactions/entries | GenerateRecurringCharges | worker | charge.posted; duplicate run no-op |
| Online payment | payments, attempts, webhook events, allocations, journals | CreateResidentPaymentSession/ProcessStripeWebhook | resident tenancy / internal | replay/out-of-order/return tests |
| Manual payment/correction | payments, payment_refunds, allocations, idempotency, journals | RecordManualPayment/RefundPayment/ReverseOrCorrectPayment | finance.manage + property scope | refund persistence, over-refund rejection, append-only correction tests |
| Documents | upload grants, documents/versions, deliveries/acknowledgements | Upload/Finalize/Deliver/Acknowledge | parent documents.manage to upload/deliver; exact recipient to acknowledge | quarantine/scan/path guessing tests; deliver requires a clean version + active relationship recipient; recipient-vs-outsider-vs-manager delivery/ack RLS isolation; per-type append-only ack guard; delivery + ack replay tests |
| Maintenance | maintenance requests, work orders, reporting.resident_work_order_statuses | Submit/Create/Transition | resident projection or maintenance.manage | base-row denial, sanitized projection, optimistic version/state-machine tests |
| Owner approval | owner approval requests/decisions | RespondToOwnerApproval | exact owner_entity_id or scoped manager | co-owner isolation, one-decision/concurrency tests |
| Owner statements | statement snapshots + document versions | FinalizeOwnerStatement | exact owner_entity_id for portal; owner.manage + finance.manage for operator | co-owner isolation, versioned correction/PDF-CSV immutability |
| Owner remittance | remittance records | RecordOwnerRemittance | exact owner_entity_id for portal; owner.manage + finance.manage for operator | co-owner isolation, idempotency/currency tests |
| Messaging | conversations, participants, messages, notifications | SendConversationMessage | participant/property scope | participant isolation tests |
| Announcements | announcements/deliveries | PublishAnnouncement | resident.manage + property scope; recipients via delivery rows | selected-tenancy delivery isolation/CASL split |
| Notification preferences | profiles, notification_preferences, notification jobs/deliveries | UpdateNotificationPreferences + sanitized delivery workspace; surfaced at R-08 `/more/preferences`, O-21 `/settings/notifications`, OW-06 `/owner/preferences` | exact authenticated user only; one user-bound record keyed (user_id, category, channel) with no organization scoping, reached identically from all three surfaces; phone required for SMS/WhatsApp; marketing consent remains separate | preferences.updated; self/other-user RLS, direct-write, version, replay, malformed matrix, and masked-diagnostic tests; **suppressible-category set equals the non-NULL values of private.notification_template_category** (access mail stays unsuppressible and unsubscribe-free); every preference route resolves under routeForHost on its own audience origin and requires a session |
| Operator command center | existing portfolio, lease, finance, maintenance, owner approval, reconciliation, and audit persistence | GetOperatorCommandCenter sanitized aggregate query | active operator membership; starts_at/ends_at; explicit property scopes; permission checked independently per domain | cross-property/book denial, expired/outsider denial, currency separation, bounded queues, filter validation, and PII/provider-detail absence tests |
| Operator global search | existing property, unit, household/tenancy, lease, payment, maintenance, work-order, document, ownership persistence + prefix indexes | GetOperatorGlobalSearch bounded sanitized query | active operator membership; starts_at/ends_at; explicit property scopes; matching read/manage permission checked independently per result type | all-type coverage, stable/hard limit, cross-property/domain denial, relationship/expired/outsider denial, unsearchable contact data, and sensitive-field absence tests |
| Billing | plan/price/usage/invoice/subscription tables | ChangeSubscription | org admin + step-up | localized price/limit tests |
| Privacy | privacy requests/jobs | SubmitPrivacyRequest/VerifyPrivacyRequest/CancelPrivacyRequest + sanitized workspace query | exact requester; active related organization; organization.manage for routed review/cancel | privacy_request.submitted/verified/canceled; identity step-up, job blocking, requester/admin isolation, expired-membership, export/delete, replay/version tests |
| Platform control plane (foundation) | private.platform_actors, private.support_sessions, private.idempotency_records(actor_scope) | StartSupportSession/EndSupportSession (RPC; HTTP surface + policy wiring deferred) | active platform actor + AAL2 step-up; mandatory 8–500 char reason; 5–240 min TTL; session owner or platform_admin to end | support.session_started/ended/revoked; **inert-grant test (active session yields zero cross-org rows — has_active_support_session wired into no policy)**, non-platform/expired/closed-org/TTL/reason rejections, owner-vs-admin end authorization, replay + not-active tests |

## Completion rule

Codex or Claude must update this matrix when any command, table, screen, or event is added. Missing traceability is a release-blocking specification defect.


## Homeowner expansion — September 25, 2026

See `HOMEOWNER_RENTAL_SETUP_CONTRACT.md` for the additive command, persistence,
screen states, security tests, and traceability approved under FD-HR-001–005.


## Homeowner A3/A4 — existing signed rental
See `HOMEOWNER_EXISTING_RENTAL_CONTRACT.md` for private drafts, confirmed activation,
upload recovery and recipient-only signed-version handoff. Preserve existing engine gates.


## Homeowner public-entry trace — September 26, 2026

| Capability | Primary persistence | Command/query | Authorization | Required event/tests |
|---|---|---|---|---|
| Homeowner acquisition + workspace handoff | existing auth users, organizations, memberships; no new table | existing signup confirmation + `list_operator_organizations` + `selectOrganization` | public marketing/signup; organization choice is revalidated against the signed-in user's live memberships | marketing route/navigation/sitemap/cache tests; signup intent survives new/existing-account email; self-managing creation is preselected; no implicit multi-organization selection |

## Homeowner B1 — shared-listing traceability

| Capability | Primary tables | Command/query | Authorization | Required event/tests |
|---|---|---|---|---|
| Save listing draft | `rental_listings`, `rental_listing_photos`, exact `document_versions` | `SaveRentalListing` | authenticated self-managing workspace + current `property.manage` on exact unit/property | `rental_listing.saved`; stale version, durable retry, cross-unit/unclean photo, outsider, professional-workspace denial |
| Publish/pause/close | `rental_listings` | `SetRentalListingStatus` | same scoped manager boundary | `rental_listing.status_changed`; no-photo, short-summary, discovery-disabled, paused/closed public denial, replay |
| Rotate share URL | `rental_listings.public_id` | `RotateRentalListingLink` | same scoped manager boundary | `rental_listing.link_rotated`; old id returns no public DTO; replay returns one new id |
| Public unlisted listing | sanitized `rental_listings` snapshot + attached clean photo versions | service-only `GetPublicRentalListing` + short-lived server-signed media URLs | anonymous browser receives no table/RPC grant; server exposes published+unlisted DTO only | street/postal absence, unknown/draft/paused/closed id 404/no row, exact photo version, noindex/nofollow |
| Listing photo lifecycle | existing documents/versions + scan jobs; `rental_listing_photos` attachment | existing upload/finalize/scan commands + listing selection | unit-parent image grant, scanner-clean exact version, same org/property/unit; delivery trigger blocks recipient delivery | MIME/parent rejection, quarantine rejection, direct delivery rejection, document-register exclusion |


## Homeowner B2 trace — verified inquiries

| Capability | Primary tables | Command/query | Authorization | Required event/tests |
|---|---|---|---|---|
| Verified rental question intake | `rental_inquiries`, `private.rental_inquiry_verifications`, `private.rental_inquiry_attempts`, `private.notification_jobs` | `SubmitPublicRentalInquiry`, `VerifyPublicRentalInquiry`, `CloseRentalInquiry` | public submit/verify only through validated service route; landlord read/close requires exact-property `lease.manage` or `property.manage`; no anon base-table grant | pending hidden, wrong/expired token, token replay, normalized-email and keyed-network rate limits, terminal token scrub, wrong-property/outsider denial, direct-write denial, paused listing denial, close replay |

## Homeowner B3 trace — verified tour requests

| Capability | Primary tables | Command/query | Authorization | Required event/tests |
|---|---|---|---|---|
| Verified tour intake | `rental_tour_requests`, `rental_tour_preferences`, private verification/attempt rows, notification jobs | `SubmitPublicRentalTour`, `VerifyPublicRentalTour` | public submit/verify only through validated service route; listing must remain published+unlisted | pending hidden, wrong/expired token, verification replay, property-time-zone conversion, duplicate/DST-gap denial, normalized-email and keyed-network rate limits, terminal token scrub, paused-listing denial |
| Tour confirmation | same tour request/preferences + notification jobs | `ConfirmRentalTour` | authenticated exact-property `lease.manage` or `property.manage`; optimistic version; one submitted preference only | confirmation event + notification; replay, wrong-property/outsider/direct-write denial, overlap denial, private meeting-location boundary |

## Homeowner B5 discovery trace — October 9, 2026

| Capability | Primary persistence | Command/query | Authorization | Required evidence |
|---|---|---|---|---|
| Discovery opt-in/out | `rental_listings.visibility`, `discovered_at` | `set_rental_listing_visibility` | current self-managing operator + exact `property.manage`; versioned/idempotent | explicit opt-in, outsider/stale denial, audit/outbox |
| Fail-safe unlisting | same listing row | trigger on status + existing save command | database invariant beneath app routes | edit/pause/close clear discovery; republish stays unlisted |
| Public marketplace browse | no new marketplace table | `search_public_rental_listings` | service-role server DTO only | published+discoverable only, clean media, coarse location, bounded filters, stable keyset cursor |
| Listing detail from search | existing listing/public DTO | `get_public_rental_listing` | service-role server DTO only | same B2/B3/B4 inquiry/tour/application surface; no duplicate lead pipeline |
