# v4.2 Batch A — checkpoint report

Reported in the fields file 27 §15 requires. **Nothing here is a claim that the product, the pilot or
the launch is complete.** External gates are stated as gates, not converted into success.

---

## 1. SHAs

| | |
| --- | --- |
| **Working head** | `9c166e7` (branch `claude/mvp-progress-assessment-axvajc`, PR #35) |
| **Batch A base** | `13b01f4` |
| **`origin/main`** | `6eaf5b0` |
| **Head vs main** | 19 commits ahead, 0 behind |

Batch A is the last 8 commits: `f8f748e` (A1), `c4536ed` (A2), `c836289` + `6ec4cec` (A3),
`4c34c7d` (A4), `dd09ce1` (deploy-ordering split), `e13edcc` (this report), `9c166e7` (review
corrections).

## 2. Files and migrations added

**92 files changed, +5,200 / −305** since `13b01f4` (40 added, 51 modified).

**Four forward-only migrations, none applied to the live project:**

| Migration | Adds |
| --- | --- |
| `20260828100000_phase_2_document_scan_lifecycle.sql` | `private.document_scan_jobs` + 4 `service_role` worker RPCs; redefines `finalize_document` to enqueue |
| `20260828110000_phase_4_runtime_scheduler.sql` | `list_due_charge_schedule_batches`, `sweep_expired_operational_records`, 2 `private` helpers |
| `20260828120000_phase_8_active_organization_context.sql` | `list_operator_organizations`, context gate, 3 narrowed helpers, 20 scoped RPC wrappers, reproduced global search — **additive** |
| `20260828130000_phase_8_close_unscoped_operator_surfaces.sql` | 11 `revoke execute` — **NOT deploy-order independent** |
| `20260828140000_phase_8_batch_a_review_corrections.sql` | narrows `is_active_org_member`; rebuilds the batch selector with per-schedule health and pair-based run ids |

Authority counts: **77 tables / 59 policies** (was 76/59 — `private.document_scan_jobs` is the one new
table, added to doc 12).

New app modules: `src/lib/runtime/*` (7), `src/lib/organization/*` (3), `src/lib/legal/*` (5),
`src/lib/documents/scanner.ts`, 4 cron routes, 2 public `/legal` routes, 2 shell components,
`vercel.json`, `scripts/check-schedule.mjs`.

## 3. Product workflows passed

`npm run check` green end to end: ESLint, TypeScript, **241 Vitest tests / 42 files**, embedded-Postgres
`test:db`, `schedule:check`, production build. **58/58 demo Playwright tests.**

Newly proven in `test:db` against real RPCs:

- **Scan lifecycle** — the three cases file 27 §5.A1 names: quarantined → scanning → clean → downstream
  use succeeds; rejected → downstream use stays blocked; a stale or cross-version digest cannot clean
  another object. Plus `service_role`-only grants, claim concurrency, verdict idempotency and conflict,
  backoff, dead-letter + audit, stall sweep.
- **Rent time zones** — EDT/PDT/HST across UTC midnight and a month boundary; at `2026-09-01T06:00Z`
  only New York is due, and the Los Angeles charge lands on its own local date in both `charges.due_date`
  and `journal_transactions.effective_date`.
- **Organization isolation** — a real second organization for the same operator; eight audited surfaces
  return the owning organization's rows and **zero** in the other; revoked and expired memberships stop
  working on the next call; the context never outlives its statement.

**Mutation testing:** 25 mutations across the four migrations. 23 caught. The 2 survivors are
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
| **preview** (`dpl_5Nw4W7aE…`) | `4c34c7d` | READY |

So: a production deployment exists and serves the pre-Batch-A product. Batch A itself is `preview` only.

## 12. Restore drill

`not run.` No runbook, no drill, no evidence anywhere in the repository. Untouched by Batch A.

## 13. Connected E2E counts

**0 connected runs this batch.** 12 connected specs exist (1 new: `organization-switch.spec.ts`); none
were executed, because the three Batch A migrations are not on the live project and no fixture exists
for an operator with two organizations.

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
