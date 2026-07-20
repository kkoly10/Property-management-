# Crecy Property Management Platform

Crecy is a global rental operating system for property operators, residents, owners, and invited vendors. This branch contains the first executable foundation: authentication, organization onboarding, operating entity and accounting book setup, a command-center shell, and the database security boundary behind them.

## Run locally

Prerequisites: Node.js 22 or newer and a Supabase project.

1. Copy `.env.example` to `.env.local` and add the project URL and publishable key.
2. Apply `supabase/migrations/20260720095008_phase_1_foundation.sql` to the Supabase project.
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

`test:db` runs the authoritative schema and the Phase 1 migration in embedded Postgres, then exercises tenant isolation, expired memberships, command idempotency, currency enforcement, and audit/outbox trace creation.

## Authoritative specification

Read [`AGENTS.md`](./AGENTS.md), then [`docs/crecy-v4/00_READ_ME_FIRST.md`](./docs/crecy-v4/00_READ_ME_FIRST.md). The `docs/crecy-v4` package supersedes all earlier specifications, ZIP archives, questionnaires, and generated-image text.
