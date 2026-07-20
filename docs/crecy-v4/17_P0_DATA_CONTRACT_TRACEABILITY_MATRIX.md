# 17 — P0 Data and Contract Traceability Matrix

**Status:** Mandatory v4.1 build contract. A P0 route is not ready until its command, tables, authorization predicate, audit event, domain event, and negative tests are all present.

| Capability | Primary tables | Command/query | Authorization | Required event/tests |
|---|---|---|---|---|
| Organization + trial | organizations, memberships, subscriptions, localized price books | CreateOrganization | authenticated/new org | organization.created; duplicate slug/idempotency |
| Staff access | invitations, memberships, property scopes | ManageStaffMembership | organization.manage | membership invited/changed/revoked; expired membership RLS |
| Property/unit | operating entities, books, properties, units | CreateProperty/CreateUnit | property.manage + scope | property/unit created; cross-org FK attacks |
| Lease/tenancy | people, households, leases, tenancies, schedules | ActivateExistingLease | lease.manage + property scope | tenancy activated; overlapping unit denied |
| Recurring rent | charge schedules, charges, journal transactions/entries | GenerateRecurringCharges | worker | charge.posted; duplicate run no-op |
| Online payment | payments, attempts, webhook events, allocations, journals | CreateResidentPaymentSession/ProcessStripeWebhook | resident tenancy / internal | replay/out-of-order/return tests |
| Manual payment/correction | payments, payment_refunds, allocations, idempotency, journals | RecordManualPayment/Refund/Correct | finance.manage + property scope | refund ceiling + append-only correction tests |
| Documents | upload grants, documents/versions, deliveries/acknowledgements | Upload/Finalize/Acknowledge | parent documents.manage or recipient | quarantine/scan/path guessing tests |
| Maintenance | maintenance requests, work orders | Submit/Create/Transition | resident or maintenance.manage | optimistic version/state-machine tests |
| Owner approval | owner approval requests/decisions | RespondToOwnerApproval | related owner or manager | one-decision/concurrency tests |
| Owner statements | statement snapshots + document versions | FinalizeOwnerStatement | owner.manage + finance.manage | versioned correction/PDF-CSV immutability |
| Owner remittance | remittance records | RecordOwnerRemittance | owner.manage + finance.manage | idempotency/currency tests |
| Messaging | conversations, participants, messages, notifications | SendConversationMessage | participant/property scope | participant isolation tests |
| Announcements | announcements/deliveries | PublishAnnouncement | resident.manage + scope | audience isolation/CASL split |
| Billing | plan/price/usage/invoice/subscription tables | ChangeSubscription | org admin + step-up | localized price/limit tests |
| Privacy | privacy requests/jobs | SubmitPrivacyRequest | self/admin routing | identity, hold, export/delete tests |

## Completion rule

Codex or Claude must update this matrix when any command, table, screen, or event is added. Missing traceability is a release-blocking specification defect.
