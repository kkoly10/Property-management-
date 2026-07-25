# P0 Command, API, Error, and Event Contracts v4.1.1

**Status:** Binding P0 server contract. Implement with route handlers/server actions plus domain services. Names may map to established repository conventions only if request, authorization, invariants, response, errors, and events remain equivalent.

## 1. API conventions

Base path: `/api/v1`.

Every user command requires:

- authenticated user;
- `Idempotency-Key` header for create/financial/transition commands;
- server-derived `actorScope` (`user:<uuid>`, signed `preauth:<session-id>`, or `system:<worker>`) stored with idempotency; clients never choose arbitrary actor scope;
- `X-Request-ID` accepted or generated;
- JSON body validated with Zod or equivalent;
- current database membership/relationship authorization;
- transaction boundary;
- audit record;
- outbox event where specified.

### Success envelope

```ts
export type CommandSuccess<T> = {
  ok: true;
  data: T;
  meta: {
    requestId: string;
    correlationId: string;
    idempotentReplay: boolean;
    resourceVersion?: number;
  };
};
```

### Error envelope

```ts
export type CommandError = {
  ok: false;
  error: {
    code: ErrorCode;
    message: string;
    fieldErrors?: Record<string, string[]>;
    retryable: boolean;
    currentVersion?: number;
  };
  meta: { requestId: string; correlationId: string };
};
```

### Stable error codes

```text
AUTH_REQUIRED
AUTH_MFA_REQUIRED
PERMISSION_DENIED
PROPERTY_SCOPE_DENIED
RELATIONSHIP_SCOPE_DENIED
PLAN_LIMIT_EXCEEDED
FEATURE_NOT_ENTITLED
VALIDATION_FAILED
RESOURCE_NOT_FOUND
RESOURCE_CONFLICT
VERSION_CONFLICT
INVALID_STATE_TRANSITION
IDEMPOTENCY_CONFLICT
CURRENCY_MISMATCH
ACCOUNTING_BOOK_CLOSED
JOURNAL_NOT_BALANCED
PAYMENT_OVERALLOCATED
CHARGE_OVERALLOCATED
PROVIDER_CONNECTION_REQUIRED
PROVIDER_REQUIREMENTS_DUE
PAYMENT_METHOD_UNAVAILABLE
PAYMENT_STILL_PENDING
PROVIDER_SIGNATURE_INVALID
PROVIDER_EVENT_DUPLICATE
IMPORT_NOT_READY
IMPORT_VALIDATION_FAILED
DOCUMENT_SCAN_PENDING
DOCUMENT_REJECTED
RATE_LIMITED
SERVICE_UNAVAILABLE
```

HTTP mapping: 400 validation/state, 401 auth, 403 permission/entitlement, 404 not found, 409 conflict/idempotency/version, 422 financial/domain rule, 429 rate limit, 503 provider unavailable.

## 2. Event envelope

```ts
export type DomainEvent<TType extends string, TPayload> = {
  eventId: string;
  eventType: TType;
  eventVersion: 1;
  occurredAt: string;
  organizationId: string | null;
  aggregateType: string;
  aggregateId: string;
  correlationId: string;
  causationId: string | null;
  actor: { type: 'user' | 'system' | 'provider'; userId?: string };
  payload: TPayload;
};
```

Events are written to `private.outbox_events` in the same transaction as domain truth. Consumers are idempotent by `eventId`.

## 3. Authorization codes

```text
organization.manage
property.read
property.manage
resident.read
resident.manage
lease.read
lease.manage
finance.read
finance.manage
maintenance.read
maintenance.manage
owner.read
owner.manage
documents.read
documents.manage
```

## 4. Exact P0 commands

### 4.1 CreateOrganization

`POST /api/v1/organizations`

```ts
interface CreateOrganizationRequest {
  displayName: string;              // 1..160
  slug: string;                     // lowercase URL-safe
  customerPath: 'self_managing' | 'property_manager';
  headquartersCountryCode: 'US' | 'CA' | 'MX';
  defaultLocale: 'en-US' | 'es-MX' | 'en-CA' | 'fr-CA';
  defaultTimeZone: string;          // IANA
}
interface CreateOrganizationResponse {
  organizationId: string;
  membershipId: string;
  roleCode: 'org_owner';
  trial: { planCode: 'growth'; endsAt: string };
}
```

Authorization: authenticated user with no conflicting active organization slug. The server derives `actorScope=user:<auth.uid()>`; pre-auth onboarding, if later supported, must use a signed `preauth:<session-id>` scope.
Transaction: acquire/replay `private.idempotency_records` using `(organization_id NULL, actorScope, route, key)`, then create organization + org-owner membership + Growth trial subscription + audit + event.
Errors: `VALIDATION_FAILED`, `RESOURCE_CONFLICT`.  
Event: `organization.created` `{displayName, customerPath, headquartersCountryCode}`.

### 4.2 CreateOperatingEntityAndBook

`POST /api/v1/operating-entities`

```ts
interface CreateOperatingEntityRequest {
  organizationId: string;
  legalName: string;
  displayName: string;
  countryCode: 'US' | 'CA' | 'MX';
  entityType: 'individual'|'sole_proprietor'|'company'|'partnership'|'trust'|'other';
  functionalCurrencyCode: 'USD' | 'CAD' | 'MXN';
  accountingBookName: string;
}
interface CreateOperatingEntityResponse {
  operatingEntityId: string;
  accountingBookId: string;
  verificationStatus: 'draft';
}
```

Permission: `organization.manage`.  
Rules: currency must match selected P0 country profile unless approved override; one transaction.  
Errors: `PERMISSION_DENIED`, `CURRENCY_MISMATCH`, `RESOURCE_CONFLICT`.  
Events: `operating_entity.created`, `accounting_book.created`.

### 4.3 CreateProperty

`POST /api/v1/properties`

```ts
interface CreatePropertyRequest {
  organizationId: string;
  operatingEntityId: string;
  accountingBookId: string;
  countryProfileCode: 'US_NATIONAL'|'CA_NATIONAL'|'MX_NATIONAL';
  name: string;
  propertyType: 'single_family'|'multifamily'|'mixed_use'|'student_housing'|'other_residential';
  address: {
    line1: string; line2?: string; locality?: string;
    subdivisionCode?: string; postalCode?: string; countryCode: 'US'|'CA'|'MX';
  };
  timeZone: string;
}
interface CreatePropertyResponse { propertyId: string; status: 'draft'; }
```

Permission: `property.manage` or `organization.manage`.  
Rules: entity/book belong to organization; profile country equals address country; book currency matches profile default; plan unit count unaffected until units created.  
Events: `property.created`.

### 4.4 CreateUnit

`POST /api/v1/units`

```ts
interface CreateUnitRequest {
  organizationId: string;
  propertyId: string;
  buildingId?: string;
  unitCode: string;
  unitType?: string;
  bedrooms?: number;
  bathrooms?: number;
  squareFeet?: number;
}
interface CreateUnitResponse { unitId: string; operationalStatus: 'active'; activeUnitUsage: number; }
```

Permission: property-scoped `property.manage`.  
Entitlement: active-unit limit.  
Errors: `PLAN_LIMIT_EXCEEDED`, `RESOURCE_CONFLICT`, `PROPERTY_SCOPE_DENIED`.  
Event: `unit.created`.

### 4.5 CreateImportJob / Validate / Commit

`POST /api/v1/imports`, `POST /api/v1/imports/{id}/validate`, `POST /api/v1/imports/{id}/commit`

```ts
interface CreateImportRequest {
  organizationId: string;
  propertyId?: string;              // required except portfolio imports
  importType: 'portfolio'|'residents'|'leases'|'opening_balances'|'documents'|'combined';
  sourceDocumentId: string;
}
interface CreateImportResponse { importJobId: string; status: 'mapping'; }
interface ValidateImportRequest { mapping: Record<string,string>; options: { dedupeMode:'strict'|'review'; dateLocale:string; }; }
interface ValidateImportResponse {
  status: 'ready'|'mapping';
  totals: { rows:number; valid:number; warnings:number; errors:number; creates:number; updates:number; skips:number; };
  errors: Array<{row:number; field?:string; code:string; message:string}>;
}
interface CommitImportRequest { expectedValidationHash: string; }
interface CommitImportResponse { status:'completed'; committed:Record<string,number>; reportDocumentId:string; }
```

Permission: property-scoped `property.manage` for all non-portfolio imports; unscoped `organization.manage` for portfolio imports; plus property-scoped `finance.manage` for opening balances.
Rules: `propertyId` is required for residents, leases, opening balances, documents, and combined imports; portfolio imports must omit it; original file immutable; commit only after zero blocking errors; all-or-nothing per declared batch; opening balances create balanced opening journals; commit cannot be replayed with changed hash.
Events: `import.created`, `import.validated`, `import.committed`, `import.failed`.

### 4.6 RecordExistingLeaseAndActivateTenancy

`POST /api/v1/tenancies/activate-existing-lease`

```ts
interface ActivateExistingLeaseRequest {
  organizationId: string;
  propertyId: string;
  unitId: string;
  household: {
    displayName: string;
    members: Array<{
      firstName:string; lastName:string; email?:string; phoneE164?:string;
      primaryContact:boolean; financiallyResponsible:boolean;
    }>;
  };
  lease: {
    source:'operator_supplied'|'imported';
    externalReference?:string;
    startDate:string; endDate?:string;
    rentAmountMinor:number; currencyCode:'USD'|'CAD'|'MXN';
    rentFrequency:'weekly'|'biweekly'|'monthly'|'quarterly'|'semiannual'|'annual'|'custom';
    signedDocumentId:string;
  };
  openingBalanceMinor?: number;
  firstChargeDueDate?: string;
}
interface ActivateExistingLeaseResponse {
  householdId:string; leaseId:string; tenancyId:string; receivableAccountId:string; chargeScheduleId:string;
}
```

Permission: property-scoped `lease.manage`; `finance.manage` required when opening balance is nonzero.  
Rules: one primary contact; no overlapping active tenancy; currency equals property book; signed document is active/scanned; opening balance posts balanced journal; operator-supplied disclaimer retained.  
Events: `lease.recorded`, `tenancy.activated`, `charge_schedule.created`, optionally `opening_balance.posted`.

### 4.7 InviteRelationshipUser

`POST /api/v1/invitations`

```ts
interface InviteRelationshipRequest {
  organizationId:string;
  relationshipType:'resident_person'|'owner_entity';
  relationshipId:string;
  email:string;
  locale:string;
  redirectSurface:'crecy_living'|'crecy_owner';
}
interface InviteRelationshipResponse { invitationId:string; expiresAt:string; deliveryStatus:'queued'; }
```

Permission: `resident.manage` or `owner.manage`.  
Rules: email/relationship match reviewed; token hashed; 72-hour expiry; replay revokes previous pending token.  
Events: `relationship.invited`, `notification.requested`.

### 4.8 CreateDocumentUploadGrant / FinalizeDocument

`POST /api/v1/documents/upload-grants`, `POST /api/v1/documents/finalize`

```ts
interface UploadGrantRequest {
  organizationId:string;
  parent:{propertyId?:string;unitId?:string;tenancyId?:string;ownerEntityId?:string};
  documentType:string; title:string; originalFilename:string; mimeType:string; sizeBytes:number;
}
interface UploadGrantResponse { uploadUrl:string; grantId:string; expiresAt:string; storagePath:string; }
interface FinalizeDocumentRequest { grantId:string; sha256Hex:string; }
interface FinalizeDocumentResponse { documentId:string; versionId:string; scanStatus:'pending'; }
```

Permission: parent-scoped `documents.manage`; resident upload allowed only through dedicated maintenance/document request command.  
Rules: MIME/size allowlist; private bucket; checksum; quarantine; malware scan; operator-supplied flag.  
Events: `document.uploaded`, then worker event `document.scan_completed` or `document.rejected`.

### 4.9 CreateStripeOnboardingLink

`POST /api/v1/payment-connections/stripe/onboarding-link`

```ts
interface StripeOnboardingLinkRequest { organizationId:string; operatingEntityId:string; returnUrl:string; refreshUrl:string; }
interface StripeOnboardingLinkResponse { providerConnectionId:string; url:string; expiresAt:string; }
```

Permission: `organization.manage` + step-up/MFA.  
Rules: Stripe-hosted onboarding; full Dashboard/Standard-equivalent configuration; direct-charge SaaS posture; no client-supplied provider account ID.  
Errors: `PROVIDER_REQUIREMENTS_DUE`, `SERVICE_UNAVAILABLE`.  
Events: `payment_connection.created`, `payment_connection.onboarding_link_created`.

### 4.10 CreateResidentPaymentSession

`POST /api/v1/resident-payment-sessions`

```ts
interface CreateResidentPaymentSessionRequest {
  tenancyId:string;
  amountMinor:number;
  currencyCode:'USD'|'CAD'|'MXN';
  allocationPreference:Array<{chargeId:string;amountMinor:number}>;
  methodPreference?:'bank'|'card';
  returnUrl:string;
}
interface CreateResidentPaymentSessionResponse {
  paymentId:string;
  paymentAttemptId:string;
  providerAccountId:string;
  checkoutUrl?:string;
  clientSecret?:string;
  status:'pending';
}
```

Actor: resident relationship user for tenancy, or authorized operator acting with recorded reason.  
Rules: amount positive; charge access; allocation sum equals amount; method enabled on property/operator connection; payment created on connected account; no success from browser redirect.  
Events: `payment.created`, `payment_attempt.initiated`.

### 4.11 ProcessStripeWebhook (internal)

`POST /api/internal/providers/stripe/webhook`

Inputs: raw body, Stripe signature, connected account header/context. No JSON middleware before signature verification.

Rules:

1. verify signature against active endpoint secret;
2. persist provider event ID/account/hash before handling;
3. reject account mismatch;
4. return 2xx for duplicate already-processed event;
5. map provider state monotonically; out-of-order events cannot regress final state;
6. on success, post balanced payment journal and apply allocations;
7. on delayed method, keep pending until authoritative event;
8. on returned debit/reversal/refund, post reversal/corrective journals and reopen receivable amount;
9. create receipt only for authoritative succeeded state;
10. write audit/outbox in same transaction.

Events: `payment.succeeded`, `payment.failed`, `payment.returned`, `payment.refunded`, `payment.disputed`, `payment.reconciliation_updated`.

### 4.12 RecordManualPayment

`POST /api/v1/manual-payments`

```ts
interface RecordManualPaymentRequest {
  organizationId:string; tenancyId:string;
  source:'cash'|'external_bank_transfer'|'check'|'other_manual';
  amountMinor:number; currencyCode:'USD'|'CAD'|'MXN';
  receivedAt:string; reason:string; evidenceDocumentId?:string;
  allocations:Array<{chargeId:string;amountMinor:number}>;
  externalReference?:string;
}
interface RecordManualPaymentResponse { paymentId:string; publicReference:string; receiptDocumentId:string; reconciliationStatus:'unreconciled'; }
```

Permission: property-scoped `finance.manage`.  
Rules: allocations sum equals payment; required reason; evidence required above configurable threshold; duplicate external reference warning/conflict; balanced journal; immutable audit.  
Events: `manual_payment.recorded`, `payment.allocated`, `receipt.generated`, `reconciliation_exception.created`.

### 4.13 SubmitMaintenanceRequest

`POST /api/v1/maintenance-requests`

```ts
interface SubmitMaintenanceRequestRequest {
  tenancyId:string;
  category:string;
  title:string;
  description:string;
  priorityRequested?:'low'|'medium'|'high';
  accessPermission?:string;
  preferredTimes?:Array<{start:string;end:string}>;
  evidenceDocumentIds?:string[];
}
interface SubmitMaintenanceRequestResponse { maintenanceRequestId:string; publicReference:string; status:'new'; }
```

Actor: resident for tenancy or property-scoped operator.  
Rules: residents cannot set emergency/official priority; operator triage assigns official priority; uploads parented to request; rate limited.  
Events: `maintenance_request.submitted`, `notification.requested`.

### 4.14 CreateAndAssignWorkOrder

`POST /api/v1/work-orders`

```ts
interface CreateWorkOrderRequest {
  organizationId:string; maintenanceRequestId:string;
  vendorId?:string; scope:string;
  scheduledStart?:string; scheduledEnd?:string;
  estimatedCostMinor?:number; currencyCode?:'USD'|'CAD'|'MXN';
  ownerApprovalRequired:boolean;
}
interface CreateWorkOrderResponse { workOrderId:string; status:'assigned'|'draft'; ownerApprovalStatus?:'pending'; }
```

Permission: property-scoped `maintenance.manage`.  
Rules: vendor belongs to org; property/book currency; owner approval threshold cannot be bypassed.  
Events: `work_order.created`, `work_order.assigned`, optionally `owner_approval.requested`.

### 4.15 TransitionWorkOrder

`POST /api/v1/work-orders/{id}/transitions`

```ts
interface TransitionWorkOrderRequest {
  expectedVersion:number;
  transition:'accept'|'schedule'|'start'|'request_approval'|'approve'|'reject'|'complete'|'close'|'cancel';
  reason?:string;
  scheduledStart?:string; scheduledEnd?:string;
  actualCostMinor?:number;
  completionSummary?:string;
  evidenceDocumentIds?:string[];
}
interface TransitionWorkOrderResponse { workOrderId:string; status:string; version:number; }
```

Permission varies by transition: operator `maintenance.manage`; owner relationship only `approve/reject` on owned property; vendor workspace future only assigned vendor transitions.  
Rules: explicit state machine; completion requires summary and evidence when configured; optimistic version.  
Events: `work_order.status_changed`, `work_order.completed`, `owner_approval.responded`.

### 4.16 FinalizeOwnerStatementSnapshot

`POST /api/v1/owner-statements/finalize`

```ts
interface FinalizeOwnerStatementRequest {
  organizationId:string; accountingBookId:string; ownerEntityId:string; propertyId:string;
  periodStart:string; periodEnd:string;
  expectedCalculationHash:string;
}
interface FinalizeOwnerStatementResponse {
  statementSnapshotId:string; currencyCode:string;
  incomeMinor:number; expenseMinor:number; managementFeeMinor:number; netOwnerPositionMinor:number;
  sha256Hex:string;
}
```

Permission: `owner.manage` + `finance.manage`.  
Rules: only posted entries; one currency/book; period stable; snapshot append-only; no payout transmission.  
Events: `owner_statement.finalized`, `notification.requested`.


### 4.17 GenerateRecurringCharges

`POST /api/internal/charge-schedules/generate`

Request: `{ runDate:string; scheduleIds?:string[]; workerRunId:string }`.
Authorization: internal worker identity only. Each generated charge uses idempotency key `charge:{scheduleId}:{dueDate}:{chargeType}`. The command locks the schedule, verifies active tenancy/book currency, creates one charge and balanced journal, advances `next_run_on`, and emits `charge.posted`. Duplicate execution returns prior charge IDs.

### 4.18 RefundPayment

`POST /api/v1/payments/{id}/refunds`

```ts
interface RefundPaymentRequest { amountMinor:number; reason:string; expectedStatus:string; expectedVersion:number; idempotencyKey:string; }
interface RefundPaymentResponse {
  paymentId:string;
  refundId:string;                   // public.payment_refunds.id, persisted before provider call
  refundStatus:'requested'|'pending'|'succeeded';
  paymentStatus:'partially_refunded'|'refunded';
  correctiveJournalTransactionId:string|null;
}
```
Permission: property-scoped `finance.manage`. The transaction first inserts `public.payment_refunds` and the outbox/audit record under the idempotency key. Provider refunds execute in connected-account context; manual payments use a correction workflow. On provider success, update the refund status and create the corrective journal atomically. The sum of nonfailed refunds may not exceed the original payment. Never mutate the original journal or allocation rows. Events: `payment.refund_requested`, then `payment.refunded` or `payment.refund_failed`.

### 4.19 ReverseOrCorrectPayment

`POST /api/v1/payments/{id}/corrections`

Request includes `correctionType:'return'|'reversal'|'allocation_correction'|'metadata_correction'`, reason, expected version/status, and replacement allocations when applicable. Creates reversal/corrective journals, reverses allocations, reopens receivables, and emits `payment.corrected`.

### 4.20 ManageStaffMembership

Routes: `POST /api/v1/staff/invitations`, `PATCH /api/v1/staff/{membershipId}`, `POST /api/v1/staff/{membershipId}/revoke`, `PUT /api/v1/staff/{membershipId}/property-scopes`.

Permission: `organization.manage`; role/scope changes use expected version, active date validation, audit, invitation token hashes, plan staff-seat limits, and immediate revocation semantics. Organization-owner assignment requires an active organization owner. Owner, administrator, and accountant assignment requires AAL2 plus an audit reason. Property-scoped roles require at least one in-organization property. Supporting invitation acceptance is recipient-bound, activates only the persisted membership, and is idempotent. Events: `membership.invited`, `membership.activated`, `membership.changed`, `membership.scopes_changed`, `membership.revoked`, and `notification.requested`.

### 4.21 RecordOwnerRemittance

`POST /api/v1/owner-remittances`

Request includes owner, property, optional statement version, amount/currency, paid date, external reference, evidence document, and idempotency key. Permission: property-scoped `owner.manage` + `finance.manage`. P0 records funds paid outside Crecy; it does not transmit funds.

### 4.22 SendConversationMessage

`POST /api/v1/conversations/{id}/messages`

Request: `{ bodyText:string; idempotencyKey:string }`. Actor must be an active conversation participant or an authorized property-scoped operator. Creates message + notification jobs atomically and emits `message.sent`.

### 4.23 PublishAnnouncement

`POST /api/v1/announcements`, `POST /api/v1/announcements/{id}/publish`, `POST /api/v1/announcements/{id}/cancel`.

Permission: property-scoped `resident.manage`. Audience expansion is persisted in delivery rows; transactional announcements contain no marketing content.

### 4.24 ChangeSubscription

`POST /api/v1/billing/subscription-changes`

Request: `{ targetPlanCode:'free'|'starter'|'growth'|'pro'; billingInterval:'month'|'year'; effectiveMode:'immediate'|'period_end'; idempotencyKey:string }`. Permission: organization owner/admin + step-up authentication. Server resolves active localized price book, validates unit limits, and persists provider invoice/subscription identifiers. Downgrades that violate limits return `PLAN_LIMIT_EXCEEDED` with required remediation.

### 4.25 SubmitPrivacyRequest

`POST /api/v1/privacy/requests`, `POST /api/v1/privacy/requests/{id}/verify`, `POST /api/v1/privacy/requests/{id}/cancel`.

Request type is access, correction, deletion, export, restriction, objection, withdrawal, or appeal. The command persists jurisdiction, controller routing, due date, identity-verification state, audit evidence, and jobs. It does not promise deletion where legal holds or operator instructions apply.

### 4.26 AcknowledgeDocumentDelivery

`POST /api/v1/document-deliveries/{id}/acknowledgements` with acknowledgement type and evidence hash. Actor must be the recipient. Creates append-only acknowledgement and emits `document.acknowledged`.

### 4.27 RespondToOwnerApproval

`POST /api/v1/owner-approvals/{id}/decision`

Request: `{ decision:'approved'|'rejected'; reason?:string; expectedVersion:number }`. Actor must be related to the requested owner entity and property. One decision is accepted; concurrent/replayed decisions return prior result or `VERSION_CONFLICT`.

### 4.28 UpdateNotificationPreferences

`PUT /api/v1/notification-preferences`

Request includes locale, reduced-motion/high-contrast/text-scale accessibility choices, the complete transactional channel/category matrix, expected preference version, and an idempotency key. The command is bound to `auth.uid()` and cannot target another user. SMS or WhatsApp activation requires a profile phone. Marketing email/SMS remain off and cannot be enabled by this command because a preference is not consent. The command updates `profiles` and `notification_preferences` atomically, writes an audit record, and emits `notification_preferences.updated`.

## 5. Query contracts

Queries are separate from commands and must be permission-scoped. P0 query routes:

```text
GET /api/v1/operator/home?organizationId=&propertyId=&from=&to=
GET /api/v1/operator/search?q=&limit=
GET /api/v1/properties
GET /api/v1/properties/{id}
GET /api/v1/residents
GET /api/v1/tenancies/{id}
GET /api/v1/payments
GET /api/v1/payments/export?from=&to=&propertyId=&accountingBookId=
GET /api/v1/payments/{id}
GET /api/v1/maintenance-requests
GET /api/v1/work-orders/{id}
GET /api/v1/resident/home
GET /api/v1/resident/payments
GET /api/v1/resident/maintenance
GET /api/v1/owner/home
GET /api/v1/owner/statements/{id}
GET /api/v1/notification-preferences
```

Every collection query uses cursor pagination, explicit maximum page size 100, stable sort, organization/property scope, and server-selected fields. Never expose arbitrary table select/filter passthrough as a public API.

Payment CSV export is a bounded file-download exception. It defaults to the most recent 30 calendar days, accepts only a past inclusive range of at most 366 days plus optional matching property/accounting-book UUIDs, and fails rather than truncates when more than 5,000 authorized rows match. The route and `get_operator_payment_export` database function both require AAL2. Every row independently requires an active membership window, explicit or allowed organization-wide property scope, and `finance.read` or `finance.manage`. Ordering is activity timestamp descending then payment ID descending. The server-selected fields are payment/public references, activity/received timestamps, property/book IDs and names, unit, household display name, payment source/status/reconciliation, exact minor-unit amounts, and currency. Resident contacts, manual reasons or external references, provider identifiers, journal/audit payloads, and arbitrary table fields are forbidden. Responses use `private, no-store`, spreadsheet-formula neutralization, UTF-8, and exact minor-unit values.

Operator search is a bounded exception to cursor pagination because it returns a single relevance-ranked page: `q` is trimmed and 2–80 characters, `limit` defaults to 24 and may not exceed 50, and ordering is exact match, prefix match, resource-type rank, normalized title, then resource ID. Searchable inputs are limited to names, property addresses, unit codes, public references, maintenance titles, and document titles. The response is a sanitized `{ kind, resourceId, title, subtitle, status, propertyId, propertyName, href }` DTO; contact fields, descriptions/access instructions, payment reasons, provider identifiers, and raw rows are forbidden.

## 6. P0 event catalog

| Event | Minimum payload |
|---|---|
| `organization.created` | organizationId, customerPath, country |
| `operating_entity.created` | entityId, country, entityType |
| `accounting_book.created` | bookId, currency |
| `property.created` | propertyId, bookId, country |
| `unit.created` | propertyId, unitId |
| `import.validated` | importJobId, totals, validationHash |
| `import.committed` | importJobId, committed counts, reportDocumentId |
| `lease.recorded` | leaseId, propertyId, unitId, source |
| `tenancy.activated` | tenancyId, householdId, receivableAccountId |
| `charge.posted` | chargeId, amountMinor, currency, dueDate, journalTransactionId |
| `payment.created` | paymentId, amountMinor, currency, source |
| `payment.succeeded` | paymentId, attemptId, providerConnectionId, receivedAt |
| `payment.returned` | paymentId, reasonCode, reversalJournalTransactionId |
| `manual_payment.recorded` | paymentId, source, actorUserId, evidenceDocumentId |
| `payment.allocated` | paymentId, allocations[] |
| `receipt.generated` | paymentId, documentId |
| `maintenance_request.submitted` | requestId, propertyId, unitId, residentVisibleStatus |
| `work_order.assigned` | workOrderId, vendorId, schedule |
| `work_order.status_changed` | workOrderId, from, to, actorType |
| `owner_statement.finalized` | snapshotId, ownerId, propertyId, period, hash |
| `document.uploaded` | documentId, versionId, source, scanStatus |
| `notification.requested` | templateCode, recipientRelationship, locale, channelPreference |
| `message.sent` | conversationId, messageId, senderType |
| `announcement.published` | announcementId, propertyId, audienceType, deliveryCount |
| `document.acknowledged` | deliveryId, acknowledgementId, type |
| `payment.corrected` | paymentId, correctionType, correctiveJournalTransactionId |
| `owner_remittance.recorded` | remittanceId, ownerId, propertyId, amountMinor, currency |
| `owner_approval.responded` | approvalRequestId, ownerId, decision |
| `subscription.change_requested` | organizationId, fromPlan, toPlan, effectiveMode |
| `privacy_request.submitted` | privacyRequestId, requestType, controllerRole, dueAt |
| `privacy_request.verified` | privacyRequestId, controllerRole, status |
| `privacy_request.canceled` | privacyRequestId, status |
| `membership.invited` | membershipId, invitationId, roleCode, propertyIds |
| `membership.activated` | membershipId, invitationId, roleCode |
| `membership.changed` | membershipId, roleCode, status, version |
| `membership.scopes_changed` | membershipId, propertyIds, version |
| `membership.revoked` | membershipId, revokedUserId, version |
| `notification_preferences.updated` | userId, locale, preferencesVersion |

## 7. Payment state transition table

| Current | Allowed next |
|---|---|
| created | pending, failed |
| pending | succeeded, failed, returned |
| succeeded | partially_refunded, refunded, disputed, reversed, returned |
| partially_refunded | refunded, disputed |
| disputed | succeeded, reversed |
| failed | terminal; new attempt required |
| returned | terminal correction; new payment required |
| refunded | terminal |
| reversed | terminal |

Provider events cannot move a terminal state backward without an explicit corrective domain command and audit trail.

## 8. Idempotency persistence

Store the exact command lifecycle in `private.idempotency_records`: `{organization_id, actor_user_id, route, idempotency_key, request_hash, state, response_status, response_body, resource_type, resource_id, created_at, completed_at, expires_at}`. Same key + same request returns prior result; same key + different request returns `IDEMPOTENCY_CONFLICT`.
