# Standalone mobile production release checkpoint — 2026-10-10

This is a **local release candidate**, not yet pushed, merged, or deployed.

## Branch and boundaries

- Branch: `feat/mobile-independent-20261010`.
- Base: `origin/main` at `1be8ef122d3b2b4c55d9689d7518f2fed6f907f9` when the worktree was created.
- Worktree: `/Users/komlankouhikocrecyolympe/Developer/crecy-mobile-standalone`.
- Prerequisite mobile baseline: original `3ca49b9`, cherry-picked as `4a1262d`.
- Subsequent mobile passes: `bc47d12`, `e26c435`, `7aa6dce`, cherry-picked as `0f09be9`, `0be298b`, `1bfa0c3`.
- Includes safe branch-specific Vercel preview suppression for this exact feature branch; should not trigger a preview even when pushed.
- Corrected a brittle unit assertion checking literal CSS class ordering without changing the mobile control contract.

## Intentional exclusions

This standalone branch does NOT add the homeowner/rental B1–B5 backend, migrations, marketplace routes, tenancy conversions, or domain/provider configuration. It exists so operator/owner/resident mobile improvements can ship before database-connected homeowner release.

## Before any production merge

1. Verify remote main has not moved, and reconcile if needed. Do not merge an untested stale tree.
2. Require clean local lint, TypeScript, Vitest, DB, schedule, migration, Next build and Playwright (via `pnpm check`) at the exact release SHA.
3. Verify no new preview or branch deployment; do not use a PR/preview path that bypasses the suppressed branch setting.
4. Only after explicit authorization, merge/push once to main and verify Vercel production deployment SHA, served HTML, and representative iOS operator/owner/resident navigation. No production Supabase migrations are required for this mobile-only branch.
5. Do not confuse this deployment with the homeowner B1–B5 release, whose database/provider/pilot certification remains outstanding.

## Executed release gate (October 10, 2026)
- Candidate code SHA before this documentation-only checkpoint: `20e72574882ec6dff55eba8b4b7375e1ef0935b1`.
- Executed `CRECY_E2E_PORT=34841 pnpm check` with **exit 0**.
- ESLint and TypeScript passed; Vitest **611/611** tests across 82 files passed.
- Local DB/schema, schedule and migration checks passed.
- Next.js production build passed; Playwright **247/247** passed.
- Local evidence: `/tmp/crecy-mobile-standalone-final-gate.log` (Mac-local; not a hosted artifact).
- The browser suite uses the controlled demo harness. Supabase-not-configured notices from inaccessible real backend endpoints are **not connected-production proof**.
- The branch still contains no added Supabase migrations and has not been pushed, merged or deployed.
