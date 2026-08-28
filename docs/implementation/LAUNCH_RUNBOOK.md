# Crecy launch runbook

The ordered steps to get Crecy from a green branch to a deployment real pilot operators can use, and
the external gates that only a human with credentials can open.

This is a runbook, not a status report. Where a step depends on something Crecy does not have, it says
so and names what is missing rather than describing a workaround.

---

## 0. Where things stand

| | |
| --- | --- |
| Branch | `claude/mvp-progress-assessment-axvajc`, PR #35 (draft) |
| Gate | `npm run check` green |
| Deployed | **Nothing.** No Crecy build has been deployed anywhere. |
| Supabase | The project is **paused**. Every migration call times out until it is restored. |
| Providers | Scan relay, mail relay and Stripe Connect are all unconfigured. |

---

## 1. Environment variables

Set these on the Vercel project before the first production deploy. `NEXT_PUBLIC_*` values are inlined
into the client bundle at **build** time, so a value added after a build does not take effect until the
next one.

### Required for the app to work at all

| Variable | Why | If unset |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL | The whole app runs in demo/preview mode with hardcoded sample data |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser key | Same |
| `SUPABASE_SECRET_KEY` | Server-side admin authority for workers and invitations | Invitation delivery and every worker route fail |
| `NEXT_PUBLIC_SITE_URL` | Auth callback origin | Email confirmation and password links point at localhost |
| `NEXT_PUBLIC_MARKETING_ORIGIN` | Canonical URLs, Open Graph, sitemap, robots host | **Defaults to `https://crecy.com`.** A build served from a `*.vercel.app` domain advertises canonicals for a domain that does not serve it — set this on the first deploy even if the value is the vercel.app host |

### Required for scheduled work to run

| Variable | Why | If unset |
| --- | --- | --- |
| `CRON_SECRET` | Vercel Cron sends it as `Authorization: Bearer $CRON_SECRET` | **Every `/api/internal/cron/*` route stays closed.** Rent is never generated, no mail is drained, no document is ever scanned. The routes do not degrade to open — an unset or `replace_`-prefixed secret authenticates nothing |
| `CRECY_INTERNAL_WORKER_SECRET` | The manual/operator worker surface, separate from cron | Manual worker invocation is closed |

### Required for each provider

| Variable | Opens | If unset |
| --- | --- | --- |
| `CRECY_DOCUMENT_SCAN_RELAY_URL` + `_SECRET` | Document scanning | The scan route reports **503** and every uploaded document stays `quarantined` — unusable, which is the safe direction |
| `CRECY_NOTIFICATION_RELAY_URL` + `_SECRET` | Transactional mail | The notification route reports **503**; jobs queue and are never sent |
| `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` | Online payments | Payment routes report 503; manual payment recording still works |

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

1. **Restore the Supabase project.** It is paused; nothing below works until it is running.
2. **Expand.** Apply everything in `supabase/migrations/` in timestamp order. 60 files; the live
   project was last seen at 52, so the Batch A and A.1 migrations are the delta. Additive — the
   currently deployed code is unaffected.
3. **Deploy the application build** from this branch.
4. **Verify the deployed build actually calls the scoped RPCs** — not merely that it built. Open the
   operator dashboard, properties, documents and search on the deployed URL and confirm they return
   data. This is the step that makes the contraction safe.
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

## 6. Launch blockers, in the order they block

1. **Supabase project is paused.** Nothing else can proceed.
2. **Legal documents are drafts.** No production organization can be created.
3. **`CRON_SECRET` is unset.** No rent generates, no mail sends, no document is ever scanned.
4. **Scan relay unconfigured.** Every uploaded document stays quarantined and unusable.
5. **Mail relay unconfigured.** Invitations never arrive, so no resident or owner can be onboarded.
6. **Stripe unconfigured.** Online payments unavailable; manual recording still works, so this is the
   only one of the six a pilot could survive without.
