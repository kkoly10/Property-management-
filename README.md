# Crecy Property Management Platform

Crecy is a global rental operating system for property operators, residents, owners, and invited vendors. The executable MVP now includes the secure platform foundation, portfolio/import workflows, document ingestion, existing-lease activation, recurring rent generation, balanced and immutable journal posting, controlled manual-payment allocation, system receipts, Stripe-connected operator onboarding, an operator payments workspace, and resident balances and payment history.

## Run locally

Prerequisites: Node.js 22 or newer and a Supabase project.

1. Copy `.env.example` to `.env.local` and add the Supabase project values. Add a Stripe `sk_test_` key to exercise connected-account onboarding locally.
2. Apply the SQL files in `supabase/migrations` in timestamp order. Configure `CRECY_INTERNAL_WORKER_SECRET` before invoking internal scheduled-worker routes.
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

`test:db` runs the v4.1.1 authoritative schema and all application migrations in embedded Postgres. It exercises tenant, owner, relationship, and property-scope isolation; expired memberships; MFA-gated and idempotent commands; Stripe provider-connection isolation; country/book consistency; plan limits; document/import controls; lease activation; balanced recurring-charge and payment journals; allocation and refund limits; evidence and receipt controls; resident projections; and audit/outbox traces. Correction evidence is recorded in [`docs/implementation/V4_1_1_CORRECTION_VALIDATION.md`](./docs/implementation/V4_1_1_CORRECTION_VALIDATION.md).

## Authoritative specification

Read [`AGENTS.md`](./AGENTS.md), then [`docs/crecy-v4/00_READ_ME_FIRST.md`](./docs/crecy-v4/00_READ_ME_FIRST.md). The `docs/crecy-v4` package supersedes all earlier specifications, ZIP archives, questionnaires, and generated-image text.
