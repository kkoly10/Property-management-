# Phase 2 Progress Report — Document Delivery & Acknowledgement

**Status:** backend vertical implemented (helper, two tables, RLS, `deliver_document` + `acknowledge_document_delivery`, embedded-Postgres coverage). API routes and portal UI are the follow-up slice.
**Date:** 2026-08-19

## Why this slice

"Document storage/version/**delivery/acknowledgement**" is a required Crecy OS surface (doc 10 §2) and the largest in-scope pilot gap still unbuilt: only `documents` + `document_versions` existed, so an operator could store a lease or notice but could not *deliver* it to a resident/owner or capture that they received it. Both tables (`public.document_deliveries`, `public.document_acknowledgements`), the `private.can_manage_document_version()` gate, and the two SELECT policies are already authoritative in docs 12/13 (and counted in the 76/59 authority totals) — no migration had ever created them. This slice brings the runtime chain in line with the authority and adds the two lifecycle commands (`AcknowledgeDocumentDelivery` is doc 14 §4.26; `DeliverDocument` is its producer).

## Implemented scope

- **`private.can_manage_document_version(uuid)`** — the document-scoped `documents.manage` gate doc 13 wires into the delivery/ack read policies, mirrored into the runtime in `search_path=''` style (semantically identical to the authority copy).
- **`public.document_deliveries` + `public.document_acknowledgements`** — created exactly per doc 12, `enable row level security`, `grant select … to authenticated` + `revoke insert,update,delete`, and the two doc-13 SELECT policies (recipient reads own rows; a `documents.manage` operator reads the ones they manage). Acknowledgements are append-only structurally — no update/delete grant, no correction command; a mistaken ack is superseded by a later ack of the right type (the table is unique per delivery+user+type).
- **`public.deliver_document(...)`** — operator posts a finalized (`upload_status='clean'`) version to a portal recipient resolved from their active `user_relationship`. Gates: `documents.manage` on the parent property (`PROPERTY_SCOPE_DENIED`/`DOCUMENTS_SCOPE_DENIED`), `UNSUPPORTED_DELIVERY_CHANNEL` (only `portal` this pilot — email/secure_link await a delivery worker, so no queued rows are minted that nothing processes), `DOCUMENT_VERSION_NOT_FOUND`, `DOCUMENT_NOT_DELIVERABLE`, `DELIVERY_RECIPIENT_NOT_FOUND`. Idempotent; one `document.delivered` audit (`actor_type='user'`) + outbox row.
- **`public.acknowledge_document_delivery(...)`** (§4.26) — the delivery's recipient records an acknowledgement. Gates: `DOCUMENT_DELIVERY_FORBIDDEN` (recipient-only), `INVALID_ACKNOWLEDGEMENT_TYPE`, `INVALID_EVIDENCE_HASH`, `DOCUMENT_DELIVERY_NOT_FOUND`. The duplicate-type guard (`DOCUMENT_DELIVERY_ALREADY_ACKNOWLEDGED`) depends on this command's own prior insert, so it is captured into a boolean right after the load and enforced **after** the idempotency short-circuit — a true replay returns the stored ack instead of tripping. Emits `document.acknowledged`.

## Architecture and controls

- **No authority-count change.** Both tables and both policies were already in docs 12/13; the migration only reproduces them in the runtime, so the 76/59 assertion is unchanged. The migration edits no shipped file and is forward-only.
- **Two read patterns kept honest.** Deliveries/acks are browser-readable base tables (doc 12 grants SELECT), so the RLS policies do real work — proven by a mutation test: relaxing `document_deliveries_self_or_manager_read` to `using(true)` fails the suite with exactly "An outsider read another member's document delivery or acknowledgements."
- **Writes flow only through the definer commands.** `revoke insert,update,delete` from `anon,authenticated`; the commands are `security definer` and stamp `organization_id`/recipient server-side. A recipient is always a real portal user (an active `user_relationship`), so every delivery has someone who can acknowledge it.

## Files

- `supabase/migrations/20260726110000_phase_2_document_delivery.sql`
- `docs/crecy-v4/14_P0_COMMAND_API_EVENT_CONTRACTS.md` (§4.26 Deliver/Acknowledge + `document.delivered` event)
- `docs/crecy-v4/17_P0_DATA_CONTRACT_TRACEABILITY_MATRIX.md` (Documents row)
- `scripts/validate-schema.mjs`

## Verification evidence

`npm run check` passes end-to-end: ESLint, TypeScript, 108 Vitest tests, the embedded-Postgres suite, and the production build. Authority counts stayed **76 tables / 59 policies**. `test:db` delivers a clean document version to an activated resident and asserts:

- **Deliver rejections** — `UNSUPPORTED_DELIVERY_CHANNEL` (email), `INVALID_DELIVERY_RECIPIENT` (null), `DOCUMENT_VERSION_NOT_FOUND`, `DOCUMENT_NOT_DELIVERABLE` (a quarantined version), `DELIVERY_RECIPIENT_NOT_FOUND` (relationship with no active user), and `PROPERTY_SCOPE_DENIED` (an outsider).
- **Acknowledge rejections** — `DOCUMENT_DELIVERY_FORBIDDEN` (a non-recipient), `INVALID_ACKNOWLEDGEMENT_TYPE`, `INVALID_EVIDENCE_HASH`, `DOCUMENT_DELIVERY_NOT_FOUND`, and `DOCUMENT_DELIVERY_ALREADY_ACKNOWLEDGED` (same type again with a fresh key).
- **Happy path + invariants** — delivery returns `status='delivered'` addressed to the resolved recipient; a distinct acknowledgement type (`viewed` after `received`) creates a separate ack; both deliver and both acks replay to the stored response; the recipient reads their own 1 delivery + 2 acks, an outsider reads 0/0 (**mutation-verified**), and the managing operator reads 1/2; one `document.delivered` + two `document.acknowledged` audits (`actor_type='user'`) mirrored to the outbox.

## Deferred / follow-up

- **API routes + portal UI.** No `api/*` route calls these commands yet; the operator "deliver document" action and the resident/owner "documents to acknowledge" surface (both reading the RLS-scoped base tables directly) are the next slice.
- **Non-portal channels.** `email`/`secure_link` deliveries need a real delivery worker (blocked on provider config, per CLAUDE.md) — only `portal` is wired.
- **Recipient↔document scope tightening.** Delivery authorizes on the operator's `documents.manage` and an active org relationship; binding the recipient to the document's own property/tenancy/owner scope is a follow-up hardening.
- **Revocation.** `document_deliveries.status` carries `revoked`, but no command sets it yet; a `revoke_document_delivery` command is a follow-up.
