# Crecy launch runbook

The ordered steps to get Crecy from a green branch to a deployment real pilot operators can use, and
the external gates that only a human with credentials can open.

This is a runbook, not a status report. Where a step depends on something Crecy does not have, it says
so and names what is missing rather than describing a workaround.

---

## 0. Where things stand

| | |
| --- | --- |
| Branch | merged to `main` via PR #35 (`89493ce`) |
| Gate | `npm run check` green |
| Deployed | **Yes, and it is live.** Vercel `property-management`, deployment `dpl_EvDTZdhG6yjq3yDGRi6X4gLZFEoa`, commit `89493ce`, target production, `READY`. Reachable at `property-management-six-plum.vercel.app`. |
| Deployed build state | **Setup mode.** No Supabase environment variables are set on the Vercel project, so every product screen renders preview data instead of the database. See §2 step 4. |
| Supabase | **`Property-management` / `tbivpbbejttacfcqeqia`** — `ACTIVE_HEALTHY`, verified through the connected Supabase API on 2026-09-18. Holds `public.invitations` and `private.notification_jobs`. At that check: 3 organizations, 3 notification jobs. The former `Property` / `alrirkvfcmhqumqaidxj` is **`INACTIVE`** and is not the production database; the "restored, no data" observation this line used to carry was made against it and no longer applies. |
| Migrations | **The Phase 8 invitation-email migration is NOT in the production ledger** as of 2026-09-18. Verify the ledger against the active project before applying anything — see the contract-release README for the required order. |
| Providers | Scan relay, mail relay and Stripe Connect are all unconfigured. |

---

## 1. Environment variables

Set these on the Vercel project before the first production deploy. `NEXT_PUBLIC_*` values are inlined
into the client bundle at **build** time, so a value added after a build does not take effect until the
next one.

The Supabase project is **`tbivpbbejttacfcqeqia`** ("Property-management"). Dashboard paths below are
relative to `supabase.com/dashboard/project/tbivpbbejttacfcqeqia`.

> This document previously named `alrirkvfcmhqumqaidxj` ("Property"). **Verified through the connected
> Supabase API on 2026-09-18:** `tbivpbbejttacfcqeqia` / `Property-management` is `ACTIVE_HEALTHY` and
> holds Crecy's `public.invitations` and `private.notification_jobs`; `alrirkvfcmhqumqaidxj` /
> `Property` is `INACTIVE`. Use the active project for every instruction in this runbook.

### Required for the app to work at all

| Variable | Where to get it | If unset |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://tbivpbbejttacfcqeqia.supabase.co` — Settings → API → Project URL | The whole app runs in demo/preview mode with hardcoded sample data |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Settings → API Keys → the `sb_publishable_…` key (not the legacy `anon` JWT, and never the secret key) | Same |
| `SUPABASE_SECRET_KEY` **or** `SUPABASE_SERVICE_ROLE_KEY` | Either works — the first *usable* one wins, and a `replace_me` placeholder counts as unset. `SUPABASE_SECRET_KEY` is Settings → API Keys → **Secret key** (`sb_secret_…`). `SUPABASE_SERVICE_ROLE_KEY` is the legacy JWT the Supabase↔Vercel integration provisions automatically, so a linked Vercel project already has it | Invitation delivery and every worker route fail |
| `NEXT_PUBLIC_SITE_URL` | The **operator application** origin — production `https://app.crecyos.com`, no trailing slash. Also add it to Supabase → Authentication → URL Configuration → Redirect URLs, or email confirmation links break. This is NOT the marketing origin | Auth callbacks, secure document links, transactional mail links and Stripe return URLs are built from `http://localhost:3000` |
| `NEXT_PUBLIC_LIVING_ROOT_DOMAIN` | `crecyliving.com` — the Crecy Living resident root. Community portals are `{community-slug}.crecyliving.com` | Resident absolute links fall back to the operator origin, which would send residents into Crecy OS |
| `NEXT_PUBLIC_MARKETING_ORIGIN` | The **marketing** origin — production `https://crecyos.com` | **Defaults to `https://crecyos.com`.** A build served from a `*.vercel.app` domain advertises canonicals for a domain that does not serve it. A malformed value now throws at module load rather than failing quietly |

`getPublicSupabaseConfig()` treats a value containing `your-project` or `replace_me` as absent, so a
half-filled variable degrades to demo mode rather than failing loudly. If the deployed app shows sample
data, that is the first thing to check.

### Required for scheduled work to run

| Variable | Where to get it | If unset |
| --- | --- | --- |
| `CRON_SECRET` | Generate it: `openssl rand -hex 32`. Vercel sends it to cron routes automatically as `Authorization: Bearer $CRON_SECRET` — you never call them yourself | **Every `/api/internal/cron/*` route stays closed.** Rent is never generated, no mail is drained, no document is ever scanned. The routes do not degrade to open — an unset or `replace_`-prefixed secret authenticates nothing |
| `CRECY_INTERNAL_WORKER_SECRET` | Generate it: `openssl rand -hex 32`. Deliberately separate from `CRON_SECRET` so a leaked scheduler credential does not also open the manual surface | Manual worker invocation is closed |

### Required for each provider

| Variable | Where to get it | If unset |
| --- | --- | --- |
| `CRECY_DOCUMENT_SCAN_RELAY_URL` + `_SECRET` | Your scanning service's endpoint; the secret is yours to generate and share with it | The scan route reports **503** and every uploaded document stays `quarantined` — unusable, which is the safe direction |
| `CRECY_NOTIFICATION_RELAY_URL` + `_SECRET` | Your mail relay's endpoint; the secret is yours to generate and share with it | The notification route reports **503**; jobs queue and are never sent |
| `RESEND_API_KEY` | Resend → API Keys. Also verify both sending domains — see *Transactional email* below | The bundled relay reports **503**; no invitation or notification is delivered |
| `SUPABASE_AUTH_HOOK_SECRET` | **Copy it from Supabase → Authentication → Hooks**, which generates it. Do NOT invent one — see *Transactional email* below for the format, which is not a plain random string | The Send Email Auth Hook answers **500**. Harmless while the hook is disabled; stops all authentication mail once it is enabled |
| `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` | Stripe dashboard → API keys (`sk_test_…`), and Developers → Webhooks → your endpoint → signing secret (`whsec_…`) | Payment routes report 503; manual payment recording still works |

### Optional

`STAFF_INVITATION_TOKEN_SECRET` and `RELATIONSHIP_INVITATION_TOKEN_SECRET` are dedicated HMAC secrets
for invitation tokens. Omit them and `SUPABASE_SECRET_KEY` is used instead, which works; set them
(`openssl rand -hex 32` each) if you want invitation tokens to survive a rotation of the Supabase key.

### Deliberately not set

`CRECY_DEPLOYMENT_ENV` — Vercel sets `VERCEL_ENV` automatically and `production` always wins. An
unlabeled build is treated as production and fails closed. Setting this to anything other than
`production` **relaxes the legal-consent gate**, so it must never appear on a real deployment.

---

## 1b. Domains — five distinct states, do not conflate them

A domain is not live because the code knows its name. Track each independently:

| Domain | Purpose | Code configured | Added to Vercel | DNS verified | TLS active | Prod smoke-tested |
| --- | --- | --- | --- | --- | --- | --- |
| `crecyos.com` | Public Crecy marketing (canonical) | yes | yes | yes | yes | **no** |
| `www.crecyos.com` | 308 → `https://crecyos.com` | yes | yes | yes | pending | **no** |
| `app.crecyos.com` | Crecy OS operator app / auth entry | yes | yes | yes | yes | **no** |
| `crecyliving.com` | Crecy Living resident root | yes | yes | yes | yes | **no** |
| `*.crecyliving.com` | `{community-slug}` resident portals | partial | yes | pending | pending | **no** |
| `owner.crecyos.com` | Crecy Owner portal | yes | yes | yes | yes | **no** |
| `vendor.crecyos.com` | Future Crecy Vendor surface | no | **no** | no | no | no |

`crecy.com` and its subdomains are not owned and are not canonical product domains (FD-037).

### Supabase Auth — required after the domains resolve

Supabase → Authentication → URL Configuration:

- **Site URL:** `https://app.crecyos.com` — the operator app, not the marketing site.
- **Redirect URLs:** add only the callbacks the flows actually use, e.g. `https://app.crecyos.com/auth/callback`
  and `https://owner.crecyos.com/auth/callback`. Do not add a broad wildcard for operator/auth callbacks.
- **Resident community callbacks.** Supabase supports wildcard redirect patterns; use the narrowest one the
  flow actually needs. Prefer a single-label subdomain plus the exact callback route —
  `https://*.crecyliving.com/auth/callback` — over an all-path globstar like
  `https://*.crecyliving.com/**`, which would accept any path on any community host. The wildcard covers
  ONE label only, which is the same shape the host classifier enforces (`a.b.crecyliving.com` is not a
  community). Do not widen the operator/owner callbacks to accommodate residents.

### Transactional email — required before any invitation is sent

Nothing in this section is performed by the code. Each item is a console change a human makes, and
until then invitations queue and are never delivered.

**1. Resend.** `RESEND_API_KEY` (Resend → API Keys). Verify the two sending domains and add their DNS
records:

| Sending domain | Sends as | Used for |
| --- | --- | --- |
| `mail.crecyos.com` | `Crecy <notifications@mail.crecyos.com>` / `Crecy Owner <notifications@mail.crecyos.com>` | operator and owner mail |
| `mail.crecyliving.com` | `Crecy Living <notifications@mail.crecyliving.com>` | resident mail |

Two domains rather than one is deliberate: resident mail links to `crecyliving.com`, and a From domain
that disagrees with the link domain reads as phishing to both the recipient and the receiving filter.
Override either identity with `CRECY_MAIL_FROM_OPERATOR` / `_RESIDENT` / `_OWNER` if the addresses
change; the defaults above apply when they are unset.

**2. Turn OFF Resend click and open tracking** for both domains. Tracking rewrites every href through a
tracking domain, and an authentication link that arrives pointing at a redirector is both less likely to
survive a mail filter and impossible for a recipient to check before clicking. This is the single
setting most likely to break sign-in while appearing to work.

**3. Reply-To.** Defaults to `support@crecyos.com` (operator, owner) and `support@crecyliving.com`
(resident), overridable per audience with `CRECY_MAIL_REPLY_TO_OPERATOR` / `_RESIDENT` / `_OWNER`.
**Neither inbox is known to be monitored — this is an external check for the founder, not a code
change.** Confirm each address receives mail and is read, or set the overrides to an address that is,
before the first invitation goes out. A Reply-To that bounces is worse than none: it tells a recipient
their reply was received when it was not.

**4. The relay.** `CRECY_NOTIFICATION_RELAY_URL` = `https://app.crecyos.com/api/internal/notifications/relay`
and `CRECY_NOTIFICATION_RELAY_SECRET` = `openssl rand -hex 32`. The worker embeds no mail vendor; it
POSTs rendered messages to this URL, which is why the vendor stays swappable.

**5. Supabase redirect allow-list — a hard prerequisite, not a nicety.** Invitation delivery calls
`auth.admin.generateLink`, and GoTrue validates the requested `redirect_to` against
Authentication → URL Configuration → Redirect URLs. A destination that is not on the list is **not
rejected** — it is silently replaced with the Site URL. The failure therefore looks like "the link
works but lands on the wrong page", with nothing in any log to say why. Every acceptance path an
invitation can name must be on that list before invitations are sent.

**6. The Send Email Auth Hook — built, deliberately NOT enabled.** `/api/internal/auth/send-email`
renders Supabase's own authentication mail (sign-in links, password resets, email change, the security
notifications) in Crecy's design instead of Supabase's defaults. Enabling it is a production step to
take **after** the deployed URL has been verified, in this order:

  1. In Supabase → Authentication → Hooks, generate the Send Email Hook secret and copy it **verbatim**
     into `SUPABASE_AUTH_HOOK_SECRET` on Vercel, then deploy. The route answers **500** until it is set
     — an unconfigured secret is our fault, not a forged request, so it fails loudly rather than
     looking like a rejection.

     **Do not generate this one yourself.** It is a Standard Webhooks symmetric key and looks like
     `v1,whsec_<base64>`; the verifier base64-decodes the part after `whsec_` to get the signing bytes.
     An earlier version of this runbook said `openssl rand -hex 32`, which is the wrong shape: hex text
     is not the base64 the two sides must agree on, so the signature would never match and every
     authentication email would fail with a 401 that looks exactly like an attack. The verifier accepts
     the value with or without the `v1,` prefix, so pasting what the dashboard shows is safe.
  2. Confirm `https://app.crecyos.com/api/internal/auth/send-email` responds (a 401 to an unsigned POST
     is the correct answer and proves the route is live).
  3. Supabase → Authentication → Hooks → Send Email Hook → HTTPS endpoint, same URL, same secret.
  4. Send yourself one password reset and read it before enabling anything else.

  Until step 3, Supabase keeps sending its own default templates and nothing in this route runs.
  Turning the hook on with a wrong or missing secret does not degrade to the defaults — it stops
  authentication mail entirely, because Supabase reads the non-2xx as "not sent".

**Reviewing the templates without sending mail:** `/dev/email-preview/<fixture>` renders the nine
representative messages. It 404s in production and on any unlabeled deployment; see
`src/lib/notifications/email-fixtures.ts` for the fixture ids and for why the category messages need
the origin variables set to render their button.

### Stripe — required after the domains resolve

- Connect onboarding return/refresh URLs resolve through `NEXT_PUBLIC_SITE_URL`, so they follow
  `https://app.crecyos.com` once that variable is set in production.
- Resident payment return URLs currently also derive from `NEXT_PUBLIC_SITE_URL`. That sends residents to the
  operator origin. See the launch blockers section — this is an origin-construction defect, not an accounting one.

## 2. Deploy order — this ordering is not optional

Every migration in `supabase/migrations/` is additive and safe to apply at any time. The one in
`supabase/migrations-contract/` is not: it revokes `EXECUTE` on surfaces the *currently deployed* code
still calls with no arguments. Applying it before the compatible build is live takes operator screens
down with `permission denied`.

1. **Restore the Supabase project** if it has auto-paused again. Free-tier organizations allow only
   **2 active projects** and `couranr-market` (a different product, with real users) occupies one, so
   restoring Crecy may require pausing the empty `Property-management` project first.
2. **Expand — DONE.** All 26 pending files were applied in timestamp order, and the ledger versions
   were corrected to match the filenames (`apply_migration` stamps wall-clock time, which would have
   made `supabase db push` try to re-run every one of them).

   **How it was verified.** The MCP tool takes SQL as a parameter, so the statements passed through an
   agent rather than a file handle. A syntax error would surface loudly, but "loudly" is not a
   verification, so `scripts/schema-inventory.mjs` replays all 60 migrations into in-memory Postgres
   and prints a canonical object inventory; the same query was run against the live database and the
   two were diffed:

   | | local replay | live | verdict |
   |---|---:|---:|---|
   | tables (with columns) | 78 | 78 | identical |
   | RLS policies | 63 | 63 | identical |
   | triggers | 43 | 43 | identical |
   | constraints | 1504 | 799 | explained — see below |
   | indexes | 350 | 351 | +1, the orphan's index (§6) |
   | functions | 296 | 260 | explained — see below |

   The constraint gap is exactly 705, and the live database reports exactly **705 not-nullable columns
   with 0 `pg_constraint` rows of type `n`**: PostgreSQL 17.6 does not catalogue NOT NULL as constraint
   rows, while the newer engine PGlite embeds does. Every NOT NULL is present. The function gap is
   extension placement — pgcrypto and citext install into `public` in PGlite and into `extensions` on
   Supabase — plus the single orphan function in §6. **Nothing in the diff is a missing or altered
   object.**
3. **Deploy the application build** from this branch.
3a. **Deployed on 2026-08-28 and verified as far as it can be.** What was checked against the live
   host, and what each check proves:

   | check | result |
   |---|---|
   | `/`, `/product`, `/pricing`, `/crecy-living`, `/security`, `/pilot` | all `200`, correct `<title>` per page |
   | `robots.txt`, `sitemap.xml` | served; authenticated prefixes disallowed, marketing routes listed |
   | cache boundary | marketing pages `public, max-age=0, must-revalidate` + `x-vercel-cache: HIT`; `/login` and `/app` `private, no-cache, no-store` |
   | all four `api/internal/cron/*` unauthenticated | `401 A valid scheduler credential is required.` |
   | same, with a forged `Authorization: Bearer` | `401` — the forged secret is not accepted |
   | `documents/scan/dispatch`, `notifications/dispatch`, `charge-schedules/generate` | `401 A valid internal worker credential is required.` |
   | Stripe webhook | `503 WEBHOOK_NOT_CONFIGURED` |

   The cron result is the one worth pausing on: `CRON_SECRET` is **unset** on the project, and the
   endpoints still refuse. Unconfigured fails closed in production, not open.

4. **Verify the deployed build actually calls the scoped RPCs** — **BLOCKED, and this is the current
   blocker.** `/app` on the live host renders `mode === "setup"` ("Connect Supabase to activate this
   workspace"), which `getPublicSupabaseConfig()` returns only when the public Supabase env is absent;
   no Supabase host appears anywhere in the served client chunks, and `NEXT_PUBLIC_*` values are inlined
   at build time, so this is not a runtime lookup that could still succeed. Until §1's variables are set
   **and the project is rebuilt**, no screen on the deployed build reaches the database, so there is
   nothing to observe calling the scoped RPCs. This is the step that makes the contraction safe, so:
   **do not apply the contraction migration yet.**
5. **Contract.** Only now apply
   `supabase/migrations-contract/20260828130000_phase_8_close_unscoped_operator_surfaces.sql`.
6. **Smoke again immediately.** A contraction is the step most likely to surface a caller nobody knew
   about, and the window to notice it is right after it runs.

Steps 2–4 are repeatable. Step 5 is not undoable by re-running anything — restoring a grant needs a new
forward migration.

See `supabase/migrations-contract/README.md` for why the file lives outside the migration path.

---

## 3. Publishing the legal documents

`operator_terms` and `privacy_notice` are **published** at `1.0.1`, effective 2026-09-18, and
`esign_consent` at `1.0.0`, effective 2026-09-04. Organization creation is no longer blocked by the
publication gate. That gate remains live: creation **fails closed in production** whenever a required
document is not published, because consent recorded against an unpublished document is not evidence of
anything.

Publishing is a professional human decision, not a code change to work around. When counsel approves
new wording, add a **new version** to `src/lib/legal/documents/` with `state: "published"` and move the
version it replaces into `src/lib/legal/documents/archive/`. Never edit a published artifact in place:
the content hash covers the text as well as the identity, so an amended document can never masquerade
as the version an earlier operator accepted, and the archived copy is what lets a stored consent record
still be checked against the bytes that were actually shown. `registry.test.ts` pins each archived
artifact's hash, so an accidental edit fails the suite.

Versions 1.0.0 of the Terms and the Privacy Notice went out with placeholder `@crecy.example` contact
addresses; 1.0.1 carries `legal@crecyos.com` and `privacy@crecyos.com`. 1.0.1 also removes two
statements about pilot capabilities that are not active: the Terms offered portals to vendors
(`vendor.crecyos.com` is a future surface, so no operator can give a vendor access), and the Privacy
Notice listed "scan uploaded files" among what service providers do (malware scanning is deliberately
off for the controlled pilot) and named a vendor among the people who can see a record. Those are
corrections of fact, not changes to any obligation, and nothing was added. The three legacy
`consent_records` rows carrying `legal_document_version = "2026-07-20"` predate the registry entirely
and are deliberately left alone — they are an honest record of what was
stored at the time, and rewriting them would invent evidence rather than correct it.

---

## 4. Provider activation

Each of these is an account someone has to open. None can be invented, and no code changes when they
arrive — the abstractions already exist and report 503 without credentials.

- **Document scanning.** Stand up or subscribe to a scanning service, point
  `CRECY_DOCUMENT_SCAN_RELAY_URL` at it. It must accept the stored bytes and answer
  `{"verdict":"clean"|"infected","reference":"..."}`. Anything else is treated as a failed attempt and
  the document returns to quarantine.
- **Transactional mail.** Point `CRECY_NOTIFICATION_RELAY_URL` at a sending service. The worker POSTs
  rendered messages; it does not embed a vendor SDK.
- **Stripe Connect.** Test-mode keys plus a webhook endpoint signing secret.

---

## 5. The connected launch journey

Once the project is restored, the build is deployed and the providers above are configured, run the one
comprehensive journey end to end against the live environment:

anonymous marketing visit → pricing → signup → bound legal consent → organization creation →
entity/book/property → occupied tenancy or import → document upload → real scan lifecycle → recurring
charge generation through the scheduler → resident activation → resident balance → Stripe test payment →
webhook and accounting → transactional notification → maintenance → owner statement → organization
switch isolation.

This is the primary launch smoke. Add tests only where it reveals an actual defect, or where a critical
invariant turns out to have no protection.

---

## 6. Known database drift

`supabase_migrations.schema_migrations` records **`20260725020649_phase_8_payment_csv_export`**, which
exists on no branch of record — it was added by `e8ad10c` on `origin/codex/phase-8-payment-csv-export`,
which never merged, and applied to the database anyway. The live schema therefore carries
`public.get_operator_payment_export`, a function the shipped codebase never calls.

It is harmless — an orphan with no caller — and it is left in place deliberately: removing it is a
contraction, and contractions get the ordering discipline in §2 rather than a convenient drop. It is
recorded here so the next person who diffs the schema against the repo is not surprised by it.

---

## 7. Launch blockers, in the order they block

0. **The deployed build has no Supabase environment variables.** This blocks every blocker below it:
   the live product is serving preview data, no screen reaches the database, and nothing about the
   deployed build's data path can be observed. `NEXT_PUBLIC_*` is inlined at build time, so setting the
   variables is not enough — the project must be **redeployed** afterwards. Verified live 2026-08-28.
1. **Legal documents — cleared.** `operator_terms` and `privacy_notice` are published at 1.0.1 and
   `esign_consent` at 1.0.0 (§3), so this no longer blocks organization creation. The gate itself stays
   live: creation fails closed again if a required document ever returns to draft.
2. **`CRON_SECRET` is unset.** No rent generates, no mail sends, no document is ever scanned. The
   endpoints correctly return `401` rather than running unauthenticated — verified live.
3. **Scan relay unconfigured.** Every uploaded document stays quarantined and unusable.
4. **Mail unconfigured.** `RESEND_API_KEY` plus the two verified sending domains plus
   `CRECY_NOTIFICATION_RELAY_URL`/`_SECRET`. Invitations never arrive, so no resident or owner can be
   onboarded. Two things travel with this one and are easy to forget because neither produces an error:
   Resend **click tracking must be off**, or every authentication link arrives rewritten through a
   redirector; and each invitation acceptance path must be on the Supabase **redirect allow-list**, or
   GoTrue silently substitutes the Site URL and the link lands on the wrong page. Reply-To defaults to
   `support@crecyos.com` / `support@crecyliving.com`, **neither of which is known to be a monitored
   inbox** — confirm or override before the first invitation.
5. **Stripe unconfigured.** Online payments unavailable; manual recording still works, so this is the
   only one of the five a pilot could survive without.

There is also **no seeded operator** on the database — 0 auth users — so the connected E2E suite has
nothing to sign in as until one is created.
