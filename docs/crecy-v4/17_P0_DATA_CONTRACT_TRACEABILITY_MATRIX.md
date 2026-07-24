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
| Documents | upload grants, documents/versions, deliveries/acknowledgements | Upload/Finalize/Acknowledge | parent documents.manage or recipient | quarantine/scan/path guessing tests |
| Maintenance | maintenance requests, work orders, reporting.resident_work_order_statuses | Submit/Create/Transition | resident projection or maintenance.manage | base-row denial, sanitized projection, optimistic version/state-machine tests |
| Owner approval | owner approval requests/decisions | RespondToOwnerApproval | exact owner_entity_id or scoped manager | co-owner isolation, one-decision/concurrency tests |
| Owner statements | statement snapshots + document versions | FinalizeOwnerStatement | exact owner_entity_id for portal; owner.manage + finance.manage for operator | co-owner isolation, versioned correction/PDF-CSV immutability |
| Owner remittance | remittance records | RecordOwnerRemittance | exact owner_entity_id for portal; owner.manage + finance.manage for operator | co-owner isolation, idempotency/currency tests |
| Messaging | conversations, participants, messages, notifications | SendConversationMessage | participant/property scope | participant isolation tests |
| Announcements | announcements/deliveries | PublishAnnouncement | resident.manage + property scope; recipients via delivery rows | selected-tenancy delivery isolation/CASL split |
| Billing | plan/price/usage/invoice/subscription tables | ChangeSubscription | org admin + step-up | localized price/limit tests |
| Privacy | privacy requests/jobs | SubmitPrivacyRequest/VerifyPrivacyRequest/CancelPrivacyRequest + sanitized workspace query | exact requester; active related organization; organization.manage for routed review/cancel | privacy_request.submitted/verified/canceled; identity step-up, job blocking, requester/admin isolation, expired-membership, export/delete, replay/version tests |

## Completion rule

Codex or Claude must update this matrix when any command, table, screen, or event is added. Missing traceability is a release-blocking specification defect.
