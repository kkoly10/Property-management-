# Crecy Property Management Platform

Crecy is a global rental operating system for property operators, residents, owners, and invited vendors. The executable foundation now includes authentication, organization onboarding, operating entities and books, property and unit onboarding, the portfolio workspace, active-unit entitlement enforcement, and the database security boundary behind them.

## Run locally

Prerequisites: Node.js 22 or newer and a Supabase project.

1. Copy `.env.example` to `.env.local` and add the project URL and publishable key.
2. Apply the SQL files in `supabase/migrations` in timestamp order.
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

`test:db` runs the authoritative schema and both application migrations in embedded Postgres, then exercises tenant and property-scope isolation, expired memberships, command idempotency, country/book consistency, active-unit plan limits, usage metering, and audit/outbox trace creation.

## Authoritative specification

Read [`AGENTS.md`](./AGENTS.md), then [`docs/crecy-v4/00_READ_ME_FIRST.md`](./docs/crecy-v4/00_READ_ME_FIRST.md). The `docs/crecy-v4` package supersedes all earlier specifications, ZIP archives, questionnaires, and generated-image text.
