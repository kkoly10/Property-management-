# Phase 8 Progress Report - Relationship Messaging

**Status:** resident, owner, and operator messaging vertical implemented
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

Run `npm run check` for ESLint, TypeScript, Vitest, the full database authorization suite, and the production build.

## Deferred Phase 8 scope

- Operator-created broadcast announcements. The v4.1 contract defines delivery isolation, but no traced public create command is currently authorized.
- External email, SMS, WhatsApp, and push delivery workers. This slice persists in-app notification jobs only.
- Attachments, typing indicators, reactions, message edits, and resident-created conversation threads; these are outside the P0 command contract.

