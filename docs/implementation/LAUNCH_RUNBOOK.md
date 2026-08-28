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
| Supabase | **`Property` / `alrirkvfcmhqumqaidxj`** — restored and `ACTIVE_HEALTHY`. Schema present, **no data**: 0 auth users, 0 organizations, 0 journal entries. |
| Migrations | **All 60 applied.** The 26-file expand step ran on 2026-08-28 and was verified against a local replay — see §2. |
| Providers | Scan relay, mail relay and Stripe Connect are all unconfigured. |

---

## 1. Environment variables

Set these on the Vercel project before the first production deploy. `NEXT_PUBLIC_*` values are inlined
into the client bundle at **build** time, so a value added after a build does not take effect until the
next one.

The Supabase project is **`alrirkvfcmhqumqaidxj`** ("Property"). Dashboard paths below are relative to
`supabase.com/dashboard/project/alrirkvfcmhqumqaidxj`.

### Required for the app to work at all

| Variable | Where to get it | If unset |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://alrirkvfcmhqumqaidxj.supabase.co` — Settings → API → Project URL | The whole app runs in demo/preview mode with hardcoded sample data |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Settings → API Keys → the `sb_publishable_…` key (not the legacy `anon` JWT, and never the secret key) | Same |
| `SUPABASE_SECRET_KEY` | Settings → API Keys → **Secret key** (`sb_secret_…`). Reveal once and store it in Vercel; never commit it | Invitation delivery and every worker route fail |
| `NEXT_PUBLIC_SITE_URL` | Your own deployed origin, no trailing slash. Also add it to Supabase → Authentication → URL Configuration → Redirect URLs, or email confirmation links will be rejected | Email confirmation and password links point at localhost |
| `NEXT_PUBLIC_MARKETING_ORIGIN` | Your own marketing origin | **Defaults to `https://crecy.com`.** A build served from a `*.vercel.app` domain advertises canonicals for a domain that does not serve it — set this on the first deploy even if the value is the vercel.app host |

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

Both `operator_terms` and `privacy_notice` ship as `state: "draft"` at `0.1.0-draft`, and organization
creation **fails closed in production** while they are drafts. This is intended: consent recorded
against an unpublished document is not evidence of anything.

Publishing is a professional human decision, not a code change to work around. When counsel approves
wording, add a new version to `src/lib/legal/documents/` with `state: "published"`. The content hash
covers the text as well as the identity, so an amended document can never masquerade as the version an
earlier operator accepted.

**Until this is done, no operator can create an organization on production.** It is the first hard
launch blocker.

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
1. **Legal documents are drafts.** No production organization can be created.
2. **`CRON_SECRET` is unset.** No rent generates, no mail sends, no document is ever scanned. The
   endpoints correctly return `401` rather than running unauthenticated — verified live.
3. **Scan relay unconfigured.** Every uploaded document stays quarantined and unusable.
4. **Mail relay unconfigured.** Invitations never arrive, so no resident or owner can be onboarded.
5. **Stripe unconfigured.** Online payments unavailable; manual recording still works, so this is the
   only one of the five a pilot could survive without.

There is also **no seeded operator** on the database — 0 auth users — so the connected E2E suite has
nothing to sign in as until one is created.
