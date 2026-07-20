begin;

create type public.charge_status as enum ('open','partially_paid','paid','voided','written_off');

create table public.charges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  accounting_book_id uuid not null references public.accounting_books(id) on delete restrict,
  receivable_account_id uuid not null references public.receivable_accounts(id) on delete restrict,
  tenancy_id uuid not null references public.tenancies(id) on delete restrict,
  charge_schedule_id uuid,
  charge_type text not null check (length(trim(charge_type)) between 1 and 80),
  description text not null check (length(trim(description)) between 1 and 240),
  due_date date not null,
  amount_minor bigint not null check (amount_minor > 0),
  currency_code char(3) not null check (currency_code in ('USD','CAD','MXN')),
  status public.charge_status not null default 'open',
  journal_transaction_id uuid not null references public.journal_transactions(id) on delete restrict,
  voided_by_transaction_id uuid references public.journal_transactions(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (charge_schedule_id,due_date,charge_type),
  foreign key (organization_id,accounting_book_id) references public.accounting_books(organization_id,id) on delete restrict,
  foreign key (organization_id,receivable_account_id) references public.receivable_accounts(organization_id,id) on delete restrict,
  foreign key (organization_id,tenancy_id) references public.tenancies(organization_id,id) on delete restrict,
  foreign key (organization_id,charge_schedule_id) references public.charge_schedules(organization_id,id) on delete restrict
);
create index charges_receivable_due_idx on public.charges(receivable_account_id,status,due_date);
create index charges_tenancy_due_idx on public.charges(tenancy_id,status,due_date);
create index charges_journal_idx on public.charges(journal_transaction_id);

create table private.charge_generation_runs (
  worker_run_id text primary key check (length(trim(worker_run_id)) between 8 and 200),
  request_hash text not null,
  run_date date not null,
  schedule_ids uuid[],
  state text not null default 'processing' check (state in ('processing','completed')),
  response_body jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create or replace function private.enforce_accounting_book_currency_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.first_posted_at is not null and new.functional_currency_code<>old.functional_currency_code then
    raise exception using errcode='23514',message='ACCOUNTING_BOOK_CURRENCY_IMMUTABLE';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_accounting_book_currency_immutable() from public,anon,authenticated,service_role;

update public.accounting_books b
set first_posted_at=posted.first_posted_at
from (
  select accounting_book_id,min(posted_at) as first_posted_at
  from public.journal_transactions
  group by accounting_book_id
) posted
where b.id=posted.accounting_book_id and b.first_posted_at is null;

create trigger accounting_book_currency_immutable
before update on public.accounting_books
for each row execute function private.enforce_accounting_book_currency_immutable();

create or replace function private.enforce_journal_book_currency()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_book_currency char(3);
begin
  select b.functional_currency_code into v_book_currency
  from public.accounting_books b
  where b.id=new.accounting_book_id and b.organization_id=new.organization_id
  for update;
  if v_book_currency is null then raise exception using errcode='23503',message='ACCOUNTING_BOOK_NOT_FOUND'; end if;
  if v_book_currency<>new.currency_code then raise exception using errcode='23514',message='JOURNAL_CURRENCY_MISMATCH'; end if;
  update public.accounting_books b
  set first_posted_at=coalesce(b.first_posted_at,new.posted_at)
  where b.id=new.accounting_book_id;
  return new;
end;
$$;
revoke all on function private.enforce_journal_book_currency() from public,anon,authenticated,service_role;
create trigger journal_book_currency
before insert on public.journal_transactions
for each row execute function private.enforce_journal_book_currency();

create or replace function private.validate_journal_balance()
returns trigger
language plpgsql
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

create or replace function private.prevent_financial_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode='55000',message='APPEND_ONLY_RECORD';
end;
$$;
revoke all on function private.prevent_financial_mutation() from public,anon,authenticated,service_role;
create trigger journal_transactions_append_only
before update or delete on public.journal_transactions
for each row execute function private.prevent_financial_mutation();
create trigger journal_entries_append_only
before update or delete on public.journal_entries
for each row execute function private.prevent_financial_mutation();

create or replace function private.next_charge_run_on(p_cadence text,p_current_date date,p_due_day smallint)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_months integer;
  v_month_start date;
  v_month_end date;
  v_day integer := coalesce(p_due_day,extract(day from p_current_date)::integer);
begin
  if p_cadence='weekly' then return p_current_date+7; end if;
  if p_cadence='biweekly' then return p_current_date+14; end if;
  if p_cadence='custom' then return null; end if;
  v_months := case p_cadence when 'monthly' then 1 when 'quarterly' then 3 when 'semiannual' then 6 when 'annual' then 12 else null end;
  if v_months is null then raise exception using errcode='23514',message='INVALID_SCHEDULE_CADENCE'; end if;
  v_month_start := (date_trunc('month',p_current_date)::date+(v_months||' months')::interval)::date;
  v_month_end := (v_month_start+interval '1 month - 1 day')::date;
  return make_date(extract(year from v_month_start)::integer,extract(month from v_month_start)::integer,least(v_day,extract(day from v_month_end)::integer));
end;
$$;
revoke all on function private.next_charge_run_on(text,date,smallint) from public,anon,authenticated;
grant execute on function private.next_charge_run_on(text,date,smallint) to service_role;

create or replace function public.generate_recurring_charges(
  p_run_date date,
  p_schedule_ids uuid[],
  p_worker_run_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_hash text;
  v_previous private.charge_generation_runs%rowtype;
  v_schedule public.charge_schedules%rowtype;
  v_tenancy public.tenancies%rowtype;
  v_property public.properties%rowtype;
  v_book public.accounting_books%rowtype;
  v_receivable public.receivable_accounts%rowtype;
  v_ar_account_id uuid;
  v_income_account_id uuid;
  v_charge_id uuid;
  v_journal_transaction_id uuid;
  v_correlation_id uuid;
  v_next_run_on date;
  v_charge_ids uuid[] := '{}'::uuid[];
  v_response jsonb;
begin
  if p_run_date is null then raise exception using errcode='23514',message='RUN_DATE_REQUIRED'; end if;
  if p_worker_run_id is null or length(trim(p_worker_run_id)) not between 8 and 200 then
    raise exception using errcode='23514',message='INVALID_WORKER_RUN_ID';
  end if;
  if p_schedule_ids is not null and cardinality(p_schedule_ids)>500 then
    raise exception using errcode='54000',message='TOO_MANY_SCHEDULE_IDS';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_worker_run_id,0));
  v_request_hash := encode(sha256(convert_to(jsonb_build_object(
    'runDate',p_run_date,
    'scheduleIds',case when p_schedule_ids is null then null else (select jsonb_agg(s.id order by s.id) from unnest(p_schedule_ids) s(id)) end
  )::text,'UTF8')),'hex');
  select * into v_previous from private.charge_generation_runs r where r.worker_run_id=p_worker_run_id;
  if found then
    if v_previous.request_hash<>v_request_hash then raise exception using errcode='23505',message='WORKER_RUN_CONFLICT'; end if;
    if v_previous.state='completed' then return v_previous.response_body||jsonb_build_object('replayed',true); end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;
  insert into private.charge_generation_runs(worker_run_id,request_hash,run_date,schedule_ids)
  values (trim(p_worker_run_id),v_request_hash,p_run_date,p_schedule_ids);

  for v_schedule in
    select s.* from public.charge_schedules s
    where s.status='active' and s.next_run_on is not null and s.next_run_on<=p_run_date
      and (p_schedule_ids is null or s.id=any(p_schedule_ids))
    order by s.id
    for update
  loop
    if v_schedule.ends_on is not null and v_schedule.next_run_on>v_schedule.ends_on then
      update public.charge_schedules set status='ended',next_run_on=null where id=v_schedule.id;
      continue;
    end if;
    if v_schedule.amount_minor=0 then
      update public.charge_schedules set status='ended',next_run_on=null where id=v_schedule.id;
      continue;
    end if;

    select t.* into v_tenancy from public.tenancies t
    where t.id=v_schedule.tenancy_id and t.organization_id=v_schedule.organization_id and t.status='active';
    if not found then raise exception using errcode='23514',message='TENANCY_NOT_ACTIVE',detail=v_schedule.tenancy_id::text; end if;
    select p.* into v_property from public.properties p
    where p.id=v_tenancy.property_id and p.organization_id=v_schedule.organization_id;
    select b.* into v_book from public.accounting_books b
    where b.id=v_schedule.accounting_book_id and b.organization_id=v_schedule.organization_id and b.status='open';
    if not found then raise exception using errcode='23514',message='ACCOUNTING_BOOK_NOT_OPEN'; end if;
    select r.* into v_receivable from public.receivable_accounts r
    where r.id=v_schedule.receivable_account_id and r.organization_id=v_schedule.organization_id and r.status='active';
    if not found then raise exception using errcode='23514',message='RECEIVABLE_ACCOUNT_NOT_ACTIVE'; end if;
    if v_property.accounting_book_id<>v_schedule.accounting_book_id
      or v_receivable.accounting_book_id<>v_schedule.accounting_book_id
      or v_receivable.currency_code<>v_schedule.currency_code
      or v_book.functional_currency_code<>v_schedule.currency_code then
      raise exception using errcode='23514',message='SCHEDULE_BOOK_CURRENCY_MISMATCH';
    end if;

    insert into public.ledger_accounts(organization_id,accounting_book_id,account_code,account_name,account_class,normal_balance)
    values (v_schedule.organization_id,v_schedule.accounting_book_id,'1100','Accounts receivable','asset','debit')
    on conflict (accounting_book_id,account_code) do nothing;
    select a.id into v_ar_account_id from public.ledger_accounts a
    where a.accounting_book_id=v_schedule.accounting_book_id and a.account_code='1100'
      and a.account_class='asset' and a.normal_balance='debit' and a.status='active';
    if not found then raise exception using errcode='23514',message='LEDGER_ACCOUNT_CONFLICT',detail='1100'; end if;
    insert into public.ledger_accounts(organization_id,accounting_book_id,account_code,account_name,account_class,normal_balance)
    values (v_schedule.organization_id,v_schedule.accounting_book_id,'4000','Rental income','revenue','credit')
    on conflict (accounting_book_id,account_code) do nothing;
    select a.id into v_income_account_id from public.ledger_accounts a
    where a.accounting_book_id=v_schedule.accounting_book_id and a.account_code='4000'
      and a.account_class='revenue' and a.normal_balance='credit' and a.status='active';
    if not found then raise exception using errcode='23514',message='LEDGER_ACCOUNT_CONFLICT',detail='4000'; end if;

    v_charge_id := gen_random_uuid();
    v_journal_transaction_id := gen_random_uuid();
    v_correlation_id := gen_random_uuid();
    insert into public.journal_transactions(
      id,organization_id,operating_entity_id,accounting_book_id,transaction_type,effective_date,source_type,source_id,
      idempotency_key,currency_code,correlation_id,metadata
    ) values (
      v_journal_transaction_id,v_schedule.organization_id,v_property.operating_entity_id,v_schedule.accounting_book_id,'rent_charge',v_schedule.next_run_on,'charge',v_charge_id,
      'charge:'||v_schedule.id||':'||v_schedule.next_run_on||':'||v_schedule.charge_type,v_schedule.currency_code,v_correlation_id,
      jsonb_build_object('scheduleId',v_schedule.id,'workerRunId',p_worker_run_id)
    );
    insert into public.journal_entries(
      journal_transaction_id,organization_id,accounting_book_id,ledger_account_id,debit_minor,property_id,unit_id,tenancy_id,receivable_account_id,memo
    ) values (
      v_journal_transaction_id,v_schedule.organization_id,v_schedule.accounting_book_id,v_ar_account_id,v_schedule.amount_minor,v_property.id,v_tenancy.unit_id,v_tenancy.id,v_receivable.id,'Rent receivable'
    );
    insert into public.journal_entries(
      journal_transaction_id,organization_id,accounting_book_id,ledger_account_id,credit_minor,property_id,unit_id,tenancy_id,receivable_account_id,memo
    ) values (
      v_journal_transaction_id,v_schedule.organization_id,v_schedule.accounting_book_id,v_income_account_id,v_schedule.amount_minor,v_property.id,v_tenancy.unit_id,v_tenancy.id,v_receivable.id,'Rental income'
    );
    insert into public.charges(
      id,organization_id,accounting_book_id,receivable_account_id,tenancy_id,charge_schedule_id,charge_type,description,due_date,
      amount_minor,currency_code,status,journal_transaction_id
    ) values (
      v_charge_id,v_schedule.organization_id,v_schedule.accounting_book_id,v_receivable.id,v_tenancy.id,v_schedule.id,v_schedule.charge_type,
      'Rent due '||v_schedule.next_run_on,v_schedule.next_run_on,v_schedule.amount_minor,v_schedule.currency_code,'open',v_journal_transaction_id
    );

    v_next_run_on := private.next_charge_run_on(v_schedule.cadence,v_schedule.next_run_on,v_schedule.due_day);
    update public.charge_schedules
    set next_run_on=case when v_schedule.ends_on is not null and v_next_run_on>v_schedule.ends_on then null else v_next_run_on end,
        status=case when v_next_run_on is null or (v_schedule.ends_on is not null and v_next_run_on>v_schedule.ends_on) then 'ended' else 'active' end
    where id=v_schedule.id;
    insert into audit.audit_events(organization_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
    values (v_schedule.organization_id,'system','charge.posted','charge',v_charge_id,v_correlation_id,jsonb_build_object(
      'scheduleId',v_schedule.id,'tenancyId',v_tenancy.id,'amountMinor',v_schedule.amount_minor,'currencyCode',v_schedule.currency_code,'dueDate',v_schedule.next_run_on,'journalTransactionId',v_journal_transaction_id
    ));
    insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
    values (v_schedule.organization_id,'charge.posted','charge',v_charge_id,v_correlation_id,jsonb_build_object(
      'chargeId',v_charge_id,'amountMinor',v_schedule.amount_minor,'currency',v_schedule.currency_code,'dueDate',v_schedule.next_run_on,'journalTransactionId',v_journal_transaction_id
    ));
    v_charge_ids := array_append(v_charge_ids,v_charge_id);
  end loop;

  v_response := jsonb_build_object('workerRunId',p_worker_run_id,'runDate',p_run_date,'chargeIds',to_jsonb(v_charge_ids),'generatedCount',cardinality(v_charge_ids),'replayed',false);
  update private.charge_generation_runs
  set state='completed',response_body=v_response,completed_at=now()
  where worker_run_id=p_worker_run_id;
  return v_response;
end;
$$;
revoke all on function public.generate_recurring_charges(date,uuid[],text) from public,anon,authenticated;
grant execute on function public.generate_recurring_charges(date,uuid[],text) to service_role;

create or replace function public.get_operator_receivables_summary()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with scoped as (
    select
      t.id as tenancy_id,p.name as property_name,u.unit_code,l.currency_code,
      coalesce((select sum(e.debit_minor-e.credit_minor)
        from public.journal_entries e join public.ledger_accounts a on a.id=e.ledger_account_id
        where e.tenancy_id=t.id and a.account_code='1100'),0) as balance_minor,
      coalesce(open_charge.due_date,schedule.next_run_on) as next_due_date,
      coalesce(open_charge.amount_minor,schedule.amount_minor) as next_due_amount_minor,
      coalesce(open_charge.status::text,case when schedule.next_run_on is null then null else 'scheduled' end) as next_due_status
    from public.tenancies t
    join public.properties p on p.id=t.property_id
    join public.units u on u.id=t.unit_id
    join public.leases l on l.id=t.lease_id
    left join lateral (
      select c.due_date,c.amount_minor,c.status from public.charges c
      where c.tenancy_id=t.id and c.status in ('open','partially_paid')
      order by c.due_date,c.created_at limit 1
    ) open_charge on true
    left join lateral (
      select s.next_run_on,s.amount_minor from public.charge_schedules s
      where s.tenancy_id=t.id and s.status='active' and s.next_run_on is not null
      order by s.next_run_on limit 1
    ) schedule on true
    where t.status in ('scheduled','active','notice_given','move_out_in_progress')
      and (private.has_property_access(t.property_id,'finance.read') or private.has_property_access(t.property_id,'finance.manage'))
  )
  select jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object(
    'tenancyId',tenancy_id,'propertyName',property_name,'unitCode',unit_code,'currencyCode',currency_code,
    'balanceMinor',balance_minor,'nextDueDate',next_due_date,'nextDueAmountMinor',next_due_amount_minor,'nextDueStatus',next_due_status
  ) order by property_name,unit_code),'[]'::jsonb)) from scoped
$$;
revoke all on function public.get_operator_receivables_summary() from public,anon;
grant execute on function public.get_operator_receivables_summary() to authenticated;

create or replace function public.get_resident_balance_summary()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with scoped as (
    select
      t.id as tenancy_id,p.name as property_name,u.unit_code,l.currency_code,
      coalesce((select sum(e.debit_minor-e.credit_minor)
        from public.journal_entries e join public.ledger_accounts a on a.id=e.ledger_account_id
        where e.tenancy_id=t.id and a.account_code='1100'),0) as balance_minor,
      coalesce(open_charge.due_date,schedule.next_run_on) as next_due_date,
      coalesce(open_charge.amount_minor,schedule.amount_minor) as next_due_amount_minor,
      coalesce(open_charge.status::text,case when schedule.next_run_on is null then null else 'scheduled' end) as next_due_status
    from public.tenancies t
    join public.properties p on p.id=t.property_id
    join public.units u on u.id=t.unit_id
    join public.leases l on l.id=t.lease_id
    left join lateral (
      select c.due_date,c.amount_minor,c.status from public.charges c
      where c.tenancy_id=t.id and c.status in ('open','partially_paid')
      order by c.due_date,c.created_at limit 1
    ) open_charge on true
    left join lateral (
      select s.next_run_on,s.amount_minor from public.charge_schedules s
      where s.tenancy_id=t.id and s.status='active' and s.next_run_on is not null
      order by s.next_run_on limit 1
    ) schedule on true
    where t.status in ('scheduled','active','notice_given','move_out_in_progress')
      and private.is_resident_for_tenancy(t.id)
  )
  select jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object(
    'tenancyId',tenancy_id,'propertyName',property_name,'unitCode',unit_code,'currencyCode',currency_code,
    'balanceMinor',balance_minor,'nextDueDate',next_due_date,'nextDueAmountMinor',next_due_amount_minor,'nextDueStatus',next_due_status
  ) order by property_name,unit_code),'[]'::jsonb)) from scoped
$$;
revoke all on function public.get_resident_balance_summary() from public,anon;
grant execute on function public.get_resident_balance_summary() to authenticated;

alter table public.charges enable row level security;
create policy charges_operator_or_resident_read on public.charges for select to authenticated using (
  exists(select 1 from public.tenancies t where t.id=charges.tenancy_id and (
    private.has_property_access(t.property_id,'finance.read') or private.has_property_access(t.property_id,'finance.manage')
  )) or private.is_resident_for_tenancy(charges.tenancy_id)
);
grant select on public.charges to authenticated;
revoke insert,update,delete on public.charges from anon,authenticated;
revoke all on private.charge_generation_runs from public,anon,authenticated,service_role;

commit;
