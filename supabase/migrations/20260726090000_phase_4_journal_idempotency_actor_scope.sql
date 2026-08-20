-- Phase 4 hardening: actor-scope the journal_transactions idempotency guard.
--
-- Closes the PR #33 adversarial-review follow-up (docs/implementation/PR33_ADVERSARIAL_REVIEW.md).
-- private.idempotency_records is keyed per (organization_id, actor_user_id, route, idempotency_key)
-- — actor-scoped — but journal_transactions carried unique (accounting_book_id, idempotency_key)
-- with NO actor component. Two DIFFERENT operators reusing the same literal idempotency-key string
-- for DIFFERENT postings in one accounting book therefore collided on the journal unique constraint,
-- and the second operator's legitimate, distinct posting was rejected with a raw 23505 (a safe
-- over-rejection — no double-post, no cross-tenant leak — but a rejection nonetheless). This fixes
-- it for EVERY journal producer at once, without touching any command's plpgsql, by scoping the
-- uniqueness to the actor.
--
-- created_by is nullable: user-invoked commands stamp it with auth.uid(), but system/worker postings
-- (the Stripe settlement webhook, recurring-charge generation) leave it null. A single
-- (accounting_book_id, created_by, idempotency_key) index would let two null-actor system postings
-- with the same key coexist, weakening their backstop — so this uses two partial unique indexes:
--   * null actor  -> keep the original per-(book, key) guarantee for system postings, and
--   * non-null actor -> per-(book, actor, key), so distinct operators never collide while a single
--     actor replaying the same key still does (the idempotency_records short-circuit returns the
--     stored response before the journal insert on a true replay, so this is only a backstop).
-- No ON CONFLICT clause references the dropped constraint (verified), and this changes no table or
-- RLS policy, so the authority counts are unchanged.
begin;

alter table public.journal_transactions
  drop constraint journal_transactions_accounting_book_id_idempotency_key_key;

create unique index if not exists journal_transactions_system_idem_key
  on public.journal_transactions (accounting_book_id, idempotency_key)
  where created_by is null;

create unique index if not exists journal_transactions_actor_idem_key
  on public.journal_transactions (accounting_book_id, created_by, idempotency_key)
  where created_by is not null;

commit;
