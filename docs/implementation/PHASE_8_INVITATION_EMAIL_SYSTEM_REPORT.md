# Phase 8 — invitation activation and the transactional email system

**Migration:** `supabase/migrations/20260918120000_phase_8_invitation_email_delivery.sql` (additive),
plus a contract-release revoke in `supabase/migrations-contract/`. Neither has been applied to any
Supabase project; both are replayed by `npm run test:db`.

## The defect this started from

An invitation sent two emails and the one that mattered was a dead end.

`POST /api/v1/staff/invitations` queued a Crecy invitation message carrying a Crecy invitation token,
and then separately called `signInWithOtp` so Supabase would send its own magic-link email. Two messages
arrived, from two senders, in two visual languages, and the recipient had to open them in the right
order: the Crecy one was useless to anyone not already signed in, because accepting an invitation
requires a session the Crecy link does not create.

Underneath it was a second, worse problem. The route then called
`mark_staff_invitation_email_sent`, which set the notification job's status to `sent`. Nothing had been
sent. `signInWithOtp` had been *accepted by Supabase*, which is a different fact. The delivery state
the operator saw in the UI was therefore an assertion the system had no evidence for, and a failure
anywhere downstream of Supabase's accept was indistinguishable from a success.

## What replaced it

**One link, built by us.** Both invitation routes call `auth.admin.generateLink` and keep
`properties.hashed_token`. The worker assembles Crecy's own
`/auth/confirm?token_hash=…&type=magiclink&next=…` around it, `/auth/confirm` redeems it server-side
with `verifyOtp`, writes the session to cookies, and redirects to the acceptance path. One click signs
the recipient in AND accepts, and there is only one email.

`generateLink` *generates* — it sends nothing — which is what makes this safe: Crecy renders and sends
the only message.

**The action link is discarded, and the first version of this work was wrong to use it.** Review
caught it. `properties.action_link` is a Supabase-hosted `/auth/v1/verify` redirect, and an
admin-generated link carries no PKCE code_verifier, so GoTrue completes it in the **implicit flow**:
the session comes back as a URL *fragment*, never as `?code=`. A browser never sends a fragment to a
server. Crecy's `/auth/callback` reads `?code=` and calls `exchangeCodeForSession`, so it would have
found nothing and redirected every invited person to `/signup?auth_error=1`. The "one click" path
would have failed for everybody, silently, in the one place nobody tests by hand
(supabase/auth-js#767, supabase/supabase discussion #20937).

**`magiclink`, not `invite`.** Crecy's invitation routes create the auth user first, so at
`generateLink` time the address always exists. `type: "invite"` is the version-unstable path here
(supabase/supabase#22562: it began returning `user_not_found` for an existing user after GoTrue
v2.145.0); `magiclink` is stable for an address that exists. The reasoning is recorded in full in
`src/lib/auth/invitation-link.ts` rather than only in this report, because the next person to touch it
will be reading that file.

**Nothing a caller supplies decides where an invitation points.** The credential the payload carries
is an opaque token hash, never a URL, and it is attached by `public.attach_invitation_auth_token`,
which is granted to `service_role` alone.

This was the second review finding, and it was a real hole. The first version let the operator-callable
invite overloads take `p_auth_action_url`. Those functions are granted to `authenticated`, so any
operator with invite permission could have called them straight through PostgREST with a URL of their
choosing — and the Crecy worker would then have sent that URL to the invited person, under Crecy
branding, from a Crecy sending domain. A regex proving "https, no angle brackets" proves shape, never
provenance. The operator-callable overload now takes a *boolean* saying a credential is coming; the
worst it can do is delay its own invitation.

That boolean also closes a race the two-step version would otherwise have introduced. It defers the
job's `available_at` by two minutes — the worker's claim gate is `status='queued' and available_at <=
now()` — and the attach step sets it back to `now()` in the same statement that writes the credential.
There is no ordering in which the worker sees one without the other, and if the attach never happens
the invitation still goes out, carrying the bare acceptance link.

Using the token hash also removed a configuration hazard the previous version had to document as a
launch prerequisite: GoTrue's `redirect_to` allow-list no longer decides where an invited person
lands, because `redirect_to` is no longer sent. Crecy's own `safeRedirectPath` decides.

**The lie is gone.** `mark_staff_invitation_email_sent` and `mark_relationship_invitation_email_sent`
are revoked from `service_role` by the contract migration — they were only ever granted to
`service_role`, reached through `createAdminClient`, so revoking from `authenticated` would have been
a no-op. Nothing can mark a job `sent` any more except the notification worker, which does it only
after a mail transport has accepted the message. The two
`get_*_invitation_delivery_status` readers are deliberately kept: reading the truthful state is the
point. The routes now return `deliveryState: "queued"`, and the three invitation forms say the message
is queued rather than claiming it was sent.

**The credential is treated as one.** The token hash signs in whoever holds it, so it gets exactly the
handling the invitation token already had: private storage only, never in an audit payload, never in an
outbox event, never logged, never returned to a browser client. The migration's scrub trigger was
generalized from one hardcoded key to a list, so `authTokenHash` is removed from
`private.notification_jobs.payload` the moment the job reaches `sent`, `dead_letter` or `canceled` —
and NOT on `failed`, which is retryable and still needs the credential. A `test:db` assertion drives
each of those transitions and reads the payload back.

## The presentation system

Templates used to return a subject and a wall of prose, and the HTML renderer reconstructed the message
from it: a URL regex chose the call to action and whatever words preceded the colon became the button
label. Templates now declare what a message *is* — heading, paragraphs, detail rows, one call to
action, one security note — and both halves of the multipart message are generated from that one
description, so the text and HTML parts cannot drift.

All six transactional templates and all fourteen Supabase auth action types are written in English,
Spanish and French, chrome included: a Spanish body with an English footer is an English email with one
translated paragraph. Surface colours are quoted from `globals.css`, not invented — including the
distinction that Crecy Living's identity green `#01a065` is 3.38:1 on white and is used for the
wordmark, while the darker `#067647` carries white button text.

Copy claims only what exists. Resident invitations do not promise online payment, no message says an
uploaded file has been scanned, and a security notification ("your password was changed") renders **no
button at all** — training a recipient to click one on a message reporting a change is precisely how the
forged copy succeeds later.

## The Supabase Send Email Auth Hook — built, not enabled

`/api/internal/auth/send-email` renders Supabase's own authentication mail in Crecy's design.
Signature verification runs on the RAW body before it is parsed, under a dedicated secret; the body is
bounded; a credential in the query string is refused; no token reaches a log, a response body or a
provider idempotency key. An unconfigured secret returns **500**, not 401 — it is our fault, not a
forged request, and Supabase must retry rather than the operator chase a phantom signature problem.

Two things found while building it are worth recording:

* **`email_change` reverses its field names.** Supabase pairs `token_hash_new` with the **current**
  address and `token_hash` with the **new** one, for backward compatibility, and fires the hook once
  expecting two messages. The first implementation here read the names at face value: it emailed only
  the current address, with the hash that verifies the other one. Both addresses are now emailed, each
  with the hash that verifies *it*, under distinct provider idempotency keys — one shared key would have
  made the provider drop the second message as a duplicate of the first.
* **`reauthentication` has no `verifyOtp` type**, because it is verified with a typed code. It renders
  the code and no link. `VERIFY_OTP_TYPE` maps only the six action types that genuinely have one.

Turning the hook on is a deliberate production step, ordered in the launch runbook. Until then Supabase
keeps sending its defaults and nothing in this route runs.

`/auth/confirm` redeems the `token_hash` those messages carry. `type` is checked against the closed
`verifyOtp` set and `token_hash` is shape-checked before either reaches the auth client; `next` goes
through `safeRedirectPath`; the final redirect is built from the validated path and the request origin
**alone**, so the token never reaches the address bar, the referrer, or the next page's analytics. Every
rejection — wrong shape, wrong type, expired, superseded, wrong account — lands on one destination, so
the endpoint cannot be probed for which half of a credential was right.

## Verification

Command-verified, not asserted:

* `npm run lint`, `npx tsc --noEmit`, `npm run build` — clean.
* `npx vitest run` — the notification, auth-email, webhook-signature, hook-route and confirm-route
  suites, including a matrix over every template × language and every auth action type × language.
* `npm run test:db` — replays the new migration, drives both invitation commands with and without
  `p_auth_action_url`, asserts the enriched payload, asserts the credential is scrubbed on each terminal
  transition and retained on `failed`, and asserts the retired RPCs are no longer executable by
  `service_role`.
* `npx playwright test e2e/email-rendering.spec.ts` — nine fixtures rendered in a real browser at 320px
  and 600px: no horizontal overflow, no remote image or script, a ≥44px call-to-action target, a
  security notification with zero links, and a copyable URL that wraps.

The browser suite is not the whole visual pass. Reading the rendered fixtures with human eyes found a
defect every assertion had missed: because the plain-text `body` is a *complete* rendering of the
message, handing it to the HTML renderer alongside the structured fields printed the heading, the detail
rows and the security note **twice each** — once as prose recovered from the text, once as the element
they had been promoted to. Every assertion passed, because each only asked whether the content was
present. Templates now pass `paragraphs` (the prose alone) separately from `body` (the finished text
part), and there is a regression test that counts occurrences rather than checking presence.

## Three more corrections from the same review

**A delivered document pointed at a portal the recipient does not have.** For a non-secure-link
delivery the template built `link("/documents", "operator")` — the *resident* path on the *operator*
origin, a page that exists for nobody who receives that message. An owner's documents are at
`/owner/documents` on the owner origin; a vendor contact has no portal at all. The worker already
resolved the recipient's relationship, but *after* rendering, which was harmless while the audience
only decided the From line and became a bug the moment it also decided a link. The lookup now runs
before rendering, each audience gets its own portal, and a recipient with no portal gets no button —
a link that fails one click later is not an improvement on failing zero clicks later.

**The auth-hook secret instructions were wrong.** The runbook said `openssl rand -hex 32`. Supabase
hook secrets are Standard Webhooks symmetric keys shaped `v1,whsec_<base64>`, and the verifier
base64-decodes them; hex text is not that, so the signature would never have matched and every
authentication email would have failed with a 401 that looks exactly like an attack. The runbook now
says to copy the dashboard-generated value verbatim.

**"Queued" was where the operator's knowledge stopped.** More truthful than the old false "sent", and
still a dead end: a pending invitation whose mail dead-lettered will never be accepted and looked
identical to one sitting unread in an inbox. The retained read RPCs could not close it — they are
`service_role`-only and take a bare invitation id with no tenant predicate. So the staff workspace
projection gained a coarse `deliveryState` (`queued`/`sending`/`sent`/`retrying`/`undeliverable`/
`canceled`/`unknown`), and the team page now lists pending invitations with it — it did not list them
at all before, so the loop was wider open than the review said. The relay's own error text deliberately
does not travel: it answers a question the operator did not ask and cannot act on. All six states are
asserted end to end through the real projection in `test:db`.

## Not done, and deliberately so

* The hook is **not enabled** and production Supabase is untouched — no migration applied, no
  configuration changed.
* No Vercel deployment and no preview build. The branch's `git.deploymentEnabled: false` entry stands.
* `support@crecyos.com` and `support@crecyliving.com` are the default Reply-To addresses and are **not
  known to be monitored inboxes**. Both are overridable per audience. Confirming them is an external
  founder check, recorded in the runbook, not something code can settle.
* The production Supabase project ref could not be confirmed from here. The runbook named
  `alrirkvfcmhqumqaidxj`; the owner states production is `tbivpbbejttacfcqeqia`. The runbook now says
  the latter, but the Supabase credentials available to this environment belong to a different account
  and list neither ref, so it is recorded as owner-stated. The contradicting status line is flagged for
  re-verification rather than silently rewritten: it records an observation, and which database it was
  observed against is exactly what is unresolved.
