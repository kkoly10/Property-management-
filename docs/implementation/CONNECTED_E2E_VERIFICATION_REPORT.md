# Connected-mode E2E verification (live Supabase project)

**Status:** complete and verified. Runs the real app against the live, fully-migrated
Supabase project (all 43 migrations applied) — the true end-to-end path, complementing the
demo-mode smoke suite that renders every surface with preview data. The specific project is
supplied at run time via env (`.env.e2e.local`), never hardcoded.

## What it proves

A single browser-driven flow exercises the entire stack with no mocks:

```
browser → server action → supabase.auth.signInWithPassword
        → command RPC (create_organization / create_operating_entity_and_book / create_property)
        → RLS gate (private.* helpers) → base-table writes
        → audit.audit_events + private.outbox_events
        → sanitized read-back via get_operator_command_center → rendered dashboard
```

Two tests (`e2e-connected/onboarding.spec.ts`, run serially):

1. **Unauthenticated redirect** — `GET /app` with no session is redirected by the real
   middleware to `/login?next=%2Fapp` (proves `updateSession` runs against the live project,
   not the demo bypass).
2. **Login + onboarding provisions a live tenant** — signs in through the UI, then walks the
   real onboarding commands (organization → operating entity + accounting book → property),
   and finally reloads `/app` and asserts the command center reads the tenant back: the real
   organization display name is shown, the "Connect Supabase to activate this workspace"
   setup banner is **absent**, and the scope line reports the accessible property.

## Empirical DB verification (post-run)

The provisioned tenant was confirmed directly in the live database:

| Row | Value |
| --- | --- |
| organization | `Crecy E2E …` · `customer_path=property_manager` · `created_by` = test user |
| membership | `role_code=org_owner`, `status=active`, `user_id` = test user |
| operating entity → book | linked, `functional_currency_code=USD` |
| property | linked to org + book |
| audit / outbox | **3 audit_events + 3 outbox_events** — one per command |

The `org_owner` membership auto-minted for the caller is exactly the onboarding contract, and
the 3+3 audit/outbox rows confirm each command's trace fired through the `security definer`
functions and RLS.

## How to run it

The suite **self-skips** unless the connection env is present, so it is inert by default
(committed with no secrets). To run it against a project:

1. Seed a confirmed email/password auth user in that project (see the seed SQL in the PR
   discussion / `.env.e2e.example`). The user needs `email_confirmed_at` set and a matching
   `auth.identities` row so `signInWithPassword` succeeds.
2. `cp .env.e2e.example .env.e2e.local` and fill in the project URL, publishable key, and the
   seeded user's email/password.
3. Export those vars, then:
   ```bash
   npm run build                                              # NEXT_PUBLIC_* inline into the client bundle
   npx playwright test --config=playwright.connected.config.ts
   ```
   (`playwright.connected.config.ts` serves the production build on port 3200 with the
   Supabase env; the browser is the pre-installed Chromium.)

## Cleanup / isolation

Each run uses a unique org slug (`crecy-e2e-<timestamp>`) so re-runs never collide. After
verification the live project was returned to its pristine pre-run state (0 auth users,
0 organizations, 7 seeded role definitions) — the E2E tenant and test user were removed.

## Scope boundary

This covers the operator bootstrap + read path (auth, onboarding commands, RLS, audit/outbox,
dashboard). Deeper connected flows (financial postings, document delivery + acknowledgement,
resident/owner portals) are the natural next layer and would seed a richer fixture; they are
not part of this pass.
