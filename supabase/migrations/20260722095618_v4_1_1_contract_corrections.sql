begin;

-- v4.1.1 requires a stable actor identity even before an organization exists.
-- Existing commands remain source-compatible: the private trigger derives the
-- scope from their trusted actor_user_id value.
alter table private.idempotency_records add column actor_scope text;
update private.idempotency_records
set actor_scope=case
  when actor_user_id is not null then 'user:'||actor_user_id::text
  else 'system:database'
end;
alter table private.idempotency_records alter column actor_scope set not null;
alter table private.idempotency_records add constraint idempotency_actor_scope_format
  check (length(actor_scope) between 3 and 200);

create or replace function private.derive_idempotency_actor_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.actor_scope is null then
    new.actor_scope := case
      when new.actor_user_id is not null then 'user:'||new.actor_user_id::text
      else 'system:database'
    end;
  end if;
  return new;
end;
$$;
revoke all on function private.derive_idempotency_actor_scope() from public,anon,authenticated,service_role;
create trigger idempotency_records_derive_actor_scope
before insert or update of actor_user_id,actor_scope on private.idempotency_records
for each row execute function private.derive_idempotency_actor_scope();

create unique index idempotency_records_actor_scope_unique
  on private.idempotency_records(organization_id,actor_scope,route,idempotency_key)
  nulls not distinct;

-- Canonical refund persistence closes the command/schema traceability gap.
-- Provider execution remains a later vertical; this table is the durable,
-- bounded state machine that command will use.
create table public.payment_refunds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  payment_id uuid not null references public.payments(id) on delete restrict,
  provider_refund_id text,
  amount_minor bigint not null check (amount_minor > 0),
  currency_code char(3) not null check (currency_code in ('USD','CAD','MXN')),
  reason text not null check (length(trim(reason)) between 3 and 1000),
  status text not null default 'requested' check (status in ('requested','pending','succeeded','failed','canceled')),
  corrective_journal_transaction_id uuid references public.journal_transactions(id) on delete restrict,
  failure_code text,
  failure_detail text,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  unique (organization_id,id),
  foreign key (organization_id,payment_id) references public.payments(organization_id,id) on delete restrict,
  foreign key (organization_id,corrective_journal_transaction_id) references public.journal_transactions(organization_id,id) on delete restrict,
  check (completed_at is null or completed_at>=requested_at),
  check (status<>'succeeded' or (completed_at is not null and corrective_journal_transaction_id is not null)),
  check (status<>'failed' or failure_code is not null)
);
create unique index payment_refunds_provider_unique_idx
  on public.payment_refunds(organization_id,provider_refund_id)
  where provider_refund_id is not null;
create index payment_refunds_payment_status_idx on public.payment_refunds(payment_id,status,requested_at);
create index payment_refunds_journal_idx on public.payment_refunds(corrective_journal_transaction_id)
  where corrective_journal_transaction_id is not null;

create trigger payment_refunds_touch
before update on public.payment_refunds
for each row execute function private.touch_updated_at();

create or replace function private.assert_payment_refund_limit(p_payment_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_payment_amount bigint;
  v_payment_currency char(3);
  v_refund_amount bigint;
begin
  select p.amount_minor,p.currency_code into v_payment_amount,v_payment_currency
  from public.payments p where p.id=p_payment_id;
  if not found then return; end if;
  if exists(
    select 1 from public.payment_refunds r
    where r.payment_id=p_payment_id and r.currency_code<>v_payment_currency
  ) then raise exception using errcode='23514',message='REFUND_CURRENCY_MISMATCH'; end if;
  select coalesce(sum(r.amount_minor),0) into v_refund_amount
  from public.payment_refunds r
  where r.payment_id=p_payment_id and r.status not in ('failed','canceled');
  if v_refund_amount>v_payment_amount then
    raise exception using errcode='23514',message='PAYMENT_OVERREFUNDED';
  end if;
end;
$$;
revoke all on function private.assert_payment_refund_limit(uuid) from public,anon,authenticated,service_role;

create or replace function private.enforce_payment_refund_limit()
returns trigger
language plpgsql
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
create constraint trigger payment_refunds_limit
after insert or update or delete on public.payment_refunds
deferrable initially deferred for each row execute function private.enforce_payment_refund_limit();

alter table public.payment_refunds enable row level security;
create policy payment_refunds_operator_or_resident_read on public.payment_refunds
for select to authenticated using (
  exists(
    select 1 from public.payments p join public.tenancies t on t.id=p.tenancy_id
    where p.id=payment_refunds.payment_id and (
      private.has_property_access(t.property_id,'finance.read')
      or private.has_property_access(t.property_id,'finance.manage')
      or private.is_resident_for_tenancy(t.id)
    )
  )
);
grant select on public.payment_refunds to authenticated;
revoke insert,update,delete on public.payment_refunds from anon,authenticated;

commit;
