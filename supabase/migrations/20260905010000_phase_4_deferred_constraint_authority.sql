begin;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- Give the deferred financial constraint triggers the authority to see what they validate.
--
-- A DEFERRABLE INITIALLY DEFERRED constraint trigger does not run inside the command that queued it.
-- It runs at COMMIT, after the `security definer` command function's context has been popped, so it
-- executes as the SESSION role. Every one of these three validators reads a base table to compute the
-- invariant, and every one of those base tables is RLS-protected and SELECT-revoked from most roles.
-- The result was two distinct defects:
--
--   1. AVAILABILITY. `service_role` has no SELECT on the financial tables, so every worker-driven
--      financial write aborted at COMMIT with "permission denied for table journal_entries" — after
--      the command had reported success. This is why `generate_recurring_charges` succeeded when run
--      as an owner, succeeded when it had nothing to generate, and had nevertheless never once
--      committed a charge in production: the hourly rent cron had been failing since it was first
--      wired up. The same wall stands in front of the Stripe webhook's payment and refund posting.
--
--   2. CORRECTNESS, which is the more serious of the two. `authenticated` DOES hold SELECT, so for a
--      browser-driven write the validator ran and its query was silently filtered by the reader's own
--      RLS policy. A balance check that sums only the legs the committing user happens to be allowed
--      to read is not a balance check. The invariant these triggers exist to guarantee was being
--      evaluated against a subset of the evidence.
--
-- Both follow from the same root cause, so both take the same fix: the validators run as their owner.
-- This is the narrowest correct change — they take no caller-supplied arguments (a trigger function
-- receives only the row being committed), they perform no writes, they only read and raise, they
-- cannot be invoked directly (PostgreSQL refuses to call a trigger function outside a trigger), and
-- their search_path is already pinned empty with every reference schema-qualified. Granting the
-- reading roles SELECT instead would widen real data access, would have to be repeated for every
-- table a future deferred validator touches, and would still leave the RLS-filtering defect in place.
--
-- Note that the availability defect failed CLOSED: the transaction aborted, so no unbalanced or
-- over-allocated financial row was ever written. Nothing needs correcting, only unblocking.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────

create or replace function private.validate_journal_balance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transaction_id uuid := coalesce(new.journal_transaction_id,old.journal_transaction_id);
  v_debits bigint;
  v_credits bigint;
begin
  select coalesce(sum(e.debit_minor),0),coalesce(sum(e.credit_minor),0)
    into v_debits,v_credits
  from public.journal_entries e where e.journal_transaction_id=v_transaction_id;
  if v_debits=0 or v_debits<>v_credits then
    raise exception using errcode='23514',message='JOURNAL_NOT_BALANCED',detail=v_transaction_id::text;
  end if;
  return null;
end;
$$;
revoke all on function private.validate_journal_balance() from public,anon,authenticated,service_role;

create or replace function private.assert_allocation_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment_id uuid := coalesce(new.payment_id,old.payment_id);
  v_charge_id uuid := coalesce(new.charge_id,old.charge_id);
  v_payment_amount bigint;
  v_charge_amount bigint;
  v_allocated_payment bigint;
  v_allocated_charge bigint;
begin
  select p.amount_minor into v_payment_amount from public.payments p where p.id=v_payment_id;
  select c.amount_minor into v_charge_amount from public.charges c where c.id=v_charge_id;
  select coalesce(sum(a.amount_minor),0) into v_allocated_payment
  from public.payment_allocations a where a.payment_id=v_payment_id and a.reversed_at is null;
  select coalesce(sum(a.amount_minor),0) into v_allocated_charge
  from public.payment_allocations a where a.charge_id=v_charge_id and a.reversed_at is null;
  if v_allocated_payment>v_payment_amount then raise exception using errcode='23514',message='PAYMENT_OVERALLOCATED'; end if;
  if v_allocated_charge>v_charge_amount then raise exception using errcode='23514',message='CHARGE_OVERALLOCATED'; end if;
  return null;
end;
$$;
revoke all on function private.assert_allocation_limits() from public,anon,authenticated,service_role;

-- The refund validator delegates to private.assert_payment_refund_limit. That helper stays
-- security invoker on purpose: it is only ever reached from inside this trigger, so it already
-- inherits the owner's authority, and leaving it invoker keeps the definer surface as small as the
-- defect requires.
create or replace function private.enforce_payment_refund_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op='DELETE' then
    perform private.assert_payment_refund_limit(old.payment_id);
  elsif tg_op='UPDATE' then
    perform private.assert_payment_refund_limit(new.payment_id);
    if old.payment_id<>new.payment_id then perform private.assert_payment_refund_limit(old.payment_id); end if;
  else
    perform private.assert_payment_refund_limit(new.payment_id);
  end if;
  return null;
end;
$$;
revoke all on function private.enforce_payment_refund_limit() from public,anon,authenticated,service_role;

commit;
