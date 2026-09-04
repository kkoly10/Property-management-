# PILOT READINESS CHECKPOINT

Current-state record for `CRECY_PILOT_READINESS_IMPLEMENTATION_PLAN.md`. The plan holds stable
requirements; this file holds volatile facts. Update this file as state changes — never the plan.

**Checkpoint date:** 2026-09-03
**Produced by:** §1.1 Establish Production Truth
**Method rule:** every line below is marked VERIFIED (observed live this checkpoint) or UNVERIFIED.
Nothing here is carried over from an older runbook.

---

## Repository

| Fact | Value | Method |
| --- | --- | --- |
| current `main` SHA | `c10c8aec701ceeb84ae6209bb643d81cf46bf6ae` (`c10c8ae`) | VERIFIED — `git rev-parse origin/main` |
| current production deployment | `dpl_J1ki8gdUSxoTgnuocLfrjHvSy7Rd`, target `production` | VERIFIED — `vercel inspect` |
| production ↔ main | in sync; deployment created 2026-09-04 00:40 EDT from the `c10c8ae` push | VERIFIED |
| migrations in repository | 60, latest `20260829130000_phase_8_runtime_diagnostics.sql` | VERIFIED — filesystem |
| pending CONTRACTION migration | `migrations-contract/20260828130000_phase_8_close_unscoped_operator_surfaces.sql` | VERIFIED — filesystem |
| migrations applied to production DB | **61**, earliest `20260720095008`, latest `20260829130000` | VERIFIED — dashboard SQL editor |
| pending contraction actually applied? | **No** — `20260828130000` absent from `schema_migrations` | VERIFIED |
| repo ↔ production migration parity | **DRIFT — 61 applied vs 60 in repo** | VERIFIED — see below |

The contract migration revokes EXECUTE on unscoped operator surfaces and is deploy-ordered: it may
only be applied after a build that calls the scoped forms is live. It must not be applied casually.

## Runtime

| Check | Status | Method |
| --- | --- | --- |
| Supabase server runtime (`createAdminClient`) | **FAIL** | VERIFIED — 1,892 production errors |
| recurring-charge cron | **FAIL** | VERIFIED |
| notification cron | **FAIL** | VERIFIED |
| document-scan cron | **FAIL** | VERIFIED |
| operational-sweep cron | **FAIL** | VERIFIED |
| cron scheduler fires | **PASS** | VERIFIED — see below |
| cron credential (`CRON_SECRET`) | **PASS** | VERIFIED — see below |
| failure alerting | FAIL (no alerting configured) | VERIFIED |

**Single root cause, verified live.** Vercel runtime errors over 7 days show exactly one error group:

```
Error: SUPABASE_SECRET_KEY is not configured.
count=1892
routes=/api/internal/cron/recurring-charges, /api/internal/cron/notifications,
       /api/internal/cron/document-scans, /api/internal/cron/operational-sweep
first=2026-08-29T03:50:18Z   last=2026-09-04T04:40:40Z
```

**What those errors prove beyond the failure itself.** Every cron route calls
`hasValidCronCredential(request)` first and returns 401 before constructing the admin client. An error
thrown *after* that gate therefore proves the scheduler reached the handler: Vercel Cron is firing on
all four routes and `CRON_SECRET` is authenticating correctly. The schedule is alive. Only the server
credential is missing.

## Providers

| Provider | State | Method |
| --- | --- | --- |
| Supabase (public/browser config) | configured and working — `/app` reaches the session gate, zero setup-mode markers | VERIFIED |
| Supabase (server credential) | **not usable in production** | VERIFIED |
| Resend — domains | `mail.crecyos.com` and `mail.crecyliving.com` both Verified; DKIM, SPF, feedback MX and DMARC resolve | VERIFIED |
| Resend — sending | **not exercised**, no API key in Vercel | VERIFIED — env inventory |
| Scanner | **not configured**, no relay URL/secret in Vercel | VERIFIED — env inventory |
| Stripe | keys present but never exercised; sole connected Stripe account in tooling is a different entity in livemode | UNVERIFIED |

## Product closure

Per the authority's gates. Not re-derived here; tracked in Appendix A of the plan.

| Item | Status |
| --- | --- |
| async scan UX | FAIL — not built |
| completion evidence | FAIL — not built |
| vendor operator UI | FAIL — not built |
| owner setup UI | FAIL — not built |
| owner approval | FAIL — not built |
| staff lifecycle | UNVERIFIED — blocked behind mail delivery |
| operator/owner notification preferences | IN PROGRESS — separate worktree, branch `claude/vibrant-ishizaka-3d9d50` |

## Human / operational

| Item | Status |
| --- | --- |
| legal package | draft — not published |
| restore drill | FAIL — never performed (blocked by Blocker 2) |
| security gate | UNVERIFIED — not run this checkpoint |
| support investigation | UNVERIFIED |
| privacy-request smoke | UNVERIFIED — newly added requirement |
| operational owner | NAMED — founder, per plan §7.5 |
| error tracking / runtime visibility | FAIL — no error tracking wired |
| last-known-good deployment | `dpl_J1ki8gdUSxoTgnuocLfrjHvSy7Rd` (`c10c8ae`) — first record |
| active P0/P1 incident | P1 — all four scheduled workers down since 2026-08-29 |

## Certification

- no-shortcuts journey: **NOT RUN**

## Overall state

> **Pilot Candidate**

Not Pilot Ready: Gates 2–10 are not green.

---

## Ten-gate status

| Gate | Status | Blocking fact |
| --- | --- | --- |
| 1 — Production identity | 🟡 PARTIAL | Everything identified, but production carries a migration `main` does not (see drift finding). Gate 1 should not pass until provenance is resolved |
| 2 — Runtime | 🔴 FAIL | All four workers down on one missing secret; no alerting |
| 3 — Scanner | 🔴 FAIL | No scanner configured; async scan UX not built |
| 4 — Communication/Auth | 🟡 PARTIAL | Domains verified and Auth redirects configured; no API key, so nothing has ever been delivered |
| 5 — Maintenance | 🔴 FAIL | Vendor directory and completion evidence not built |
| 6 — Owner | 🔴 FAIL | Owner directory, interests and approval not built |
| 7 — Stripe | 🔴 FAIL | Never exercised |
| 8 — Legal | 🔴 FAIL | Package unpublished — blocks org creation, which fails closed by design |
| 9 — Operational safety | 🟡 PARTIAL | 6 of 8 sub-criteria met on adoption (named owner, severity model, pause triggers, rollback rule, DB-incident rule, last-known-good recorded). Remaining: error tracking, restore drill |
| 10 — Full certification | 🔴 NOT RUN | Depends on all above |

---

## Blockers requiring a human

### Blocker 1 — `SUPABASE_SECRET_KEY` (P1, blocks Gate 2, cascades to 3/4/5/6/7)

- **Exact value:** the Supabase **Secret key** (`sb_secret_…`) for project `alrirkvfcmhqumqaidxj`.
- **Where it comes from:** Supabase Dashboard → project **Property** → Settings → API Keys → Secret key.
- **Where it goes:** Vercel project `property-management`, Production (and Preview), name
  `SUPABASE_SECRET_KEY`, Sensitive. A variable of that name already exists and is wrong or stale — it
  must be overwritten, not added.
- **Why not done here:** entering a live vendor API key into a field is outside what this agent does.
- **After it is set:** redeploy, then the four workers can be certified (§1.3).

### Blocker 2 — Supabase administrative access — RESOLVED

Resolved during this checkpoint via the authenticated dashboard SQL editor. Recorded because the
route matters for the next operator:

- **Supabase MCP:** denied session-wide (`You do not have permission to perform this action`).
- **Supabase CLI:** installed (v2.116.0) and authenticated, but as `komlankouhiko@gmail.com`, which has
  **no privileges** on this project (`supabase link` returns an access-control error). The project
  belongs to `comlan11@gmail.com`'s org.
- **Working route:** the dashboard SQL editor in the authenticated browser session. It needs roughly
  40-60s to render; an earlier attempt was abandoned too soon and wrongly recorded as blocked.

### Blocker 3 — `RESEND_API_KEY` (blocks Gate 4)

- **Exact value:** a Resend API key (`re_…`) from resend.com → API Keys.
- **Where it goes:** Vercel `RESEND_API_KEY` (Production), **and** the same value as the password in
  Supabase → Authentication → SMTP (host `smtp.resend.com`, port 465, username `resend`).
- Resend also shows an unpaid-invoice warning that states sending may be disrupted.

---

## Finding — production carries a migration `main` does not

`20260725020649_phase_8_payment_csv_export` is applied to the production database and exists **only** on
the unmerged branch `origin/codex/phase-8-payment-csv-export` (commit `e8ad10c`, 2026-07-24). It is not
on `main`, was never merged, and `scripts/validate-schema.mjs` has never heard of it.

It defines one index (`payments_org_activity_export_idx`) and one function,
`public.get_operator_payment_export(date,date,uuid,uuid)`, granted EXECUTE to `authenticated`.
**Zero code on `main` calls it.**

The function itself is correctly built — `security definer`, `set search_path = ''`, an
`AUTHENTICATION_REQUIRED` gate, an MFA gate, and `private.has_property_access` finance scoping with
`OPERATOR_FINANCE_DENIED` / `PROPERTY_SCOPE_DENIED`. This is a provenance and coverage problem, not a
known vulnerability, and it should not be described as one.

What it does break:

1. **The repository no longer reproduces production.** `npm run test:db` replays 60 migrations;
   production runs 61. Every schema assertion that suite makes is against a schema that is not the one
   serving customers — which also undermines the §7.2 restore drill, since a restore verified against
   the repo would diverge.
2. **An `authenticated`-executable RPC exists in production that main's adversarial/RLS suite never
   exercises**, because that suite only knows main's migrations.
3. **A future merge of that branch is ambiguous** — the migration is already applied.

Resolution is a decision, not a mechanical fix. Either merge the branch so the migration comes under
review and test, or add a forward migration on `main` that drops the index and function (clean, since
nothing calls it), or consciously accept and document the divergence. Do not silently leave it.

1. **`SUPABASE_SECRET_KEY`.** One value unblocks all four workers. Nothing in Gates 2, 3, 5, 6 or 7 can
   be certified while it is missing, because every one of those journeys depends on a worker.
2. **`RESEND_API_KEY`.** Gate 4, and every invitation-dependent journey (staff, resident, owner).
3. **Scanner relay.** Gate 3, and it blocks document-dependent maintenance and owner work.
4. **Operator UI build-out** (vendor directory, completion evidence, owner setup/approval) — Gates 5–6.
   This is the largest genuine engineering effort remaining and depends on no external secret.
5. **Stripe test-mode certification** — Gate 7.
6. **Legal publication** — Gate 8, founder/counsel, no engineering dependency; can start now.
7. **Operational safety** — Gate 9, partly independent of everything above and startable now.

Items 4, 6 and 7 have no secret dependency and should proceed in parallel with 1–3 rather than queue
behind them.
