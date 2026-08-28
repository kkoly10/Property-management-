# Crecy Property Management Platform

Crecy is a global rental operating system for property operators, residents, owners, and invited vendors. The executable MVP now includes the secure platform foundation, portfolio/import workflows, document ingestion, existing-lease activation, recurring rent generation, balanced and immutable journal posting, controlled manual-payment allocation, system receipts, Stripe-connected operator onboarding, direct connected-account resident Checkout sessions, signed and idempotent payment webhooks, connected-account refunds, returned-debit and dispute accounting, provider-payout settlement ingestion and exception controls, an operator payments/reconciliation workspace, resident balances and payment history, resident maintenance intake, and an operator vendor directory with work-order assignment and status lifecycle.

## Run locally

Prerequisites: Node.js 22 or newer and a Supabase project.

1. Copy `.env.example` to `.env.local` and add the Supabase project values. Add a Stripe `sk_test_` key and the `whsec_` signing secret for a Connect webhook pointed at `/api/internal/providers/stripe/webhook`.
2. Apply the SQL files in `supabase/migrations` in timestamp order. Configure `CRECY_INTERNAL_WORKER_SECRET` before invoking internal scheduled-worker routes.

### Scheduled workers

Rent generation, transactional mail, document scanning and operational cleanup only happen if something
invokes them. The schedule is defined in the repository at `src/lib/runtime/schedule.ts` and
`vercel.json` is generated from it — `npm run schedule:check` (part of `npm run check`) fails if the two
drift, or if a scheduled path has no `GET` route that fails closed.

| Path | Cadence | Requires |
| --- | --- | --- |
| `/api/internal/cron/recurring-charges` | hourly | nothing beyond the database |
| `/api/internal/cron/notifications` | every 10 min | `CRECY_NOTIFICATION_RELAY_URL` + `_SECRET` (503 without) |
| `/api/internal/cron/document-scans` | every 10 min | `CRECY_DOCUMENT_SCAN_RELAY_URL` + `_SECRET` (503 without) |
| `/api/internal/cron/operational-sweep` | daily | nothing beyond the database |

Set `CRON_SECRET` on the deployment; Vercel Cron sends it as `Authorization: Bearer $CRON_SECRET`.
**Without it every cron route stays closed** — the routes never degrade to public. The same routes also
accept `CRECY_INTERNAL_WORKER_SECRET`, so the jobs can be driven from another orchestrator or by hand.
A credential in the query string is rejected outright rather than honored.

Rent runs **hourly on purpose**: a property's local date crosses midnight at a different UTC instant in
every time zone, so each run charges only the schedules whose own property-local date has arrived. A
once-daily UTC run would charge most zones on the wrong date.

Scheduled runs answer `200` when everything succeeded or there was nothing to do, `207` when some items
failed, and `502` when every item failed — so a quietly broken job cannot look healthy in the
invocation log.

> Vercel's Hobby plan caps cron jobs at 2 and allows only once-daily schedules. This schedule needs a
> plan that permits four jobs at sub-daily cadence, or an external scheduler calling the same routes.
3. Install and start the app:

```bash
npm install
npm run dev
```

Without Supabase environment variables, the app still opens in setup-preview mode so the UI can be reviewed safely.

## Verification

```bash
npm run test
npm run test:db
npm run lint
npm run typecheck
npm run build
```

`test:db` runs the v4.1.1 authoritative schema and all application migrations in embedded Postgres. It exercises tenant, owner, relationship, and property-scope isolation; expired memberships; MFA-gated and idempotent commands; Stripe provider-connection and resident-payment isolation; payment, refund, return, dispute, and payout webhook replay; pending allocation/refund reservations and provider-event races; partial/full/failed refund accounting; won/lost dispute recovery; post-success bank returns; exact provider-reference settlement matching; payout amount exceptions; balanced settlement journals; country/book consistency; plan limits; document/import controls; lease activation; allocation and refund limits; evidence and receipt controls; resident projections; and audit/outbox traces. Correction evidence is recorded in [`docs/implementation/V4_1_1_CORRECTION_VALIDATION.md`](./docs/implementation/V4_1_1_CORRECTION_VALIDATION.md).

## Authoritative specification

Read [`AGENTS.md`](./AGENTS.md), then [`docs/crecy-v4/00_READ_ME_FIRST.md`](./docs/crecy-v4/00_READ_ME_FIRST.md). The `docs/crecy-v4` package supersedes all earlier specifications, ZIP archives, questionnaires, and generated-image text.
