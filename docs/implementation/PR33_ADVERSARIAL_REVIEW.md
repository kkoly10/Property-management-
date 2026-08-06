# PR #33 — Adversarial Review Outcome

**Date:** 2026-08-06
**Scope:** the four command/migration slices on `claude/mvp-progress-assessment-axvajc` at the time of review — maintenance-cost→ledger, reconciliation-exception resolution, receivable write-off, owner-portal invite. (The CSV-export slice landed after the review started and was reviewed separately/inline.)

## Method

A multi-dimension adversarial review: five independent finders (ledger invariants, authorization & cross-tenant isolation, idempotency/replay/concurrency, API/validation/UI, test coverage) over the branch diff, then an independent skeptic per finding that tried to **refute** it against the actual code before it counted as confirmed.

## Result

**No high-severity defects. Zero authorization, cross-tenant, or ledger-correctness problems.** Three of the five finders found nothing. Three findings were raised; **2 confirmed (both low), 1 refuted.**

### Confirmed 1 (low) — journal idempotency_key is not actor-scoped — ACCEPTED (documented), not changed

`journal_transactions` is keyed `unique (accounting_book_id, idempotency_key)` with no actor component, while `private.idempotency_records` is actor-scoped `(organization_id, actor_user_id, route, idempotency_key)`. Two **distinct** operators who reuse the **same literal idempotency-key string** for **different** operations in the same accounting book collide on the journal unique constraint; the second operator's legitimate, distinct posting aborts with a raw `23505` (mapped to a generic 422) instead of posting.

**Why not fixed here:** it is an **over-rejection**, not an under-rejection — no double-post, no cross-tenant leak, the transaction rolls back cleanly ("No financial rows were committed"), and it is recoverable by retrying with a different key. It is **unreachable from the UI** (forms mint per-instance `useRef` keys; the routes default to `crypto.randomUUID()` when the header is absent), reachable only by API clients that deliberately reuse a key string across users. It **mirrors the pre-existing `record_manual_payment` convention** (`'manual-payment:'||key`), so the two new commands inherited a codebase-wide convention rather than introducing a regression. The clean fix is to actor-prefix the journal key **uniformly across all three finance commands** (`record_manual_payment`, `record_work_order_cost`, `write_off_receivable`) — but reproducing the ~230-line `record_manual_payment` money command via `create or replace` solely to change one string carries more transcription risk than the low, UI-unreachable edge warrants. **Tracked as a dedicated follow-up:** one migration that actor-prefixes the journal `idempotency_key` in all three commands together, with embedded-Postgres coverage asserting two distinct actors reusing one key on distinct anchors both post.

### Confirmed 2 (low) — escalated-blocks-batch-clear branch was untested — FIXED

The reconciliation batch-clear predicate is `status in ('open','escalated')`; the shipped predicate is **correct**, but the test never put an *escalated* exception in the position of sole remaining blocker (it de-escalated exception A before closing the last one), so a regression dropping `escalated` from the predicate — which would silently close an escalated mismatch, violating "a settlement mismatch cannot be silently closed" — would have passed uncaught.

**Fix (test-only):** the reconciliation test now waives exception B **while A is still escalated** and asserts the batch does **not** clear (`batchCleared === false` and `reconciliation_status === 'exception'`), then resolves A and asserts it clears. **Mutation-verified:** temporarily changing the predicate to `status in ('open')` makes `test:db` fail on exactly this assertion (EXIT 1); reverting restores green.

### Refuted 1 — multi-charge write-off "divergence" — no defect, but coverage added anyway

The finder claimed the two remaining-amount computation sites in `write_off_receivable` (the pre-check sum and the per-charge posting loop) could diverge for a multi-charge write-off. The skeptic **refuted** it: the `v_charge_count = array_length(...)` guard forces every id to satisfy the strict pre-check filter, and the loop iterates the same id set with a strictly weaker `WHERE` and the identical remaining formula, so the two sums are provably equal. No input produces a wrong `writtenOffMinor`.

**Action:** the coverage gap itself was real (the suite only wrote off a single charge), so as a defensive regression guard the write-off test now writes off **two** charges in one call — one partially paid (remaining 125000) and one full (185000) — and asserts `writtenOffMinor === 310000`, two `6300` legs, two `1100` legs, both charges `written_off` and linked, and the tenancy `1100` balance reduced by 310000. A `WRITE_OFF_CHARGE_NOT_AVAILABLE` rejection for a set mixing a valid and an unavailable charge was also added.

## Verification

`npm run check` green after the changes — ESLint, TypeScript, 108 Vitest tests, embedded-Postgres, build. Authority counts unchanged (74 tables / 59 policies). The reconciliation fix is mutation-verified as described above.
