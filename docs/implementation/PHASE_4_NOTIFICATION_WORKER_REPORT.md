# Phase 4 — Transactional notification worker + off-portal document delivery

**Migrations:** `20260728100000_phase_4_notification_worker.sql`,
`20260728110000_phase_4_document_delivery_channels.sql` (forward-only; columns, functions, indexes,
and one trigger — no table and no RLS policy, so authority counts stay 76/59).

## The gap this closes

Commands across the app already enqueued `private.notification_jobs`; nothing ever drained the queue,
so no transactional message was ever sent. That also kept `deliver_document` `portal`-only even though
`document_deliveries` has always allowed `email` and `secure_link`.

## Worker surface (service_role only)

| Command | Behavior |
| --- | --- |
| `claim_notification_jobs(channel, limit, workerRunId)` | `FOR UPDATE SKIP LOCKED` queue pop, so N concurrent workers are disjoint. Terminally cancels preference-opted-out **category** mail before claiming. |
| `complete_notification_job(id, providerCode, providerMessageId)` | Marks `sent`, records an `accepted` receipt in `private.notification_deliveries`, idempotent on a duplicate completion. |
| `fail_notification_job(id, errorCode, retryable)` | Capped exponential backoff (`private.notification_retry_delay`, 1 min → 6 h) on a retryable verdict; dead-letters on a non-retryable verdict or an exhausted budget, with a `notification.deadLettered` system audit event. |
| `requeue_stalled_notification_jobs(stallMinutes)` | Recovers claims abandoned by a crashed worker. Reports only the **current run's** counts and audits stall-induced dead letters on the same footing as provider-reported ones. |

**Preference suppression applies to category mail only.** `private.notification_template_category`
maps invitations to a **NULL** category, so access/security mail can never be silenced by a preference
row — losing an invitation email would lock a user out of the product. `in_app` is never gated (the
preference table's own check constraint excludes it).

## No provider is invented

`api/internal/notifications/dispatch` sweeps stalled claims, claims a batch, renders each message
(`src/lib/notifications/templates.ts`, en/es/fr with an English fallback, plain text so a payload value
cannot smuggle markup), and POSTs it to an operator-configured relay
(`CRECY_NOTIFICATION_RELAY_URL` / `CRECY_NOTIFICATION_RELAY_SECRET`). The recorded provider code is the
neutral `"relay"`; the real vendor id is whatever the relay returns. **With no relay configured the
route reports 503 rather than pretending to deliver** — the same posture as the Stripe routes. A 4xx
from the relay is non-retryable (retrying an identical request cannot fix a bad address); 408/429/5xx
and network errors are retryable.

## Document delivery over email and secure_link

- **email** — the delivery row is created `queued`, never optimistically `delivered`, and a
  `document_delivered` job is enqueued.
- **secure_link** — additionally mints a one-time tokenized URL (1–720 h) the recipient opens without a
  portal account.

The worker's real outcome drives the delivery row through
`private.sync_document_delivery_on_notification`: a sent job advances it to `sent`; a dead-lettered or
preference-canceled job marks it `failed` with the reason. An operator never sees `queued` for a
message the system gave up on, and a resident who switched off document email does not silently lose a
legally significant document.

**Token custody.** The database mints the token and persists only its SHA-256 hash, mirroring the
invitation precedent, so the durable record can never mint a working link. The plaintext exists in
exactly two transient places — the command's own response (redacted from the stored idempotency body,
so a replay cannot re-read a one-time secret) and the in-flight job the worker needs to build the URL,
which the trigger scrubs the moment the job terminates. Entropy is two `gen_random_uuid()` draws folded
through `sha256`: core-only, because pgcrypto's `gen_random_bytes` cannot resolve under
`set search_path=''` without hard-coding an extension schema that differs between the embedded test
database and Supabase.

**Redemption** is anonymous by necessity — the recipient may have no account, so the token is the whole
credential. Exact match on a unique index, and every rejection (unknown, expired, revoked, unscanned)
returns one identical sentinel so the token space cannot be probed. The route returns storage
coordinates only and signs a 300 s URL.

## Verification

`npm run check` green. Mutation tests confirm the assertions are load-bearing — each of these fails the
suite on exactly its own assertion:

| Mutation | Caught by |
| --- | --- |
| Make invitations preference-suppressible | "did not claim both transactional emails while suppressing the opted-out category email" |
| Drop the stall-induced dead-letter audit | "stall-induced dead letter was not audited like a provider-reported one" |
| Persist the plaintext secure-link token | "delivery row must store the token hash, never the token" |
| Skip the terminal-state token scrub | "terminal job still holds the plaintext secure-link token" |
| Let a replay re-read the one-time token | "idempotent replay re-read a one-time secure-link token" |

## Status

**Implemented; environment-blocked for connected certification.** The queue mechanics are exhaustively
covered in embedded Postgres. End-to-end send certification needs a relay endpoint plus
`SUPABASE_SECRET_KEY`, the same class of external configuration as Stripe Connect.
