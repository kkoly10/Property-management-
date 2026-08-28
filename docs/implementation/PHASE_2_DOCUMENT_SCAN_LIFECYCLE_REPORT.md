# v4.2 Batch A1 — Document malware-scan lifecycle

## The defect this closes

`public.finalize_document` has always parked a new `document_versions` row at `upload_status='quarantined'`,
and 17 downstream gates refuse anything that is not `'clean'`. **Nothing in the product ever advanced a
version out of quarantine.** Every document uploaded through the product was therefore permanently
unusable, and the only way past it was a manual SQL edit — which file 27 §5.A1 explicitly forbids as
certification. This slice adds the missing half of the state machine:

    quarantined ──claim──▶ scanning ──verdict──▶ clean | rejected
                              │
                              └──failed attempt──▶ quarantined (backoff) ─▶ dead_letter

## What shipped

| Layer | Artifact |
| --- | --- |
| Migration | `supabase/migrations/20260828100000_phase_2_document_scan_lifecycle.sql` |
| Table | `private.document_scan_jobs` (one row per finalized version, `unique(document_version_id)`) |
| Enqueue | `public.finalize_document` redefined — same behavior, plus `insert … on conflict do nothing` |
| Worker RPCs (`service_role` only) | `claim_document_scan_jobs`, `complete_document_scan`, `fail_document_scan`, `requeue_stalled_document_scans` |
| Backoff | `private.scan_retry_delay(n)` — 30s × 3^(n−1), capped at 2 hours |
| Adapter | `src/lib/documents/scanner.ts` (provider-neutral relay) |
| Route | `POST /api/internal/documents/scan/dispatch` |
| Schema | `src/lib/validation/document-scan-worker.ts` |
| Authority | doc 12 gains the table; `validateAuthority()` table count 76 → 77 (policies unchanged at 59) |

## Design decisions worth stating

**The database owns the state machine; no provider is invented.** `providerCode` is the neutral
`"relay"`; the operator points `CRECY_DOCUMENT_SCAN_RELAY_URL` at their own scanning service. With no
relay configured the route reports **503**, and documents stay quarantined. Failing closed is the whole
point: an unscanned document must never become usable because a scanner was missing.

**A verdict is bound to a specific object.** The scan job copies `(bucket, path, sha256)` at enqueue
time. The worker computes the digest of the bytes **it actually downloaded**, and
`complete_document_scan` re-proves that digest against *both* the job and the live version row, plus the
storage coordinates and the organization, before applying anything. A stale verdict, a replayed verdict
from another version, or a verdict for an object swapped underneath raises `SCAN_TARGET_MISMATCH`.

**Only `complete_document_scan` can produce `'clean'`.** A failed scan *attempt* is not a verdict:
`fail_document_scan` always returns the version to `'quarantined'`, so a broken or hostile scanner can
only ever keep documents unusable. Likewise `readScanVerdict` accepts exactly the two words `clean` and
`infected` — a missing field, `"CLEAN"`, `"ok"`, or a truncated body is a failed attempt, never a
release.

**A rejected version is final.** `DOCUMENT_VERSION_NOT_SCANNABLE` blocks any later verdict on a version
that has left the scan window, so an infected document cannot be talked back into `'clean'`.

**Misconfiguration stays retryable.** A 401/403/404 from the relay means *our* credential or endpoint is
wrong; dead-lettering there would permanently destroy the queue while the operator was still fixing a
setting. Only a relay rejection of the specific object (400/413/422) is non-retryable.

## Verification

`npm run check` green: lint, typecheck, **198 vitest tests across 37 files**, `test:db`, build.

`test:db` drives the real RPCs end to end and asserts the three cases file 27 §5.A1 requires:

1. **upload → quarantined → scanning → clean → downstream use succeeds.** The document that the
   delivery/secure-link tests deliver is now the one the **scan worker cleaned**, not a hand-written
   `upload_status='clean'` row.
2. **upload → rejected → downstream use stays blocked.** `deliver_document` raises
   `DOCUMENT_NOT_DELIVERABLE`; a later `'clean'` verdict on the same row raises
   `DOCUMENT_VERSION_NOT_SCANNABLE`.
3. **A stale/mismatched digest cannot clean another object.** Both a wrong digest and *another
   version's valid digest* raise `SCAN_TARGET_MISMATCH`, and the version stays in `scanning`.

Plus: `service_role`-only grants (all four RPCs raise `permission denied` for `authenticated`), claim
concurrency (`SKIP LOCKED` — a second worker cannot re-claim), verdict idempotency and
`SCAN_VERDICT_CONFLICT`, retry backoff, dead-letter + incident audit, and the stall sweep.

### Mutation testing (proof the assertions are load-bearing)

| Mutation | Result |
| --- | --- |
| `finalize_document` skips the enqueue | **CAUGHT** |
| Claim does not mark the version `scanning` | **CAUGHT** |
| Infected verdict cleans the version | **CAUGHT** |
| `fail_document_scan` cleans instead of quarantining | **CAUGHT** |
| Drop `DOCUMENT_VERSION_NOT_SCANNABLE` guard | **CAUGHT** |
| Stall sweep leaves the version in `scanning` | **CAUGHT** |
| Dead-letter is not audited | **CAUGHT** |
| Drop the job-side SHA binding *only* | survived — **equivalent mutant**: the version-side binding still catches it |
| Drop the version-side SHA binding *only* | survived — same, mirrored |
| Drop **both** SHA bindings | **CAUGHT** (`Expected database error: SCAN_TARGET_MISMATCH`) |

The two surviving single mutations are deliberate defense in depth: either check alone rejects a
mismatched verdict, and removing both is caught.

## Regression caught during this slice

The first draft of the `finalize_document` redefinition was rebased on the **phase-2 original** rather
than the shipped body, silently dropping the `tenancy` and `work_order` parent-resource branches added
by `20260722201220` and `20260723090000` (and `documents.tenancy_id`). A `diff` of the redefinition
against the latest shipped definition caught it before any test ran. **When redefining a
`create or replace` command, diff against the newest shipped body, not the first one.**

## Not done here (stated, not hidden)

- **Scanner not configured in any environment.** No relay URL/secret is set, so the route returns 503
  and no document has been cleaned by a real scanner outside the embedded suite. Per file 27 §15 this
  is `scanner: implemented, not configured, not exercised`.
- **No scheduled caller yet.** The dispatch route exists but nothing invokes it on a schedule — that is
  Batch A2.
