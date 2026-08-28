# v4.2 Batch A3 — Canonical active-organization context

## The defect

Crecy's tenant is the organization and an operator may belong to several — that is the property-manager
model. But **no operator surface ever carried an organization.** Three different wrong behaviors
coexisted:

1. **Cross-tenant union (worst).** Most workspace RPCs took no organization argument and filtered only
   by `private.has_property_access(...)` / `has_org_permission(...)`, so they returned every row the
   caller could see **across all their organizations at once** — a single maintenance queue, payment
   summary and announcement list merging two tenants.
2. **Implicit first organization, in SQL.** `get_operator_command_center` and
   `get_staff_management_workspace` accepted `p_organization_id uuid default null` and then resolved
   `order by m.created_at, m.id limit 1`. `get_operator_global_search` did the same with *no parameter
   at all*, so a switcher could not have steered it.
3. **Implicit first organization, in TypeScript.** `dashboard.ts` picked a workspace name with
   `.from("organizations").limit(1)` and **no ordering** (nondeterministic);
   `documents.ts`/`imports.ts` picked one with `.order("created_at").limit(1)`;
   `onboarding/entity/actions.ts` picked a membership with `.limit(1)` and no ordering.

`documents.ts` was additionally a live cross-tenant bug independent of any switcher: it derived
`organizationId` from the first organization but listed `properties` and `documents` **unscoped**, so
the page showed a merged document list with an upload form bound to only one tenant.

And there was no switcher — `app-shell.tsx` had an inert `<button>` with the organization name and a
chevron, no handler, no menu.

## What shipped

| Layer | Artifact |
| --- | --- |
| Migration | `supabase/migrations/20260828120000_phase_8_active_organization_context.sql` |
| Switcher source | `public.list_operator_organizations()` — active memberships only |
| Gate | `private.has_active_organization_membership`, `private.enter_organization_context` |
| Narrowed helpers | `has_property_access`, `has_org_permission`, `has_unscoped_org_permission` |
| Scoped surfaces | 20 organization-scoped RPC overloads |
| Closed surfaces | `EXECUTE` revoked from `authenticated` on 11 unscoped **collection** RPCs |
| Reproduced | `get_operator_global_search(uuid,text,integer)` |
| Context | `src/lib/organization/context.ts`, `actions.ts` |
| UI | `src/components/app/organization-switcher.tsx`, `organization-context-notice.tsx` |
| Browser | `e2e/organization-context.spec.ts`, `e2e-connected/organization-switch.spec.ts` |

No table and no RLS policy added — authority counts unchanged (77 / 59).

## Why a narrowing context rather than 20 rewritten bodies

The obvious implementation is to copy each workspace RPC and add an `organization_id` filter. Those
bodies total **852 lines**, several with summary aggregates computed separately from their item lists —
so "missed one filter" would be a silent cross-tenant leak in a *summary count*, which no reviewer would
spot.

Instead `private.enter_organization_context(org)` proves membership and sets a transaction-local
setting, and the three authorization helpers read it as `(setting is null or column = setting)`. Two
properties make this safe:

- **It can only ever NARROW.** An unset context behaves exactly as the shipped predicate did, and a set
  one can only remove rows. Nothing becomes reachable that was not reachable before, so the setting is
  not a privilege even if an attacker could set it (they cannot — it is established only inside a
  `security definer` wrapper, after membership is proven).
- **It dies with the transaction** (`set_config(..., is_local => true)`). PostgREST runs each RPC in its
  own transaction, so a context cannot leak into another request. A test asserts this directly.

Each scoped surface is then a ~10-line wrapper that enters the context and calls the **shipped,
already-proven body unchanged** — so scoping reaches every query inside it, aggregates included.

`get_operator_global_search` was the one exception: it resolved its organization inline with no helper
to narrow, so its body is reproduced with exactly two changes (organization first; the implicit pick
replaced by a validated lookup). A diff against the shipped definition confirms the rest is
byte-identical.

## Where the revocation line is drawn

`EXECUTE` is revoked from `authenticated` on the **11 collection surfaces** — the ones that take no
resource and therefore union across tenants. That turns "a fetcher forgot the organization" from a
silent cross-tenant read into a permission error.

**Resource-id surfaces keep their unscoped grant deliberately.** `get_payment_detail`,
`get_import_job_detail`, `get_conversation_detail` and friends return ONE resource belonging to exactly
one organization, so they cannot mix tenants; RLS already decides whether the caller may see it. An
earlier draft of this slice revoked them too, which broke a real capability — a resident inspecting
their own payment's settlement history has no operator organization to supply. Their scoped overloads
exist for operator callers, which additionally pins the context.

## The app-layer rules

`getOrganizationContext()` returns one of six states, and the branch that matters most is `revoked`:

| State | Meaning |
| --- | --- |
| `none` | No membership — redirect to onboarding |
| `active` | Exactly one organization, or a valid stored selection |
| `unselected` | Several organizations, nothing chosen — the operator must choose |
| **`revoked`** | **A selection existed and no longer resolves — report it, never replace it** |
| `setup` / `error` | Supabase unconfigured / lookup failed |

Automatic selection happens in exactly one case: there is nothing to choose between. When a selection
disappears the operator is told and asked to choose again — they are **not** slid into another tenant's
dashboard, residents and ledger, which is what a "helpful" fallback would do.

The selection lives in an httpOnly, sameSite=lax cookie written only after the server re-reads the
caller's live memberships and finds the requested one. It is still revalidated on every use: the cookie
is a preference, never a grant. `selectOrganization` calls `revalidatePath("/", "layout")`, which is
what makes "switching refreshes all organization-scoped product data" true rather than aspirational.

## Verification

`npm run check` green: lint, typecheck, **222 vitest tests across 41 files**, `test:db`,
`schedule:check`, build. **51/51 demo Playwright tests pass**, including 3 new organization-context
tests across 11 operator routes.

`test:db` builds a genuine second organization for the same operator and asserts:

- `list_operator_organizations` returns exactly the two, with display name and role;
- all 11 unscoped collection surfaces raise `permission denied`;
- **eight audited surfaces return the owning organization's rows and *zero* rows in the other** —
  maintenance, communications, owners, payments, receivables, payment connections, global search,
  dashboard, team;
- global search finds the SECOND organization's own property (proving it is no longer pinned);
- `ORGANIZATION_REQUIRED` for a null organization, `ORGANIZATION_SCOPE_DENIED` for a non-member;
- **a revoked membership and an expired membership both stop working on the very next call**;
- the context does not survive the statement that established it.

The payment-connection assertion is a real mixing test rather than an "empty means isolated" one: both
organizations have operating entities, so both surfaces are non-empty and the invariant asserted is
provenance — every row must belong to the organization that was asked for.

### Mutation testing

| Mutation | Result |
| --- | --- |
| Context does not narrow `has_property_access` | **CAUGHT** |
| Context does not narrow `has_org_permission` | **CAUGHT** (after adding the organization-level surface case, which initially had no coverage) |
| Null organization silently allowed instead of refused | **CAUGHT** |
| Membership not revalidated on use | **CAUGHT** |
| Switcher lists revoked/expired memberships | **CAUGHT** |
| Context session-wide instead of transaction-local | **CAUGHT** |

## Not done here (stated, not hidden)

- **The two-organization browser switch has not been RUN.** `e2e-connected/organization-switch.spec.ts`
  exists and asserts all 14 audited surfaces follow the switch, but it needs a live project with an
  operator holding two active memberships (`E2E_SECOND_ORGANIZATION_NAME`) and self-skips without one.
  The equivalent isolation is proven in `test:db` against real RPCs.
- **`billing` and `exports` have no operator route**, so two names on the spec's audit list cannot be
  audited. The only export path is an API route; there is no billing UI at all.
- **`get_operator_command_center`'s null branch still contains its `limit 1` fallback.** It is now
  unreachable from the product (the app always passes a validated organization, and the DB rejects a
  non-member), but the dead branch is still in the 495-line shipped body. Removing it means reproducing
  that body — a follow-up, not a hidden gap.
- Resident and owner portal RPCs are untouched by design: they are scoped by the caller's own
  relationship, not by an operator's chosen context.
