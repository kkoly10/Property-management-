# Phase 7 Progress Report — Owner Statement CSV Export

**Status:** implemented (pure serializer + unit tests, export route, owner + operator download links)
**Date:** 2026-08-06

## Why this slice

The pilot owner surface calls for downloadable finalized statements (`docs/crecy-v4/10_PILOT…`). Finalized statements were viewable in-app but there was no export. `reporting.owner_statement_snapshots` even carries `pdf_document_version_id` / `csv_document_version_id` columns — but the snapshot is **append-only for both UPDATE and DELETE**, and `finalize_owner_statement` (a pure-SQL function) inserts the row without populating them, so those columns can never be backfilled and SQL can't render a CSV/PDF anyway. This slice ships **on-demand CSV generation** instead, which sidesteps the append-only columns entirely.

## Design decision — on-demand, not render-at-finalize

- **On-demand (chosen).** `get_owner_statement_detail` already returns the complete renderable statement — owner, property, period, currency, per-account `lines` (`accountCode`/`accountName`/`category`/`amountMinor`/`transactionCount`), the four totals, the live `ownerPayableMinor`, and remittances — and is RLS-scoped to the statement's owner and authorized operators. A route handler reads it and streams CSV. **No migration, no persistence, no new dependency, no new authorization.**
- **Render-at-finalize (rejected).** Populating the document-version columns would require restructuring the pure-SQL `finalize_owner_statement` into an app-layer command that renders artifacts, uploads to Storage, and writes `document_versions` rows — a large multi-surface change. The append-only trigger blocks any later backfill, so there's no lighter path. Out of pilot scope.
- **PDF deferred.** No PDF library is installed; the only real server-side option (headless Chromium / Playwright) is not a project dependency and is serverless-hostile. The codebase's own precedent for a "PDF" of a system record is browser print of an on-demand HTML page (`receipts/[documentId]`). CSV ships now; PDF is a deliberate follow-up (add a print-optimized statement view first).

## Implemented scope

- **`src/lib/owner-statements/csv.ts`** — a pure, dependency-free serializer:
  - **RFC-4180 escaping** — fields containing a comma, quote, CR, or LF are quoted with internal quotes doubled.
  - **Spreadsheet formula-injection guard (OWASP)** — owner-controlled text (owner/property/account names, references) with a leading `=`, `+`, `-`, `@`, tab, or CR is prefixed with an apostrophe so a spreadsheet treats it as text. Numeric amount fields are deliberately **not** guarded, so negative values stay numeric.
  - Amounts are minor→major, `toFixed(2)` (correct for every supported 2-decimal currency). CRLF line endings.
  - A safe, descriptive filename builder (`owner-statement-<property-slug>-<from>-to-<to>-vN.csv`).
- **`GET /api/v1/owner-statements/[statementSnapshotId]/export`** — `auth.getUser()` → 401; then the RLS-scoped fetcher (error → 502, no item → 404); otherwise `text/csv; charset=utf-8` with `Content-Disposition: attachment` and `Cache-Control: no-store`.
- **Download links** — "Download CSV" on the owner statement detail page (`/owner/statements/[statementId]`, gated on `ready` mode) and a per-statement "CSV" link on the operator list (`/app/owner-statements`, when a finalized statement exists).

## Architecture and controls

- **No new authorization.** The export reuses `get_owner_statement_detail`, whose RLS already restricts a statement to its owner and to operators with the right property access; an unauthorized caller simply gets no item (404).
- **No new tables, RLS policies, migration, or dependency.** The `pdf_document_version_id` / `csv_document_version_id` columns are left NULL and untouched. Authority counts unaffected (74 tables / 59 policies).

## Files

- `src/lib/owner-statements/csv.ts` (+ `.test.ts`)
- `src/app/api/v1/owner-statements/[statementSnapshotId]/export/route.ts`
- `src/app/owner/statements/[statementId]/page.tsx`, `src/app/app/owner-statements/page.tsx`

## Verification evidence

`npm run check` passes end-to-end: ESLint, TypeScript, 108 Vitest tests (5 new serializer/filename tests), the embedded-Postgres suite, and the production build. The serializer tests assert: correct metadata + line rows, minor→major amounts, totals, CRLF framing, remittances section presence/absence, RFC-4180 quoting of a comma inside an account name, formula-injection neutralization of a `=SUM(...)` owner name (apostrophe-prefixed and quoted), and filename slugging + fallback.

## Deferred / follow-up

- **PDF export** — add a print-optimized statement view, then optionally a headless-Chromium renderer as a separate, deliberately-scoped change.
- **Persisting the artifact** to the `document_versions` columns would require moving finalize into an app-layer command; only worth it if immutable stored copies (vs. deterministic on-demand regeneration) become a requirement.
