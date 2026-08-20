# Phase 2 Progress Report — Document Delivery API + Recipient Portal

**Status:** consumer slice implemented (recipient-read RLS, validation, two API routes, recipient data layer, resident + owner portal pages, embedded-Postgres + Vitest coverage). The operator "deliver" recipient-picker UI is the remaining follow-up.
**Date:** 2026-08-19

## Why this slice

The prior slice shipped the `deliver_document` / `acknowledge_document_delivery` commands and the delivery/acknowledgement tables but no HTTP surface or portal UI. This wires the consumer side so a resident/owner can **see** documents delivered to them and **acknowledge receipt** from their portal, and exposes the deliver command over the public API.

## The RLS gap this closes

Delivering a document was only half-useful because the recipient still couldn't *read* it: `documents_scoped_read` admitted a property-scoped operator or a tenancy resident, but an operator-delivered **property-scoped** notice (no `tenancy_id`) was invisible AND undownloadable to the very resident/owner it targeted (the signed-URL download route reads `document_versions` under the same RLS). This slice extends `documents_scoped_read` with a "delivered to me" clause, routed through a **security-definer helper** (`private.is_document_delivery_recipient`) rather than an inline subquery — an inline `document_versions` reference recurses because `document_versions_parent_read` references `documents`; the definer helper resolves the delivery with RLS bypassed, exactly like the other `private.*` gates in that policy. Same policy name, so the authority policy count is unchanged (76/59).

## Implemented scope

- **`private.is_document_delivery_recipient(uuid)`** + the `documents_scoped_read` "delivered to me" clause (migration `20260726120000`; mirrored into doc 13). Grants a recipient read on exactly the documents delivered to them — so both the embedded-join portal reads and the existing `/api/v1/documents/{id}/download` route now work for them.
- **Validation** (`src/lib/validation/documents.ts` + tests) — `deliverDocumentSchema` (portal-only channel default, resident/owner recipient types, uuid ids) and `acknowledgeDocumentDeliverySchema` (typed acknowledgement, 8–200 char evidence hash).
- **API routes** — `POST /api/v1/document-deliveries` (deliver) and `POST /api/v1/document-deliveries/{deliveryId}/acknowledgements` (acknowledge), each `safeParse → 400`, `getUser → 401`, and a sentinel→HTTP error ladder (scope→403, not-found→404, already-acknowledged/conflict/in-progress→409, unscanned/channel/validation→422).
- **Recipient data layer** (`getRecipientDocumentDeliveries`) — RLS-scoped read of `document_deliveries` embedding the delivered version + document and the caller's own acknowledgements, with a `mode` union and preview data.
- **Portal UI** — a resident `/documents` page and an owner `/owner/documents` page (sharing the fetcher and a client `DocumentAcknowledgeForm`) listing each delivery with its acknowledgement state, a download link, and an "Acknowledge receipt" action (submits `received` with the document's `sha256_hex` as the evidence hash; idempotency key reset on any HTTP failure). Wired the resident home's placeholder "Documents" card to `/documents` and added an owner-home "Documents" card.

## Verification evidence

`npm run check` passes end-to-end: ESLint, TypeScript, **112 Vitest** tests (4 new delivery/acknowledgement schema tests), the embedded-Postgres suite, and the production build. Authority stayed **76 tables / 59 policies**. `test:db` asserts the new access boundary after delivering a property-scoped document to an activated resident:

- The recipient can now read exactly the **delivered** document + version (`delivered_doc=1`, `delivered_version=1`), but **not** a property-scoped document never delivered to them (`undelivered_doc=0`); an outsider reads neither.
- **Mutation-verified**: forcing `is_document_delivery_recipient` to `false` fails the suite on exactly "Delivery did not grant the recipient read on exactly the delivered document" — and on no earlier assertion, proving the pre-existing operator/resident visibility doesn't depend on this clause and the clause is precisely what grants recipient access.

## Deferred / follow-up

- **Operator deliver UI.** The deliver command is live over the API, but the operator "deliver this document to a recipient" control (with a property-scoped resident/owner recipient picker) on `/app/documents` is the next slice — it needs an eligible-recipient query the operator page doesn't fetch yet.
- **Non-portal channels** (`email`/`secure_link`) still await a delivery worker; **delivery revocation** (`document_deliveries.status='revoked'`) has no command yet.
- **Richer acknowledgement types.** The portal records `received`; explicit `accepted`/`declined` flows for documents that require a decision are a follow-up.
