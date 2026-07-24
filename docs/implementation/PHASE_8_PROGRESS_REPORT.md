# Phase 8 Progress Report - Communications, Privacy, and Staff Access

**Status:** relationship messaging, explicit-delivery announcements, privacy request scaffolding, and staff access management implemented
**Date:** 2026-07-24

## Implemented scope

- Canonical `conversations`, append-only `messages`, `conversation_participants`, and private `notification_jobs` persistence.
- Active resident and owner relationships provision one conversation for each matching tenancy or effective property ownership interest.
- Revoked relationships leave their participant rows with `left_at` set; access helpers require an active participant.
- Operators may access conversations only through an active organization membership, an effective `starts_at`/`ends_at` window, the required `resident.manage` or `owner.manage` permission, and an explicit or allowed organization-wide property scope.
- Residents are matched through their active person relationship and current household membership.
- Owners are matched through their exact `owner_entity_id` relationship, never by property alone.
- `SendConversationMessage` is exposed through `POST /api/v1/conversations/:conversationId/messages`.
- Message creation is actor-scoped and idempotent, increments the conversation version, queues in-app notifications, writes an audit record, and emits `message.sent` in one transaction.
- Audit, outbox, and notification payloads include routing metadata but never the message body.
- Base conversation, participant, and message tables have no Data API grants. Authenticated clients use server-selected workspace and detail DTOs.
- Resident inbox and thread screens are available at `/messages`.
- Owner inbox and thread screens are available at `/owner/messages`.
- Operator inbox and thread screens are available at `/app/messages`.
- All portals share a replay-safe send control and render setup, empty, closed, and unavailable states.
- Canonical `announcements` and `announcement_deliveries` persistence supports draft, publish, and cancel states with optimistic version checks.
- `PublishAnnouncement` expands organization-resident, property-resident, selected-tenancy, or property-owner audiences into explicit delivery rows in the publication transaction.
- Resident recipients require an active exact person relationship, current household membership, and active tenancy. Owner recipients require an active exact owner relationship and effective property interest.
- Same-property users without a delivery row cannot read announcement content.
- Announcement publication queues in-app notification jobs and emits `announcement.published`; audit, outbox, and notification metadata omit announcement text.
- Operators publish transactional announcements at `/app/announcements`. Marketing content remains outside this P0 command path.
- Explicitly delivered announcements appear on the resident and owner home screens.
- Canonical `privacy_requests` and private `privacy_request_jobs` persistence supports access, correction, deletion, export, restriction, objection, consent-withdrawal, and appeal requests.
- `SubmitPrivacyRequest` derives operator-versus-platform controller routing, validates an organization relationship, records jurisdiction and a 30-day target, creates type-specific private jobs, and blocks those jobs until identity verification.
- `VerifyPrivacyRequest` requires the exact requester and an AAL2 session before unblocking jobs. Organization administrators may review and cancel routed requests but cannot verify another person's identity.
- `CancelPrivacyRequest` uses optimistic versioning, actor-scoped idempotency, and atomically cancels unfinished private jobs.
- Request, verification, and cancellation actions are audited and emit `privacy_request.submitted`, `privacy_request.verified`, and `privacy_request.canceled` events without storing free-form request content in event payloads.
- Authenticated clients cannot select the privacy request or job tables directly. `/settings/privacy` consumes a bounded, server-selected workspace DTO with only status and job-count summaries.
- The privacy center is linked from operator, resident, and exact-owner surfaces and clearly states that deletion remains subject to legal holds, financial/legal retention, and operator instructions.
- Canonical `invitations` persistence now supports organization-member invitations with a 72-hour hashed token, prefix-only operational metadata, and exact organization/membership foreign keys.
- `ManageStaffMembership` is implemented through the four specified invitation, membership update, revocation, and property-scope routes, plus recipient-bound invitation acceptance.
- `/settings/team` consumes a sanitized server DTO for the current organization, staff roster, role catalog, available properties, invitation status, and staff-seat usage.
- Staff invitations enforce the active subscription's `core.staff` limit: Free 1, Starter 2, Growth 5, and Pro unlimited fair use.
- Property-scoped roles require an explicit in-organization property set. Organization-wide-capable roles may instead use an explicit subset or no scopes.
- Organization-owner assignment requires an active owner. Owner, administrator, and accountant assignment requires AAL2 and an audit reason. Scope replacement and revocation always require AAL2 and a reason.
- Membership updates use optimistic versions. Revocation changes the membership status transactionally and removes authorization immediately without deleting the audit-visible record.
- Invitation acceptance is bound to the exact persisted auth user, is replay-safe, and activates only a membership inside its `starts_at`/`ends_at` window.
- Staff invitation emails use Supabase Auth from a trusted server. The application invitation token is deterministic per idempotency key, stored only as a SHA-256 hash, and never persisted in plaintext.
- Staff commands create notification jobs and emit `membership.invited`, `membership.activated`, `membership.changed`, `membership.scopes_changed`, and `membership.revoked` with corresponding audit records.
- Base invitations, memberships, and property-scope rows remain non-writable from the browser; all mutations go through authorization-checking command functions.

## Verification evidence

The embedded Postgres suite applies the complete forward migration chain and verifies:

- automatic provisioning of one resident and two exact co-owner conversations;
- resident tenancy isolation and co-owner entity isolation;
- outsider non-disclosure for list, detail, and send operations;
- property-scoped operator access plus immediate loss of access when membership expires;
- denial of direct Data API table reads and writes;
- idempotent replay, conflicting replay, and closed-conversation behavior;
- append-only message enforcement;
- one canonical audit and outbox event per unique message;
- recipient notification creation; and
- absence of message text from audit, event, and notification metadata.

Vitest covers message input trimming, blank input, and the 10,000-character limit.

Announcement coverage includes selected-tenancy validation, exact resident and owner delivery, same-property non-recipient denial, outsider denial, expired property-membership denial, direct table-access denial, optimistic version conflicts, idempotent create/publish/cancel replay, delivery counts, and content-free audit/event/notification metadata. Vitest covers audience/property compatibility, locale, trimming, recipient limits, and command versions.

Privacy coverage includes requester versus organization-admin visibility, same-organization relationship isolation, unrelated-user and expired-membership denial, direct table-access denial, MFA step-up, identity-gated jobs, platform and operator routing, jurisdiction validation, replay/conflict handling, optimistic versions, administrator cancellation, and audit/outbox/job trace counts. Vitest covers request types, jurisdiction normalization, cancellation limits, and command versions.

Staff-access coverage includes organization-admin versus outsider authorization, sensitive-role MFA, recipient-bound acceptance, property-required roles, active-date seat accounting, Growth seat exhaustion, stale versions, role and scope changes, protected self-membership, immediate revocation, service-only email resolution/delivery marking, direct-table denial, idempotent replay, and audit/outbox/notification trace counts. Vitest covers email/date normalization, allowed roles and statuses, property-scope reasons, revocation reasons, and activation-token shape.

Run `npm run check` for ESLint, TypeScript, Vitest, the full database authorization suite, and the production build.

## Deferred Phase 8 scope

- General notification workers for messaging and announcements (SMS, WhatsApp, push, and non-auth email). Staff activation email is sent through Supabase Auth; the durable notification job records its delivery state.
- Attachments, typing indicators, reactions, message edits, and resident-created conversation threads; these are outside the P0 command contract.
- Privacy discovery/export/deletion workers and legal-hold adjudication. P0 now persists safely blocked/queued jobs and exposes their status without claiming work has completed.
- Paid SaaS subscription changes remain deferred until a platform Stripe key and real provider price IDs are configured. The repository does not invent provider identifiers or activate unbilled paid entitlements.

