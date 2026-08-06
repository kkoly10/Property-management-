-- Phase 4: write off uncollectible charge-level accounts receivable.
-- Implements the "write-offs" build item (docs 05 Phase 4) / the CLAUDE.md pilot gap. Mirrors
-- record_manual_payment in reverse: instead of collecting a receivable, it recognizes it as an
-- uncollectible loss. A balanced journal DEBITs a bad-debt expense (6300, new, lazily upserted)
-- and CREDITs accounts receivable (1100) by each charge's exact remaining balance, and each
-- written-off charge flips to status 'written_off'. The expense leg carries property_id so the
-- loss flows onto the owner statement; the AR leg carries tenancy_id so the receivables summary
-- (which sums ledger 1100 by tenancy) drops by exactly the amount written off.
--
-- Scope: charge-level only. A tenancy's ledger-1100 balance can also include an opening balance
-- posted with no backing charge (activate_existing_lease); writing that non-charge AR off is a
-- follow-up, because there is no charge row to close.
begin;

create or replace function public.write_off_receivable(
  p_organization_id uuid,
  p_tenancy_id uuid,
  p_charge_ids uuid[],
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_tenancy public.tenancies%rowtype;
  v_property public.properties%rowtype;
  v_book public.accounting_books%rowtype;
  v_receivable public.receivable_accounts%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason,'')),'');
  v_charge_ids uuid[];
  v_charge_count integer;
  v_total_minor bigint;
  v_expense_account_id uuid;
  v_ar_account_id uuid;
  v_journal_transaction_id uuid := gen_random_uuid();
  v_charge record;
  v_request_hash text;
  v_previous private.idempotency_records%rowtype;
  v_correlation_id uuid := gen_random_uuid();
  v_response jsonb;
begin
  if v_actor_id is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 200 then
    raise exception using errcode='23514',message='INVALID_IDEMPOTENCY_KEY';
  end if;
  if v_reason is null or length(v_reason) not between 3 and 1000 then
    raise exception using errcode='23514',message='INVALID_WRITE_OFF_REASON';
  end if;
  select array_agg(distinct id order by id) into v_charge_ids from unnest(coalesce(p_charge_ids,array[]::uuid[])) id;
  if v_charge_ids is null or array_length(v_charge_ids,1) not between 1 and 100 then
    raise exception using errcode='23514',message='INVALID_WRITE_OFF_CHARGES';
  end if;

  select t.* into v_tenancy from public.tenancies t where t.id=p_tenancy_id and t.organization_id=p_organization_id;
  if not found then raise exception using errcode='P0002',message='TENANCY_NOT_FOUND'; end if;
  if not private.has_property_access(v_tenancy.property_id,'finance.manage') then
    raise exception using errcode='42501',message='PROPERTY_SCOPE_DENIED';
  end if;
  select p.* into v_property from public.properties p where p.id=v_tenancy.property_id and p.organization_id=p_organization_id;
  select b.* into v_book from public.accounting_books b where b.id=v_property.accounting_book_id and b.organization_id=p_organization_id and b.status='open';
  if not found then raise exception using errcode='23514',message='ACCOUNTING_BOOK_NOT_OPEN'; end if;
  select r.* into v_receivable from public.receivable_accounts r
  where r.id=v_tenancy.receivable_account_id and r.organization_id=p_organization_id and r.status='active';
  if not found then raise exception using errcode='23514',message='RECEIVABLE_ACCOUNT_NOT_ACTIVE'; end if;

  v_request_hash := encode(sha256(convert_to(jsonb_build_object(
    'organizationId',p_organization_id,'tenancyId',p_tenancy_id,'chargeIds',to_jsonb(v_charge_ids),'reason',v_reason
  )::text,'UTF8')),'hex');
  select * into v_previous from private.idempotency_records r
  where r.organization_id=p_organization_id and r.actor_user_id=v_actor_id
    and r.route='WriteOffReceivable' and r.idempotency_key=p_idempotency_key;
  if found then
    if v_previous.request_hash<>v_request_hash then raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT'; end if;
    if v_previous.state='completed' then return v_previous.response_body; end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;

  -- Lock the charges, then confirm every requested charge is a writable receivable on this tenancy
  -- and sum the outstanding. Runs AFTER the idempotency short-circuit: a successful replay finds the
  -- charges already 'written_off' and must return the stored response instead of failing this guard.
  perform 1 from public.charges c where c.id=any(v_charge_ids) and c.organization_id=p_organization_id order by c.id for update;
  select count(*),coalesce(sum(c.amount_minor-coalesce(al.allocated_minor,0)),0)
    into v_charge_count,v_total_minor
  from public.charges c
  left join lateral (
    select coalesce(sum(pa.amount_minor),0) as allocated_minor from public.payment_allocations pa
    where pa.charge_id=c.id and pa.reversed_at is null
  ) al on true
  where c.id=any(v_charge_ids) and c.organization_id=p_organization_id and c.tenancy_id=p_tenancy_id
    and c.accounting_book_id=v_book.id and c.receivable_account_id=v_receivable.id
    and c.currency_code=v_receivable.currency_code and c.status in ('open','partially_paid');
  if v_charge_count<>array_length(v_charge_ids,1) then
    raise exception using errcode='23514',message='WRITE_OFF_CHARGE_NOT_AVAILABLE';
  end if;
  if v_total_minor<=0 then raise exception using errcode='22003',message='WRITE_OFF_AMOUNT_INVALID'; end if;

  insert into private.idempotency_records(organization_id,actor_user_id,route,idempotency_key,request_hash,expires_at)
  values (p_organization_id,v_actor_id,'WriteOffReceivable',p_idempotency_key,v_request_hash,now()+interval '24 hours');

  insert into public.ledger_accounts(organization_id,accounting_book_id,account_code,account_name,account_class,normal_balance)
  values (p_organization_id,v_book.id,'6300','Bad debt expense','expense','debit')
  on conflict (accounting_book_id,account_code) do nothing;
  select a.id into v_expense_account_id from public.ledger_accounts a
  where a.accounting_book_id=v_book.id and a.account_code='6300' and a.account_class='expense' and a.normal_balance='debit' and a.status='active';
  if not found then raise exception using errcode='23514',message='LEDGER_ACCOUNT_CONFLICT',detail='6300'; end if;
  select a.id into v_ar_account_id from public.ledger_accounts a
  where a.accounting_book_id=v_book.id and a.account_code='1100' and a.account_class='asset' and a.normal_balance='debit' and a.status='active';
  if not found then raise exception using errcode='23514',message='LEDGER_ACCOUNT_CONFLICT',detail='1100'; end if;

  insert into public.journal_transactions(
    id,organization_id,operating_entity_id,accounting_book_id,transaction_type,effective_date,source_type,source_id,idempotency_key,
    currency_code,correlation_id,created_by,metadata
  ) values (
    v_journal_transaction_id,p_organization_id,v_property.operating_entity_id,v_book.id,'receivable_write_off',
    (now() at time zone v_property.time_zone)::date,'receivable_account',v_receivable.id,'receivable-write-off:'||p_idempotency_key,
    v_receivable.currency_code,v_correlation_id,v_actor_id,
    jsonb_build_object('tenancyId',v_tenancy.id,'chargeIds',to_jsonb(v_charge_ids),'reason',v_reason)
  );
  for v_charge in
    select c.id,c.description,(c.amount_minor-coalesce(al.allocated_minor,0)) as remaining_minor
    from public.charges c
    left join lateral (
      select coalesce(sum(pa.amount_minor),0) as allocated_minor from public.payment_allocations pa
      where pa.charge_id=c.id and pa.reversed_at is null
    ) al on true
    where c.id=any(v_charge_ids) and c.organization_id=p_organization_id and c.tenancy_id=p_tenancy_id
      and c.status in ('open','partially_paid')
    order by c.id
  loop
    insert into public.journal_entries(
      journal_transaction_id,organization_id,accounting_book_id,ledger_account_id,debit_minor,property_id,unit_id,tenancy_id,receivable_account_id,memo
    ) values (
      v_journal_transaction_id,p_organization_id,v_book.id,v_expense_account_id,v_charge.remaining_minor,v_property.id,v_tenancy.unit_id,v_tenancy.id,v_receivable.id,
      'Write-off: '||v_charge.description
    );
    insert into public.journal_entries(
      journal_transaction_id,organization_id,accounting_book_id,ledger_account_id,credit_minor,property_id,unit_id,tenancy_id,receivable_account_id,memo
    ) values (
      v_journal_transaction_id,p_organization_id,v_book.id,v_ar_account_id,v_charge.remaining_minor,v_property.id,v_tenancy.unit_id,v_tenancy.id,v_receivable.id,
      'Receivable written off'
    );
    update public.charges set status='written_off',voided_by_transaction_id=v_journal_transaction_id where id=v_charge.id;
  end loop;

  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,reason,after_data)
  values (p_organization_id,v_actor_id,'user','receivable.written_off','receivable_account',v_receivable.id,v_correlation_id,v_reason,
    jsonb_build_object('tenancyId',v_tenancy.id,'journalTransactionId',v_journal_transaction_id,'writtenOffMinor',v_total_minor,
      'currencyCode',v_receivable.currency_code,'chargeIds',to_jsonb(v_charge_ids)));
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
  values (p_organization_id,'receivable.written_off','receivable_account',v_receivable.id,v_correlation_id,
    jsonb_build_object('tenancyId',v_tenancy.id,'journalTransactionId',v_journal_transaction_id,'writtenOffMinor',v_total_minor,
      'currencyCode',v_receivable.currency_code,'chargeIds',to_jsonb(v_charge_ids)));

  v_response := jsonb_build_object(
    'receivableAccountId',v_receivable.id,'tenancyId',v_tenancy.id,'journalTransactionId',v_journal_transaction_id,
    'writtenOffMinor',v_total_minor,'currencyCode',v_receivable.currency_code,'chargeCount',v_charge_count,'chargeIds',to_jsonb(v_charge_ids)
  );
  update private.idempotency_records r set state='completed',response_status=201,response_body=v_response,
    resource_type='journal_transaction',resource_id=v_journal_transaction_id,completed_at=now()
  where r.organization_id=p_organization_id and r.actor_user_id=v_actor_id
    and r.route='WriteOffReceivable' and r.idempotency_key=p_idempotency_key;
  return v_response;
end;
$$;
revoke all on function public.write_off_receivable(uuid,uuid,uuid[],text,text) from public,anon;
grant execute on function public.write_off_receivable(uuid,uuid,uuid[],text,text) to authenticated;

commit;
