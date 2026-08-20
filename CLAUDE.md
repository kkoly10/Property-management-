# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository. Read [`AGENTS.md`](./AGENTS.md) and [`docs/crecy-v4/00_READ_ME_FIRST.md`](./docs/crecy-v4/00_READ_ME_FIRST.md) alongside this file — the `docs/crecy-v4` package is the authoritative product spec and supersedes anything here on questions of scope or contract.

## Self-verification protocol — MANDATORY after every deliverable

A deliverable is **not done** until it has been verified against its requirement **empirically**, not from memory or optimism. This is not ceremony: on this codebase, "looks correct" SQL has shipped real defects that only an executed test caught (a `FOUND`-clobber that nulled a row id because an intervening `INSERT` reset `FOUND`; an RLS `EXISTS` subquery that resolved `id` against the wrong table and silently denied all access; a command that passed its own checks but collided with a *different* migration's trigger at runtime). Run every step, every time.

1. **Re-read the actual changed code against the requirement.** Open `git diff` and read each hunk with its surrounding context. Confirm the code does what the requirement literally says — not what you intended to write.
2. **Run the embedded database suite for anything touching SQL.** `npm run test:db` replays the entire migration chain in in-memory Postgres and drives the real RPCs. A migration that "parses fine" is not verified; a migration whose command you actually called, with assertions on the resulting rows/traces and `expectDatabaseError` on every rejection path, is.
3. **Enumerate ALL enforcement points when you change a default, a gate, or shared behavior.** A rule lives in more than one place here: the SQL command, its RLS policy, the zod schema, the API error ladder, and the UI. A change applied to one but not its siblings is the most common defect. List the sites you checked.
4. **Prove claims; don't assert them.** Every factual statement about the schema, an account code, a permission, or whether X is wired must be backed by a command you ran (`grep`, a query, a test) whose output you saw. If you didn't check it, say "unverified."
5. **Green tests are necessary, not sufficient.** Reason explicitly about the invariant the change must preserve (balanced journal, one active relationship per user, idempotent replay) and add the assertion that would have caught the specific bug this change could introduce.
6. **Do an adversarial review scoped to THIS diff.** For anything that grants access, moves money, or writes financial history, ask "what did I change, and what class of bug could this exact change introduce?" and go looking for it — authorization bypass, cross-tenant leak, replay, unbalanced posting.
7. **Report what you verified and how** — the commands and their results — not a vague "all good." State any part you could NOT verify and why.

Treat "the user told me to review" as already implied by every deliverable. If any step surfaces a flaw, fix it and re-run the protocol before declaring done.

## Project status

**Pre-launch. Zero real customers, zero real production data.** This lowers the bar for routine forward motion — merging an additive, green, forward-only migration to `main` has low blast radius, and this project is built one merged vertical slice at a time. Still confirm before genuinely destructive or hard-to-reverse actions (force-push over unmerged work, dropping data, rewriting posted financial history — which the schema blocks anyway). Only designated human owners may declare "approved for production launch"; a coding agent may declare "implementation complete for a phase." **Do not declare the pilot complete** until every binding P0 journey in `docs/crecy-v4/10_PILOT_MVP_SCOPE_AND_RELEASE_BOUNDARY.md` has either executable evidence that it passes or an explicitly approved pilot exception recorded in the authority docs — command-contract count is not the bar (see the completion-status note under "Conventions worth matching").

## Commands

```bash
npm run dev          # Next.js dev server
npm run build        # production build
npm run lint         # eslint .
npm run typecheck    # tsc --noEmit
npm run test         # vitest (unit + validation schema tests)
npm run test:db      # node scripts/validate-schema.mjs — embedded PGlite: replays every
                     # migration + drives RPCs to prove schema, RLS, and command behavior
npm run check        # lint + typecheck + test + test:db + build — the real gate; run it before every PR
```

Unit/validation tests are **Vitest** (`src/**/*.test.ts`), not Jest. There is no configured CI that gates merges or auto-applies migrations, so `npm run check` passing locally is the gate. To run one validation file: `npx vitest run src/lib/validation/<name>.test.ts`.

**Migrations** live in `supabase/migrations/*.sql`, timestamp-prefixed, wrapped `begin; … commit;`, and are **forward-only** — never edit a shipped migration; add a new one. They are validated by `test:db` and applied to the Supabase project out of band (Supabase MCP / CLI), **not** by merging. Write additively (`create … if not exists`, `add column if not exists`) and correct financial data by posting reversing entries, never by editing posted rows (the schema enforces this).

## Architecture

### Authoritative spec ordering (`AGENTS.md`)

`docs/crecy-v4/` is the source of truth, in this authority order: `07_FOUNDER_DECISION_REGISTER` (product decisions) → `10_PILOT_MVP_SCOPE_AND_RELEASE_BOUNDARY` (what's in/out of the pilot) → `11_PRICING_ENTITLEMENTS_AND_BILLING_SPEC` → `12_P0_EXECUTABLE_SCHEMA.sql` → `13_P0_RLS_POLICIES_AND_TEST_MATRIX` → `14_P0_COMMAND_API_EVENT_CONTRACTS` → `15_P0_SCREEN_AND_STATE_SPECIFICATIONS` → `17_..._TRACEABILITY_MATRIX`. Implement **one vertical slice at a time**, and only commands that have matching persistence *and* traceability entries. Doc `12` occasionally drifts from what migrations actually shipped (e.g. it lists `journal_entries.vendor_id`, which no migration ever added) — trust the migrations over the spec doc, and verify.

Product surfaces: **Crecy OS** (operator, `/app/*`, its own layout), **Crecy Living** (resident PWA — flat root segments `/home`, `/maintenance`, `/messages`, `/payments`, `/receipts`, `/more`), **Crecy Owner** (`/owner/*`), plus shared `(auth)`, `/onboarding`, `/settings`, `/invitations/accept`, `api/v1` (public REST) and `api/internal` (workers/webhooks). Money is **always integer minor units** (`*_minor` / `*Minor`), currency ∈ `USD|CAD|MXN`, converted to display only at the UI edge.

### Multi-tenancy & RLS

Tenant = **organization**; every tenant table carries `organization_id`. Base tables are **SELECT-only from the browser** — `enable row level security`, a `for select to authenticated using (<private.* helper>)` policy, and `revoke insert,update,delete` from `anon,authenticated`. **All writes flow through `security definer` command functions**, never direct table mutation. Some sensitive tables (e.g. `invitations`) revoke even SELECT and are reached only through definer functions returning sanitized DTOs. Owners and vendors get server-selected projections, never raw table rows.

Authorization helpers live in schema `private`, are `language sql stable security definer set search_path=''`, return boolean, and resolve the caller via `(select auth.uid())`:
- `private.has_property_access(property, permission)` — **the** property-scoped gate. True iff the caller has an active `organization_membership` (status active, within `starts_at`/`ends_at`) whose role grants `permission` or `'*'`, AND either an explicit `membership_property_scopes` row for that property OR an org-wide-allowed role with no scope rows.
- `private.has_unscoped_org_permission(org, permission)` / `private.has_org_permission(org, permission)` — org-level gates.
- `private.is_resident_for_tenancy(tenancy)`, `private.is_owner_entity(owner_entity)`, `private.is_owner_entity_for_property(owner_entity, property)` — resident/owner self-service.

Permissions are `<domain>.<read|manage>` (+ `'*'`): domains `property, resident, lease, finance, maintenance, owner, documents`, plus `organization.manage`. Roles (`role_definitions`, `organization_wide_allowed` in parens): `org_owner('*',T)`, `org_admin(T)`, `property_manager(T)`, `leasing_agent(F)`, `accountant(T)`, `maintenance_coordinator(F)`, `read_only_auditor(T)`. Commands pass `.manage`; reads accept `.read OR .manage`.

### The command pattern (most important convention)

Every command is `public.<verb_noun>(p_organization_id, …, p_idempotency_key) returns jsonb language plpgsql security definer set search_path=''` (so every reference is schema-qualified, incl. `auth.uid()`). Fixed order — mirror an existing command (`public.record_manual_payment`, `public.invite_staff_member`) rather than inventing one:

1. Auth gate: `if auth.uid() is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'`.
2. Validate the idempotency key (len 8–200) and every input, each with an explicit `errcode` and an `UPPER_SNAKE` message. Canonicalize jsonb collections with `jsonb_agg(... order by <key>)`.
3. Load the anchor entity scoped by `organization_id`; `X_NOT_FOUND` (`P0002`) if missing. Authorize via the matching `private.*` helper; `PROPERTY_SCOPE_DENIED`/`…_SCOPE_DENIED` (`42501`) otherwise.
4. `v_request_hash := encode(sha256(convert_to(<canonical camelCase inputs>::text,'UTF8')),'hex')`.
5. Idempotency lookup on `private.idempotency_records` (keyed `nulls not distinct (organization_id, actor_scope|actor_user_id, route, idempotency_key)`, `route` a stable PascalCase constant): different hash → `IDEMPOTENCY_CONFLICT` (`23505`); `completed` → return stored `response_body`; `processing` → `COMMAND_IN_PROGRESS` (`40001`). Insert the record (`processing`) **before** the mutation.
6. Mutate using pre-generated UUIDs; stamp `organization_id` and `created_by`.
7. Write `audit.audit_events` (one row per state change) and `private.outbox_events`, all sharing one `v_correlation_id`; `action_code`/`event_type` are `'<domain>.<pastTense>'` with camelCase `jsonb_build_object` payloads.
8. Build the camelCase `jsonb` response; mark the idempotency record `completed`; return.
9. Immediately after the function: `revoke all on function … from public,anon;` then `grant execute … to authenticated;` (`to service_role` for worker/webhook-invoked functions).

Conventional SQLSTATEs: `28000` auth, `23514`/`22023` business/validation, `22003` numeric, `22007` datetime, `42501` permission, `P0002` not-found, `23505` conflict, `40001` in-progress, `55000` append-only. **Guards whose result depends on the command's own prior side effects must run AFTER the idempotency short-circuit**, or a successful replay wrongly fails. Beware `FOUND`: any intervening `INSERT/UPDATE/PERFORM` resets it — capture existence in an explicit boolean right after the `SELECT INTO`.

### Double-entry ledger

Tables: `public.ledger_accounts`, `public.journal_transactions`, `public.journal_entries`. Accounts are scoped **per `accounting_book_id`** (`unique (accounting_book_id, account_code)`) — there is **no seeded chart of accounts**; every posting command lazily upserts the codes it needs (`insert … on conflict (accounting_book_id, account_code) do nothing`, then `select … or raise 'LEDGER_ACCOUNT_CONFLICT'`). Derive `accounting_book_id`/`operating_entity_id` from the `public.properties` row. A balanced journal = one `journal_transactions` header + ≥2 one-sided `journal_entries` legs (`check (debit_minor>0 and credit_minor=0) or (credit_minor>0 and debit_minor=0)`); the deferred constraint trigger `private.validate_journal_balance()` rejects unbalanced *and* zero-total transactions at commit. `private.prevent_financial_mutation()` makes both journal tables append-only (`APPEND_ONLY_RECORD`) — corrections are reversing transactions. Set `journal_entries.property_id` on expense/revenue legs so they flow onto owner statements automatically. Account codes that actually exist (all lazily upserted per book — there is still **no seeded chart**; verify against migrations before relying on any code): cash-clearing `1000/1010/1020/1090` (selected by payment source) plus `1030` Stripe payment clearing and `1040` operating cash clearing; `1100` accounts receivable; `1150` owner receivable; liabilities `2000` accounts payable and `2100` owner payable; equity `3900` opening-balance equity and `3905` owner-distribution clearing; income `4000` rental income and `4100` management-fee income; expenses `6100` payment-processing fees, `6200` repairs and maintenance, and `6300` bad-debt expense.

### App layers

- **Data (`src/lib/data/*.ts`, `import "server-only"`):** each fetcher returns a `mode: "setup" | "ready" | "error"` union plus payload, and reaches the DB via `supabase.rpc("verb_noun", { p_snake_case })` (or scoped table reads for directory pages). `normalizeXxx(data: unknown)` coerces every field explicitly. Hardcoded `previewXxx` DTOs power `"setup"`.
- **Demo / setup-preview mode:** `getPublicSupabaseConfig()` (`src/lib/supabase/config.ts`) returns `null` when the public Supabase env is missing/placeholder → fetchers return `"setup"` + preview data so the whole UI renders with no backend. Server pages are `export const dynamic = "force-dynamic"` and pass `disabled={mode !== "ready"}` to client forms.
- **Validation (`src/lib/validation/*.ts` + paired `*.test.ts`):** **Zod v4** (`z.uuid()`, `z.email()`, `z.iso.datetime({offset:true})`, `z.enum([...])`, `.superRefine(...)`). Mutating schemas carry `expectedVersion`/`idempotencyKey` where relevant and export `type XxxInput = z.infer<...>`.
- **API (`src/app/api/v1/**/route.ts`):** `safeParse` → 400; `auth.getUser()` → 401; `supabase.rpc(...)` with the `idempotency-key` header; then a `code.includes("SENTINEL")` ladder mapping the RPC's `UPPER_SNAKE` errors to HTTP (scope→403, not-found→404, conflict/exists→409, expired→410, business→422). `{data,error}` is the control flow — no try/catch.
- **UI forms (`"use client"`):** controlled `useState`; `idempotencyKey = useRef` minted lazily with `??=` and reset to `null` on any HTTP failure (and via a `changed()` handler on edit); shadcn/ui + lucide-react; surface the API `{error}` verbatim.

### Testing harness (`scripts/validate-schema.mjs`)

PGlite (citext + pgcrypto) with a Supabase prelude (`anon`/`authenticated`/`service_role` roles, `auth.users`, `auth.uid()`/`auth.jwt()` from `request.jwt.claim.*` GUCs, a `storage` schema). Actor model: `set role authenticated; set request.jwt.claim.sub='<uuid>'` (`aal='aal2'` for MFA-gated RPCs; `set role service_role` for worker RPCs; `reset role` for superuser seeding **and for raw base-table assertions**, since browser roles can't SELECT most tables). Helpers: `assert(cond, msg)`, `expectDatabaseError(thunk, substring)`. `validateAuthority()` asserts exact table/policy counts against docs `12`/`13` — a new **table or RLS policy** changes those counts (bump them and add the matrix row); new **functions/indexes** do not. New finance/relationship coverage goes inside the big `validateRecurringCharges()` chain: add the migration to the top-of-file `readFile` list and `db.exec` it in migration order, drive the RPC, and assert both the resulting rows and the `audit`/`outbox`/`notification` trace counts.

## Conventions worth matching

- **One vertical slice per change:** migration → RLS → command → API route → data/validation → UI → embedded-postgres + vitest tests → `docs/implementation/PHASE_*` note. Land it green under `npm run check`.
- **Invitations create relationships:** portal access for residents/owners requires an **active** `public.user_relationships` row; it is minted only by `invite_relationship_user` → `accept_relationship_invitation` (spec §4.7), mirroring the staff-invitation flow. Activating a relationship auto-provisions a messaging conversation via `private.sync_relationship_conversation()`, which assumes **one active user per relationship** — the invite command enforces that.
- **Mirror the nearest sibling, don't invent.** New command → copy `record_manual_payment`/`invite_staff_member`. New API route → copy an existing `route.ts` and its error helper. New portal form → copy `manual-payment-form.tsx`.
- **Pilot completion status — do NOT claim "pilot complete" from command-contract count.** Doc-14 command coverage (29/30 contracts have an RPC + surface + UI) is evidence, not the binding bar; the binding scope is the doc-10 pilot journeys, each of which needs executable evidence or a recorded pilot exception. Track these distinct states separately:
  - *Implemented command contracts* — the doc-14 `public.*` RPCs that exist.
  - *Implemented pilot workflows* — a journey wired end to end (command + RLS + API/action + UI) and green under `npm run check` (embedded-Postgres).
  - *Connected-certified workflows* — a workflow additionally exercised through the browser against the live migrated Supabase project with DB postconditions asserted (see `e2e-connected/` + `CONNECTED_E2E_VERIFICATION_REPORT.md`). Certified so far: onboarding, lease activation, recurring charges, manual payment, write-off, payment reversal/correction, owner statement, document delivery/ack, maintenance→cost, announcements, messaging.
  - *Environment-blocked workflows* (implemented, need external config to certify): Stripe provider payments/refunds/payouts (needs test Connect keys — routes 503 without them), staff-invitation email delivery (needs `SUPABASE_SECRET_KEY` + a mail transport).
  - *Remaining binding P0 scope (still to build):* (1) **platform control plane** — the read half now ships: the audited support-session foundation (`start/end_support_session`, `platform_actors`/`support_sessions`), the sanitized support-query RPCs/DTOs (`support_lookup_organizations`/`support_get_organization_overview`/`support_list_organization_members`/`support_list_recent_activity`/`support_list_sessions`), actor provisioning + suspend/reactivate with a **race-free last-admin invariant** and a **one-active-session-per-actor** invariant (`provision_platform_actor`/`set_platform_actor_status`, both advisory-locked), the `/platform` **read-only console** (lookup, sanitized diagnostics, start/end session, persistent banner) with MFA step-up routing, and the adversarial isolation suite. **INVARIANT (do not regress):** `has_active_support_session()` is wired into **NO** tenant policy — an automated `test:db` guard asserts zero `public`/`reporting` policies reference it; support is served only by the definer support-query RPCs. Do **not** OR it into tenant base-table RLS. Still unbuilt: any *mutating* support action (`access_scope` is `read_only`-only), a console UI for actor provisioning/suspension (the lifecycle is RPC-only today), and the bootstrap admin remains an out-of-band manual seed by design. (2) **occupied-portfolio import** — `create_import_job` accepts only `job_type='portfolio'`; `residents/leases/opening_balances/documents/combined`, true XLSX ingestion, and the document ZIP+manifest flow are unbuilt. (3) **transactional notification worker** — commands emit notification jobs but no sender exists (this also gates the `email`/`secure_link` document-delivery channels; `deliver_document` is `portal`-only). Owner-statement *server-rendered immutable PDF* (`pdf_document_version_id`) is a tracked follow-up, not a pilot blocker (print-to-PDF view + CSV already ship). Paid `ChangeSubscription` billing is a paid-launch gate (real Stripe price IDs), not pilot flow — the no-card Growth trial is the pilot mechanism. Real notification providers and provider identifiers must not be invented.
