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

## Deep coverage — financial postings + resident portal round trip

A second, deeper pass drives the money path all the way through the double-entry ledger and
back out to the resident portal. It is split across three env-gated specs plus out-of-band
fixture seeding (the storage/scan pipeline and the recurring-charge worker have no UI, so those
prerequisites are seeded directly, exactly as the auth user is):

| Spec | Browser-driven | Seeded out of band (before it) |
| --- | --- | --- |
| `onboarding.spec.ts` | operator login → create org/entity/book/property | (confirmed auth user) |
| `lease-activation.spec.ts` | operator activates an existing lease via the wizard (`activate_existing_lease`) | an active `units` row + a scanned-clean `signed_lease` document/version + a raised `manual_payment_evidence_threshold_minor` |
| `payment-and-portal.spec.ts` | operator records a manual payment via the wizard (`record_manual_payment`); resident signs in and sees it in Crecy Living | one OPEN rent charge from `generate_recurring_charges` (service_role worker) + an active `resident_person` `user_relationship` |

### Verified in the live DB after the run

- **Both journals balanced with the correct account codes:**
  - `rent_charge` (from the worker): **1100 DR / 4000 CR** 150000 (AR / rental income).
  - `manual_payment` (from the browser): **1010 DR / 1100 CR** 150000 (undeposited checks / AR).
  - AR (1100) nets to zero, so the charge closed (`status='paid'`) and the payment posted a
    `succeeded` row + one immutable `payment_receipt` document.
- **Operator → resident round trip:** before payment the resident's `get_resident_balance_summary`
  returned `balanceMinor=150000`; after the browser payment it returned `balanceMinor=0` with the
  `check` payment (and its `receiptDocumentId`) in `get_resident_payment_history` — the same
  payment the resident saw rendered in Crecy Living `/home`.

### Out-of-band seeding used for the deep legs

Done via the privileged SQL connection between browser runs (the specs are UI-only):
direct inserts for the `units` row and the clean `signed_lease` document/version; a call to
`activate_existing_lease` as the operator; `generate_recurring_charges(run_date, ARRAY[schedule], run_id)`
to mint the open charge; and an `active` `resident_person` `user_relationship`
(`relationship_id = household_members.person_id`) for the resident user. The org
`settings->>'manual_payment_evidence_threshold_minor'` is raised so a sub-threshold payment needs no
evidence upload. Note: `document_versions.upload_status='clean'` is set directly — no RPC transitions
a version to clean; the malware-scan worker does that in production.

## Cleanup after the deep pass

The live project was again returned to pristine (0 auth users, 0 organizations, 0 tenancies,
0 journal transactions, 0 charges; 7 seeded roles) and the local build was rebuilt in demo mode,
with the demo smoke suite re-confirmed at 42/42.

## Scope boundary

Covered end-to-end against the live schema: auth, onboarding, lease activation, recurring-charge
generation, manual payment + double-entry ledger, receipts, and the resident portal read. Still
unexercised here (future passes): document delivery + acknowledgement through the portal (needs a
delivered-document fixture), owner statements with real postings, refunds/corrections/write-offs,
and provider (Stripe) payment flows.
