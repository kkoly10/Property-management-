# v4.2 Batch A + A.1 — checkpoint report

> **Batch A.1 is reported separately below (§16).** Batch A's own record is preserved unchanged
> above it, including every defect the adversarial review found, so the two can be judged apart.

Reported in the fields file 27 §15 requires. **Nothing here is a claim that the product, the pilot or
the launch is complete.** External gates are stated as gates, not converted into success.

---

## 1. SHAs

| | |
| --- | --- |
| **Working head** | `460f019` (branch `claude/mvp-progress-assessment-axvajc`, PR #35) |
| **Batch A base** | `13b01f4` |
| **`origin/main`** | `6eaf5b0` |
| **Head vs main** | 23 commits ahead, 0 behind |

Batch A is the last 8 commits: `f8f748e` (A1), `c4536ed` (A2), `c836289` + `6ec4cec` (A3),
`4c34c7d` (A4), `dd09ce1` (deploy-ordering split), `e13edcc` (this report), `9c166e7` (review
corrections).

## 2. Files and migrations added

**109 files changed, +7,918 / −331** since `13b01f4`, of which A.1 is the last two commits.

**Nine migrations, none applied to the live project — eight additive, one contraction:**

| Migration | Adds |
| --- | --- |
| `20260828100000_phase_2_document_scan_lifecycle.sql` | `private.document_scan_jobs` + 4 `service_role` worker RPCs; redefines `finalize_document` to enqueue |
| `20260828110000_phase_4_runtime_scheduler.sql` | `list_due_charge_schedule_batches`, `sweep_expired_operational_records`, 2 `private` helpers |
| `20260828120000_phase_8_active_organization_context.sql` | `list_operator_organizations`, context gate, 3 narrowed helpers, 20 scoped RPC wrappers, reproduced global search — **additive** |
| `20260828140000_phase_8_batch_a_review_corrections.sql` | narrows `is_active_org_member`; rebuilds the batch selector with per-schedule health and pair-based run ids |
| `20260829100000_phase_1_organization_creation_boundary.sql` | **A.1** — `create_organization_as_actor` (service_role, trusted actor); `private.growth_trial_length()` = 30 days |
| `20260829110000_phase_2_scan_recovery_and_tracing.sql` | **A.1** — `retry_document_scan`; one correlation id per scan verdict |
| `20260829120000_phase_8_relationship_projections.sql` | **A.1** — `get_relationship_conversation_workspace`, `get_relationship_privacy_request_workspace` |
| `20260829130000_phase_8_runtime_diagnostics.sql` | **A.1** — `support_get_runtime_diagnostics`, `private.safe_failure_code` |
| **CONTRACT** `migrations-contract/20260828130000_…close_unscoped_operator_surfaces.sql` | 14 `revoke execute` — **outside the ordinary migration set**, see §16 |

Authority counts: **77 tables / 59 policies** (was 76/59 — `private.document_scan_jobs` is the one new
table, added to doc 12).

New app modules: `src/lib/runtime/*` (7), `src/lib/organization/*` (3), `src/lib/legal/*` (5),
`src/lib/documents/scanner.ts`, 4 cron routes, 2 public `/legal` routes, 2 shell components,
`vercel.json`, `scripts/check-schedule.mjs`.

## 3. Product workflows passed

`npm run check` green end to end: ESLint, TypeScript, **257 Vitest tests / 45 files**, embedded-Postgres
`test:db`, `schedule:check`, `migrations:check`, production build. **58/58 demo Playwright tests.**

Newly proven in `test:db` against real RPCs:

- **Scan lifecycle** — the three cases file 27 §5.A1 names: quarantined → scanning → clean → downstream
  use succeeds; rejected → downstream use stays blocked; a stale or cross-version digest cannot clean
  another object. Plus `service_role`-only grants, claim concurrency, verdict idempotency and conflict,
  backoff, dead-letter + audit, stall sweep.
- **Rent time zones** — EDT/PDT/HST across UTC midnight and a month boundary; at `2026-09-01T06:00Z`
  only New York is due, and the Los Angeles charge lands on its own local date in both `charges.due_date`
  and `journal_transactions.effective_date`.
- **Organization isolation** — a real second organization for the same operator; ten audited surfaces
  return the owning organization's rows and **zero** in the other; revoked and expired memberships stop
  working on the next call; the context never outlives its statement.
- **The review corrections** — a healthy schedule is charged despite a misconfigured neighbour in the
  same zone; two arrears periods clear on one local date while an unchanged due set still replays; the
  privacy workspace offers exactly the organization it was scoped to.

**Mutation testing:** 30 mutations across the nine migrations. 28 caught. The 2 survivors are
*equivalent mutants* — redundant SHA checks in `complete_document_scan`, where either alone rejects a
mismatch and removing **both** is caught.

## 4. Runtime workflows passed

**None on a real deployment.** The schedule is defined, verified against shipped routes by
`schedule:check`, and rendered into `vercel.json`, but **no cron has ever fired**, because `vercel.json`
does not exist on `main` and Batch A is not merged.

`schedulers: configured, not exercised.`

## 5. Public marketing pages passed

**Not applicable — Batch B, not started.** The only public pages added here are `/legal` and
`/legal/[documentSlug]`, which pass 7 browser tests.

## 6. Legal documents

| Document | State |
| --- | --- |
| `operator_terms` v0.1.0-draft | **draft** |
| `privacy_notice` v0.1.0-draft | **draft** |

`published: 0 · draft: 2 · missing: 0`

Consequence, by design: **production organization creation fails closed.** Publishing is a professional
human gate.

## 7. Schedulers

`configured` — 4 jobs in `vercel.json`, generated from `src/lib/runtime/schedule.ts` and enforced by
`npm run check`.
`exercised: no` · `failed: n/a`

| Path | Cadence | Blocking dependency |
| --- | --- | --- |
| `/api/internal/cron/recurring-charges` | hourly | none |
| `/api/internal/cron/notifications` | */10 min | mail relay (503 without) |
| `/api/internal/cron/document-scans` | */10 min | scan relay (503 without) |
| `/api/internal/cron/operational-sweep` | daily | none |

The Vercel team is on **Pro**, so four sub-daily jobs are permitted. `CRON_SECRET` is not set anywhere,
so every cron route is currently **closed**.

## 8. Scanner

`implemented: yes` · `configured: no` · `exercised: no` (outside the embedded suite) · `failed: n/a`

Provider-neutral relay. `CRECY_DOCUMENT_SCAN_RELAY_URL` / `_SECRET` are unset, so the dispatch route
reports **503** and documents stay quarantined.

## 9. Stripe

`implemented: yes` · `configured: no` · `certified: no` — unchanged by Batch A.

## 10. Email

`implemented: yes` (worker + templates + transport) · `configured: no` · `certified: no` — unchanged
by Batch A. No mail vendor is embedded; the worker POSTs to an operator-configured relay.

## 11. Deployment

`production` **and** `preview`, but they are different things and the distinction matters:

| Target | SHA | State |
| --- | --- | --- |
| **production** (`dpl_AbsQ7FUC…`) | `6eaf5b0` = `main` | READY — **predates all of Batch A** |
| **preview** (`dpl_5Nw4W7aE…`) | `4c34c7d` | READY (Batch A; A.1 preview builds on push) |

So: a production deployment exists and serves the pre-Batch-A product. Batch A itself is `preview` only.

## 12. Restore drill

`not run.` No runbook, no drill, no evidence anywhere in the repository. Untouched by Batch A.

## 13. Connected E2E counts

**0 connected runs.** 12 connected specs exist (1 new in Batch A: `organization-switch.spec.ts`); none
were executed, because the nine migrations are not on the live project and no fixture exists for an
operator with two organizations. 4 demo specs.

Previously certified connected workflows are unchanged and were **not** re-verified against Batch A.

## 14. Defects

### Found by adversarial review of this batch — all fixed in `9c166e7`

A full adversarial pass ran over the diff after the four slices were complete. It found **eight real
defects in my own work**, two of them confirmed by executing them against the migration chain rather
than by reading. Each is now covered by a test that fails when the fix is reverted.

| # | Defect | How found |
| --- | --- | --- |
| 1 | **One misconfigured schedule blocked its entire time zone, forever.** The selector filtered three conditions; the command raises on four more, from inside its loop — so one bad row rolled back every healthy schedule beside it, including the run record, and the next hourly run failed identically. | **Executed** — five healthy New York schedules got 0 charges |
| 2 | **A skipped time zone reported HTTP 200.** `invalidTimeZones` never reached the status calculation — the exact failure `health.ts` exists to prevent. | Code-traced |
| 3 | **`get_privacy_request_workspace` was not actually scoped.** It gates on `is_active_org_member`, the one membership helper A3 did not narrow, so the wrapper set the context and the body ignored it. | **Executed** — returned both organizations |
| 4 | **A literal NUL byte in `registry.ts`** made git treat the module defining consent derivation as *binary* — no reviewable diff — and left every hash at the mercy of any editor that strips control characters. | `cat -v` |
| 5 | **`.env.example` shipped `CRECY_DEPLOYMENT_ENV=development`**, which an operator copying it into production would use to relax the gate meant to fail closed. | Config review |
| 6 | **`/settings/team` and `/settings/payments` were dead ends** for a multi-organization operator with no selection — outside the operator layout, so no switcher and no way to choose. | Code-traced |
| 7 | **Onboarding resolved consent with a jurisdiction in the action and without one on the page.** Latent while both documents are `*`; the first country-specific document would have locked onboarding permanently behind a message that misdiagnoses the cause. | Code-traced |
| 8 | **Arrears cleared at most one period per local day**, and the run reported it as healthy. | Reasoned from the run-id derivation |

Also corrected: an e2e assertion weaker than its own comment, an overstated audited-surface count, and
an overstated claim about the reach of the wrapper pattern.

**One review finding was wrong.** #12 claimed unauthenticated `/app` now redirects to onboarding rather
than login. `src/proxy.ts` is Next 16's middleware and redirects to `/login` first; the layout never runs.

### Critical

**None found or introduced**, on the evidence available: `npm run check` green, 25 mutations run,
58/58 browser tests, and a full adversarial pass whose findings are all closed above.

### High — found by me during the batch and fixed inside it

**A cron run where every batch failed answered `200`.** Indistinguishable from healthy in an invocation
log — the same class of failure as a worker with no caller. Fixed: `200` / `207` partial / `502` nothing
succeeded.

### High — one open, and it is a *deployment* defect, not a code defect

**`20260828130000` is not safe to apply out of band.** Every previous migration in this project is
additive; this one revokes `EXECUTE` on functions the currently deployed code calls with no arguments,
so applying it before the code ships breaks the operator dashboard, maintenance queue, payments, vendors
and search with `permission denied`. Verified by reading the deployed source on `main`, not assumed.

Mitigated by splitting it into its own migration whose header states the required order, but the
**constraint is still live and a human must honor it**:

> `20260828120000` (additive) → **deploy the code** → `20260828130000`.

### Medium

1. `get_operator_command_center`'s null branch still contains `order by m.created_at, m.id limit 1`.
   Unreachable from the product now, but the dead branch remains in a 495-line shipped body.
2. `billing` and `exports` appear on the §5.A3 audit list but have **no operator route**, so two of the
   fourteen named surfaces cannot be audited at all.
3. Legal documents are `en-US` only, though the type carries `locale` and the product supports `es-MX`,
   `en-CA`, `fr-CA`.

### Corrections made to my own work during this batch

- **A1**: the first draft of the `finalize_document` redefinition was rebased on the *phase-2 original*,
  silently dropping the `tenancy` and `work_order` parent branches added by two later migrations. A diff
  against the newest shipped body caught it before any test ran.
- **A3**: an early draft revoked the resource-id RPCs too, which would have removed a real capability
  (a resident reading their own payment's settlement history). The revocation line was moved to
  collection surfaces only.
- **A3**: one mutation initially survived — no test covered a surface gated *only* by
  `has_org_permission`. Coverage added; it now fails.
- **A4**: the production gate initially keyed on `NODE_ENV`, which blocked the E2E harness's own
  onboarding page. Moved to the deployment environment with a strict default.

## 15. Remaining launch gates

**Human / professional**

1. **Publish the legal documents.** Until a qualified reviewer does, production organization creation
   fails closed. *This is the intended behavior and must not be worked around by flipping the state.*
2. **Run a restore drill.** Never done.
3. Declare production launch approval — owner-only.

**Configuration**

4. `CRON_SECRET`, or nothing scheduled ever runs.
5. Scan relay — until then every uploaded document stays quarantined.
6. Mail relay — until then no transactional message is delivered.
7. Stripe test Connect keys.

**Sequencing**

8. Apply the migrations in the stated order around the deploy (§14).

**Build**

9. **Batch B** — the public marketing surface. Not started; there is still no home page.
10. The two-organization connected browser switch, once a live fixture exists.

---

## The five states, reported separately

| State | Status |
| --- | --- |
| **Product** | Batch A code-complete and green under `npm run check` + 58/58 browser tests. Four defect classes closed. |
| **Runtime** | **Not achieved.** Schedulers configured, never fired. Scanner and mail relay unconfigured. |
| **Public launch** | **Not started.** No marketing surface; legal documents are drafts. |
| **Provider** | **Unchanged.** Stripe, mail and scanner all implemented, none configured, none certified. |
| **Launch-certified** | **No.** The §16 journey cannot run: it starts anonymous at `/`, which does not exist. |

---

# 16. Batch A.1 — independent review corrections

Reported separately from Batch A, as required. An independent senior review found cross-layer issues my
own adversarial pass did not catch. All thirteen are landed.

## What each one actually was

### 1. The legal gate was bypassable (critical)

A4 put the published-document gate in the Next server action. **That is not a boundary** while
`public.create_organization` stays executable by `authenticated` and accepts an arbitrary
`p_terms_version`: a signed-in browser could call the RPC directly with any string — `""`,
`"2026-07-20"`, `"I agree"` — and record a consent row against a document that was never published,
never shown, and in most cases does not exist.

The write now lives in `create_organization_as_actor`: `service_role` only, with an explicit **trusted**
actor the server derives from `auth.getUser()`. The browser never supplies an actor and never holds the
service-role key. `create_organization` becomes a thin wrapper over the same body — one implementation,
nothing to drift — and its browser grant is removed by the contract release.

Proven, all seven cases: anonymous cannot create by either surface; a signed-in browser cannot reach the
privileged command, nor impersonate another actor through it; an arbitrary consent version is refused at
*both* layers; the created organization records the **exact** resolved binding; an unpublished document
blocks production creation; drafts work only in a recognized non-production environment; and a replayed
server action creates exactly one organization. **13 distinct bypass attempts, all blocked.**

### 2. The Growth trial was 14 days, not 30

File 11: *"A 30-day no-card Growth trial is offered."* The command provisioned 14 in three places —
`trial_ends_at`, the initial `current_period_end`, and the response's `trial.endsAt` — and onboarding
advertised "Growth trial · 14 days". **Every workspace ever created got half the advertised trial.**

Now one named authority in each layer (`private.growth_trial_length()`, `GROWTH_TRIAL_DAYS`), pinned to
each other *and to the spec text* by test, so the runtime and the copy cannot drift again. A `test:db`
assertion reads the actual `trial_ends_at` and the initial period, and a test asserts the onboarding
page no longer hardcodes a number at all. Canonical prices untouched.

### 3. The new organization becomes the active context

Onboarding redirected without establishing the returned `organizationId`. For an operator already in
another organization that is not cosmetic: the entity, book and first property would have been created
**in the wrong tenant**, silently. Now set through the same server-controlled mechanism as the switcher,
from the id the command returned — never inferred from membership ordering.

Proven: holding A, create B, continue under B → entity, book and property all in B, and **A receives
zero rows**. The ordinary first-organization path is asserted alongside it.

### 4. The environment gate now genuinely fails closed

`VERCEL_ENV=production` is checked **first and returns immediately**, so no application override can
weaken a known production deployment. Only a closed set of names is recognized; anything else — the
reviewer's `produciton`, or `prod`, `staging`, `live` — **throws** a configuration error rather than
silently becoming development. An unlabeled production build still fails closed.

### 5. `consentVersion` is required, not "compare if present"

It is now a required, format-validated field. A client that simply omitted it would have slipped past
the old check entirely. The exact-match race guard is kept.

### 6. Dead-lettered scans have a way out

A relay outage outlasting the attempt budget left every document uploaded during it permanently
unusable, with manual SQL as the only escape — the thing A1 set out to abolish.

`retry_document_scan` is authorization-controlled against the document's own parent scope, requires a
reason, is audited and idempotent, and resets the attempt budget (the failures were about the *scanner*,
not the object). **It does not make the document usable**: the version stays quarantined until a real
clean verdict. Recovery re-opens the question; only `complete_document_scan` answers it. Proven end to
end: outage → exhaustion → dead-letter → document unavailable → restore → authorized retry → queued →
clean → usable, plus refusals for residents, outsiders, anonymous callers, finished scans and rejected
documents.

### 7. One correlation ID per scan state change

`complete_document_scan` called `gen_random_uuid()` separately for its audit row and its outbox event,
so the two halves of one verdict could not be joined. Fixed, and the retry command shares one id too.

### 8. The migration directory is safe again

A directory whose safe execution depends on someone remembering to stop halfway through, deploy, and
resume **is not a safe directory**. Contractions now live in `supabase/migrations-contract/` with a
written release procedure, and `scripts/check-migrations.mjs` — in `npm run check` — fails if one appears
in the ordinary set. Verified by planting a contraction and watching the gate reject it.

`test:db` still replays the contract release, **last**, exactly as a correct rollout applies it. The
separation is about *when a human may apply it*, not about whether it is tested.

### 9. The shared workspaces were an escape hatch

`get_conversation_workspace` and `get_privacy_request_workspace` each answered the relationship question
**and** the operator question, and their operator half is organization-wide — so an operator could union
organizations simply by calling the older RPC directly, bypassing the selected context entirely.

Where one RPC answers two different questions, the fix is two contracts, not a filter that has to be
right for both. Split into `get_relationship_*` projections (structurally incapable of the union) and the
A3 organization-scoped forms; the originals are closed by the contract release. Asserted by direct RPC
call, not through the UI.

### 10. The scan worker has a proven duration budget

It claimed 10 jobs, scanned them sequentially, and allowed each relay 60 seconds — a worst case of ten
minutes. A function killed mid-run leaves every claimed job in `scanning` until the stall sweep, so one
timeout stranded the whole batch.

`maxDuration` is now **pinned on the route** (Next requires a literal, so a test pins the literal to the
constant), the relay timeout is 12s, the batch is 3, and scanning runs with bounded parallelism. The
worst case is **computed** from the parts — 22s against a 60s budget, 63% margin — so changing any one
of them cannot silently break the guarantee.

> **On the limit itself:** the connected Vercel project (`property-management`, Pro team, Node 24.x)
> carries no function configuration, and the documentation tool available here does not expose a
> per-plan limits table. Rather than assume a default, the value is pinned explicitly and the batch
> sized well inside it. That is code evidence, not connected evidence.

A partial-stall test proves one hanging relay does not serialize behind the healthy jobs and that every
claimed job still reaches a terminal state.

### 11. Runtime failures are visible

Dead-lettered scans and notifications, blocked charge schedules and unusable property time zones existed
only in private tables or a cron response body — each silently stopping work. One read-only support
query now reports all four through the existing audited support-session controls, distinguishing
**queued / processing / retrying / dead-letter / blocked**, because the operator's response differs for
each.

It leaks nothing: asserted that no bucket, path, title, digest, secure-link token, recipient address or
provider reference appears in the payload, and that a raw provider error containing a URL with a token
is **classified rather than echoed**. Reading it is itself audited. No tenant-RLS bypass is added.

## A.1 verification

`npm run check` green: **257 tests / 45 files**, `test:db`, `schedule:check`, `migrations:check`, build.
**58/58 demo Playwright.**

Five A.1 mutations, all caught:

| Mutation | Result |
| --- | --- |
| Grant the privileged creation command to `authenticated` | **CAUGHT** |
| Accept any consent version | **CAUGHT** |
| Revert the trial to 14 days | **CAUGHT** |
| Two correlation ids for one scan verdict | **CAUGHT** |
| Retry releases the document instead of requeueing it | **CAUGHT** |

Plus the migration guard, verified by planting a contraction in `supabase/migrations/`.

## Evidence type

**All of the above is code evidence** (embedded Postgres + browser against the demo build). None of it is
connected evidence: the nine migrations are not applied to the live project, and per the review's own
instruction the contract migration must not be applied there until its compatible build is deployed and
verified.

## What A.1 did not change

Stripe, mail and scanner remain implemented-but-unconfigured. The legal documents remain **drafts**, so
production organization creation still fails closed — now at the database as well as the server action.
The restore drill has still never run. `billing` and `exports` still have no operator route.
