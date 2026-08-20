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

## Extended coverage — documents, reversals, owner statements

A third pass drives four more feature areas against the live project, each on top of the base
tenant fixture (org / entity / book / property / unit / tenancy / charges / succeeded payment):

| Spec | Browser-driven | Verified in the live DB |
| --- | --- | --- |
| `document-delivery.spec.ts` | operator delivers via `POST /api/v1/document-deliveries` (API-only, driven from the authenticated session); resident acknowledges via the `/documents` "Acknowledge receipt" button | `document_deliveries` row `delivered`; `document_acknowledgements` row type `received`, by the resident, with evidence hash |
| `financial-reversals.spec.ts` | operator writes off an open charge (`/app/payments`); operator reverses the manual payment (`/app/payments/{id}` correction) | write-off journal **6300 DR / 1100 CR**, charge → `written_off`; reversal journal **1100 DR / 1010 CR**, payment → `reversed`, its charge reopened to `open` |
| `owner-statement.spec.ts` | operator calculates + finalizes a statement (`/app/owner-statements/{ownerEntityId}`); owner views it in Crecy Owner | `reporting.owner_statement_snapshots` v1, **net owner position $1,500** (= $3,000 rent income − $1,500 write-off), plus a balanced `owner_statement_accrual` journal **3905 DR / 2100 CR** |

Every journal posted by these flows was confirmed balanced with the correct account codes.
Out-of-band seeds (no in-app command exists): a clean deliverable document/version; the
`owner_entities` + `ownership_interests` (fraction 1.0) rows; and an active `owner_entity`
`user_relationship` for the owner user. Ids are passed to the specs via env.

**Provider (Stripe) refunds are intentionally excluded** — `request_provider_refund` +
`complete_provider_refund` require configured Stripe Connect and a signed provider webhook, which
are not available in this environment. The *manual* refund path (payment correction: `reversal` /
`return`) is covered above.

### Bug found and fixed by this pass

The connected run surfaced a real defect that demo/preview mode had masked: the recipient
documents fetcher (`getRecipientDocumentDeliveries`, `src/lib/data/documents.ts`) embedded
`document_versions → documents`, but `document_versions` has **two** foreign keys to `documents`
(a single-column `document_id` FK and a composite `organization_id, document_id` FK). PostgREST
cannot disambiguate and returns `PGRST201`, so the query threw and both `/documents` (resident)
and `/owner/documents` (owner) rendered "Documents unavailable" against a real backend. Fixed by
naming the FK in the embed (`documents!document_versions_document_id_fkey(...)`). This bug was
invisible to `test:db` (PGlite runs raw SQL, not PostgREST embeds) and to demo mode (preview data,
no query) — only the connected E2E exercised the real PostgREST path.

## Operations coverage — maintenance, announcements, messaging

A fourth pass drives operational features on top of the base tenant:

| Spec | Browser-driven | Verified in the live DB |
| --- | --- | --- |
| `maintenance.spec.ts` | resident submits a request; operator creates+assigns a work order, runs it accept → schedule → start → complete, then posts the cost | request + work order → `completed`; `maintenance_cost` journal **6200 DR / 2000 CR** $250 (repairs / AP), balanced |
| `announcements.spec.ts` | operator publishes a property-resident announcement; resident sees it on `/home` | 1 published announcement + **1 `announcement_deliveries`** row fanned out to the resident |
| `messaging.spec.ts` | resident messages the operator; operator reads it and replies; resident sees the reply | 3 `messages` rows (operator + resident) in the auto-provisioned conversation |

Fixture seeded out of band (no in-app command / storage/scan pipeline): one active `vendors` row and
`organizations.settings.work_order_completion_evidence_required='false'` (so completion needs no
scanned photo). The maintenance work-order transitions each dead-end on a client success alert, so
the spec reloads between steps to advance the state machine.

**Note on a flake, not a bug:** an earlier messaging run showed a false pass because the assertion
matched the retained textarea after a transient send failure. The spec was hardened to require the
textarea to clear (which only happens on a persisted send) plus the rendered bubble; the operator RPC
was independently confirmed to authorize the operator, and the retry persisted correctly.

**Staff invitation is environment-blocked** (not a code issue): `POST /api/v1/staff/invitations`
requires `SUPABASE_SECRET_KEY` (admin client, 503 without it) and a working email transport
(`signInWithOtp`, 502 on send failure) — neither is configured here, same class of blocker as Stripe.
The *acceptance* half is reachable but needs an invite seeded with a known token; deferred.

## Scope boundary

Covered end-to-end against the live schema: auth, onboarding, lease activation, recurring-charge
generation, manual payment, receivable write-off, payment reversal, owner-statement finalization,
document delivery + acknowledgement, the maintenance lifecycle + cost posting, announcements, and
resident↔operator messaging — with the double-entry ledger verified for every financial step and the
resident + owner portal reads. Not exercised here: provider (Stripe) refund/payout flows and staff
invitation invite delivery (both blocked on external config — server secret key + email transport).
