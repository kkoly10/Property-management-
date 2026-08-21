# Phase 3 — Completing the occupied-portfolio import

**Migrations:** `20260729100000_phase_3_combined_import.sql`,
`20260729110000_phase_3_resident_and_balance_imports.sql`,
`20260729120000_phase_3_xlsx_source_documents.sql` (forward-only; commands and one function
redefinition — no table and no RLS policy, so authority counts stay 76/59).

## What now ships

`create_import_job` accepts `import_type IN ('portfolio','leases','combined','residents','opening_balances')`.

| Leg | One row means | Postconditions |
| --- | --- | --- |
| `portfolio` | a property/unit | empty property + unit |
| `combined` | an occupied unit | property + unit (created or reused), household + primary member, active lease, tenancy with a receivable account, armed rent schedule, balanced opening receivable |
| `leases` | a lease on an imported unit | as above, minus property/unit creation |
| `residents` | a co-resident | an additional `household_members` row on an existing tenancy's household |
| `opening_balances` | a migrated balance | one balanced 1100 DR / 3900 CR journal for an existing tenancy |

Every lease-bearing leg leaves the tenancy **operational** — `test:db` drives
`generate_recurring_charges` against the imported schedule and asserts a charge is produced.

## Decisions worth keeping

- **`combined` re-resolves the property at commit** rather than trusting the id captured at validation,
  so a property created by an *earlier row of the same file* is reused instead of duplicated.
- **Unit-plan seats count only units the commit ADDS.** A row reusing an existing unit consumes no
  seat. Pinned by a plan-boundary test, because with headroom an over-count is invisible and would
  refuse a legal import.
- **A repeated unit in one file is always an error** — both rows would activate overlapping tenancies —
  and an already-occupied unit is rejected at validation *and* re-checked under the unit lock at commit
  against a concurrent activation.
- **Co-residents are never primary contacts.** The lease import already designated one, and
  `household_primary_active_unique` makes a second active primary impossible anyway.
- **A person already known to the organization is matched by email and reused**, and a row restating an
  existing membership reports `ALREADY_A_MEMBER` rather than silently double-adding — so re-running a
  roster is safe.
- **One opening balance per tenancy, ever** — checked at validation and re-checked under the tenancy
  lock at commit, because doubling a receivable is a financial defect rather than a nuisance.
- Person email is compared as lowered text, not cast to `citext`: the extension's schema is not on the
  empty `search_path`.

## True `.xlsx` sources

`src/lib/imports/xlsx.ts` reads the first worksheet into the same shape `parseCsv` returns.

**The SheetJS npm package is deliberately not used.** Its only published version (`xlsx@0.18.5`) carries
unfixed high-severity prototype-pollution (CVE-2023-30533) and ReDoS advisories — the fix ships only
from the vendor's own CDN — which disqualifies it for parsing operator-uploaded files. ExcelJS pulls
nine transitive packages to write formatted workbooks this product never writes. The reader depends
only on **fflate** (MIT, zero dependencies) for the ZIP container, matching the codebase's existing
posture of hand-written CSV read and write.

Hardening, because an `.xlsx` is an attacker-supplied ZIP of attacker-supplied XML: bounded entry count
and total bytes with only the four needed entries inflated; **null-prototype row records**, so a column
named `__proto__` becomes an own property (the exact defect class behind the SheetJS advisory, with a
test asserting `Object.prototype` is untouched); DOCTYPE rejected outright; bounds-checked
shared-string lookups; the same row/column limits the CSV path enforces. Cells are placed by
spreadsheet reference, not by order, so a row omitting an empty middle cell still aligns to its header.

## Document ZIP + manifest

`api/v1/imports/document-archives` takes a ZIP whose root `manifest.csv` names each file and the entity
it belongs to (`organization | property | unit | tenancy`). `mode: "validate"` previews resolution and
every error without writing; `mode: "commit"` ingests.

Commit **drives the existing single-file ingestion pipeline** once per row — `create_document_upload_grant`
(which re-checks permission, mime, and size in the database), the upload, then `finalize_document` —
rather than adding a second way to create a document. Versions therefore land `quarantined` exactly
like a hand-uploaded file, so archive contents cannot skip the malware-scan gate. **No new SQL command
and no new table.**

Authorization is RLS, not a service-role bypass: target resolution runs through the caller's own
client, so a property the operator cannot see does not resolve and the row reports
`PROPERTY_NOT_FOUND`.

**Stated limitation:** unlike the row-oriented legs this commit is *not* one transaction — each file is
its own grant and finalize, and the response reports per-row failures with a 207. That is the right
shape for blob ingestion: grant/finalize keys derive deterministically from (archive version, file
path), so a partial run resumes on re-import instead of duplicating what landed, and losing a whole
archive to one bad file would be worse. Nothing financial is written here.

## The six-place mime allowlist

Enforced in the zod `documentMimeTypes`, `create_document_upload_grant`, the storage bucket's
`allowed_mime_types`, `src/lib/imports/source-mime.ts` (source picker), the import route's version
query, and `create_import_job`. **Change all six together** — a type added to some but not all produces
a file the operator can upload but never import, or vice versa. Centralizing the list caught a live
drift: the source picker still filtered to CSV, so an uploaded `.xlsx` would never have been choosable.

## Verification

`npm run check` green. Mutation tests confirm the load-bearing assertions:

| Mutation | Caught by |
| --- | --- |
| Trust validation's stale property id | "did not create one property, two units, two tenancies, and one opening balance" |
| Count every row as a new unit seat | "reusing an existing unit at the exact plan limit was refused" |
| Post the opening balance one-sided | `JOURNAL_NOT_BALANCED` from the deferred balance trigger |
| Make a co-resident a second primary | commit fails on `household_primary_active_unique` |
| Drop the one-balance-per-tenancy guard | "re-importing an opening balance was not refused" |
| Never reuse an existing person | "re-running the roster did not flag both rows as already-members" |
