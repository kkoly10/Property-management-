begin;

-- This register holds operator-attested external evidence. The accounting
-- book, payment provider, and deposit custodian are separate systems.
create table private.tenancy_deposit_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  tenancy_id uuid not null,
  version integer not null check (version>0),
  kind text not null check (kind in ('obligation','receipt','refund','deduction','other','correction')),
  amount_minor bigint not null check (amount_minor between 0 and 9007199254740991),
  currency_code char(3) not null check (currency_code in ('USD','CAD','MXN')),
  effective_on date not null check (isfinite(effective_on)),
  target_id uuid,
  reference text,
  detail text,
  custodian text,
  evidence_version_id uuid,
  notice_reference text,
  approval_reference text,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  operation_key uuid not null,
  request_hash text not null,
  recorded_at timestamptz not null default now(),
  unique (organization_id,tenancy_id,version),
  unique (organization_id,tenancy_id,id),
  unique (organization_id,tenancy_id,actor_user_id,operation_key),
  foreign key (organization_id,tenancy_id) references public.tenancies(organization_id,id) on delete restrict,
  foreign key (organization_id,tenancy_id,target_id)
    references private.tenancy_deposit_entries(organization_id,tenancy_id,id) on delete restrict,
  foreign key (organization_id,evidence_version_id) references public.document_versions(organization_id,id) on delete restrict,
  check ((kind in ('refund','deduction','other','correction'))=(target_id is not null)),
  check ((kind='receipt')=(custodian is not null)),
  check ((kind='deduction')=(evidence_version_id is not null and notice_reference is not null and approval_reference is not null)),
  check ((kind='correction' and amount_minor=0) or kind='obligation' or (kind<>'correction' and amount_minor>0)),
  check ((kind in ('receipt','refund','deduction','other'))=(reference is not null)),
  check (kind not in ('deduction','other','correction') or detail is not null)
);
create unique index tenancy_deposit_one_correction
  on private.tenancy_deposit_entries(target_id) where kind='correction';
create index tenancy_deposit_entries_target_idx on private.tenancy_deposit_entries(target_id) where target_id is not null;
alter table private.tenancy_deposit_entries enable row level security;
revoke all on private.tenancy_deposit_entries from public,anon,authenticated,service_role;

-- Upload through the existing property-scoped document pipeline; the first
-- accepted deduction binds its exact version to a single tenancy permanently.
create table private.tenancy_deposit_evidence (
  evidence_version_id uuid primary key,
  organization_id uuid not null,
  tenancy_id uuid not null,
  foreign key (organization_id,evidence_version_id) references public.document_versions(organization_id,id) on delete restrict,
  foreign key (organization_id,tenancy_id) references public.tenancies(organization_id,id) on delete restrict
);
alter table private.tenancy_deposit_evidence enable row level security;
revoke all on private.tenancy_deposit_evidence from public,anon,authenticated,service_role;

create function public.get_tenancy_deposit(p_organization_id uuid,p_tenancy_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_tenancy public.tenancies%rowtype;
  v_currency text;
  v_today date;
  v_result jsonb;
  v_evidence jsonb;
  v_can_manage boolean;
begin
  select * into v_tenancy from public.tenancies t
  where t.organization_id=p_organization_id and t.id=p_tenancy_id
    and (private.has_property_access(t.property_id,'finance.read') or private.has_property_access(t.property_id,'finance.manage'));
  if not found then raise exception using errcode='P0002',message='TENANCY_DEPOSIT_NOT_FOUND'; end if;
  v_can_manage:=private.has_property_access(v_tenancy.property_id,'finance.manage');
  select a.currency_code,(now() at time zone p.time_zone)::date into strict v_currency,v_today
  from public.properties p join public.receivable_accounts a on a.organization_id=p.organization_id
  where p.id=v_tenancy.property_id and p.organization_id=p_organization_id and a.id=v_tenancy.receivable_account_id;

  with entries as (
    select e.*,exists(select 1 from private.tenancy_deposit_entries c where c.target_id=e.id and c.kind='correction') as corrected
    from private.tenancy_deposit_entries e where e.organization_id=p_organization_id and e.tenancy_id=p_tenancy_id
  ), balance as (
    select coalesce(max(version),0) as version,
      coalesce(sum(amount_minor) filter (where kind='receipt' and not corrected),0) as received,
      coalesce(sum(amount_minor) filter (where kind in ('refund','deduction','other') and not corrected),0) as disposed
    from entries
  )
  select jsonb_build_object('tenancyId',p_tenancy_id,'canManage',v_can_manage,
    'currency',coalesce((select e.currency_code from entries e where e.version=1),v_currency),'localToday',v_today,
    'version',b.version,'obligationMinor',(select e.amount_minor::text from entries e where e.kind='obligation' order by e.version desc limit 1),
    'receivedMinor',b.received::text,'disposedMinor',b.disposed::text,'heldMinor',(b.received-b.disposed)::text,
    'entries',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'kind',e.kind,'version',e.version,
      'amountMinor',e.amount_minor::text,'effectiveOn',e.effective_on,'targetId',e.target_id,'reference',e.reference,
      'detail',e.detail,'custodian',e.custodian,'evidenceVersionId',e.evidence_version_id,'noticeReference',e.notice_reference,
      'approvalReference',e.approval_reference,'corrected',e.corrected,
      'remainingMinor',case when e.kind='receipt' and not e.corrected then (e.amount_minor-coalesce((
        select sum(d.amount_minor) from entries d where d.target_id=e.id and d.kind in ('refund','deduction','other')
          and not d.corrected),0))::text end)
      order by e.version desc) from entries e),'[]'::jsonb))
  into v_result from balance b;

  if v_can_manage and (private.has_property_access(v_tenancy.property_id,'documents.read')
    or private.has_property_access(v_tenancy.property_id,'documents.manage')) then
    select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'label',d.title||' · version '||v.version_number)
      order by d.title,v.version_number desc),'[]'::jsonb)
    into v_evidence from public.documents d join public.document_versions v
      on v.organization_id=d.organization_id and v.document_id=d.id
    where d.organization_id=p_organization_id and d.property_id=v_tenancy.property_id
      and d.document_type='deposit_evidence' and d.status='active' and v.upload_status='clean' and v.sha256_hex is not null
      and (d.tenancy_id is null or d.tenancy_id=p_tenancy_id)
      and (d.unit_id is null or d.unit_id=v_tenancy.unit_id)
      and not exists(select 1 from private.tenancy_deposit_evidence e
        where e.evidence_version_id=v.id and e.tenancy_id<>p_tenancy_id);
  end if;
  return v_result||jsonb_build_object('evidenceOptions',coalesce(v_evidence,'[]'::jsonb),
    'canUploadEvidence',v_can_manage and private.has_property_access(v_tenancy.property_id,'documents.manage'));
end;
$$;

create function public.record_tenancy_deposit_entry(
  p_organization_id uuid,p_tenancy_id uuid,p_expected_version integer,p_operation_key uuid,p_entry jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid();
  v_tenancy public.tenancies%rowtype;
  v_current private.tenancy_deposit_entries%rowtype;
  v_target private.tenancy_deposit_entries%rowtype;
  v_saved private.tenancy_deposit_entries%rowtype;
  v_kind text:=p_entry->>'kind';
  v_date date;
  v_today date;
  v_currency char(3);
  v_register_currency char(3);
  v_amount bigint;
  v_target_id uuid;
  v_evidence_id uuid;
  v_reference text:=nullif(btrim(p_entry->>'reference'),'');
  v_detail text:=nullif(btrim(p_entry->>'detail'),'');
  v_custodian text:=nullif(btrim(p_entry->>'custodian'),'');
  v_notice text:=nullif(btrim(p_entry->>'noticeReference'),'');
  v_approval text:=nullif(btrim(p_entry->>'approvalReference'),'');
  v_version integer;
  v_available numeric;
  v_hash text;
  v_event text;
  v_correlation uuid:=gen_random_uuid();
begin
  if v_actor is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  if jsonb_typeof(p_entry) is distinct from 'object' then
    raise exception using errcode='22023',message='INVALID_DEPOSIT_ENTRY';
  end if;
  if p_expected_version is null or p_expected_version not between 0 and 2147483646
    or p_operation_key is null or v_kind is null or v_kind not in ('obligation','receipt','refund','deduction','other','correction')
    or length(v_reference)>120 or length(v_detail)>500 or length(v_custodian)>120 or length(v_notice)>120 or length(v_approval)>120
    or exists(select 1 from jsonb_each(p_entry) e where
      (e.key='amountMinor' and jsonb_typeof(e.value)<>'number')
      or (e.key='confirmed' and jsonb_typeof(e.value)<>'boolean')
      or (e.key in ('kind','effectiveOn','targetId','reference','detail','custodian','evidenceVersionId','noticeReference','approvalReference')
        and jsonb_typeof(e.value)<>'string')
      or (e.key not in ('kind','effectiveOn','amountMinor','targetId','reference','detail','custodian','evidenceVersionId',
        'noticeReference','approvalReference','confirmed')))
    or (v_kind<>'correction' and (coalesce(p_entry->>'effectiveOn','') !~ '^\d{4}-\d{2}-\d{2}$'
      or coalesce(p_entry->>'amountMinor','') !~ '^[0-9]+$'))
  then raise exception using errcode='22023',message='INVALID_DEPOSIT_ENTRY'; end if;

  select * into v_tenancy from public.tenancies t
  where t.organization_id=p_organization_id and t.id=p_tenancy_id
    and private.has_property_access(t.property_id,'finance.manage') for no key update;
  if not found or not private.has_property_access(v_tenancy.property_id,'finance.manage') then
    raise exception using errcode='P0002',message='TENANCY_DEPOSIT_NOT_FOUND';
  end if;
  v_hash:=encode(sha256(convert_to(jsonb_build_array(p_expected_version,p_entry)::text,'UTF8')),'hex');
  select * into v_saved from private.tenancy_deposit_entries e
    where e.organization_id=p_organization_id and e.tenancy_id=p_tenancy_id
      and e.actor_user_id=v_actor and e.operation_key=p_operation_key;
  if found then
    if v_saved.request_hash<>v_hash then raise exception using errcode='23505',message='DEPOSIT_IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('tenancyId',p_tenancy_id,'entryId',v_saved.id,'version',v_saved.version);
  end if;

  select coalesce(max(e.version),0) into v_version from private.tenancy_deposit_entries e
    where e.organization_id=p_organization_id and e.tenancy_id=p_tenancy_id;
  if v_version<>p_expected_version then raise exception using errcode='23505',message='DEPOSIT_VERSION_CONFLICT'; end if;
  select (clock_timestamp() at time zone p.time_zone)::date,a.currency_code into strict v_today,v_currency
    from public.properties p join public.receivable_accounts a on a.organization_id=p.organization_id
    where p.organization_id=p_organization_id and p.id=v_tenancy.property_id and a.id=v_tenancy.receivable_account_id;
  select e.currency_code into v_register_currency from private.tenancy_deposit_entries e
    where e.organization_id=p_organization_id and e.tenancy_id=p_tenancy_id and e.version=1;
  if found and v_register_currency<>v_currency then
    raise exception using errcode='23514',message='DEPOSIT_CURRENCY_CHANGED';
  end if;
  begin
    v_date:=case when v_kind='correction' then v_today else (p_entry->>'effectiveOn')::date end;
    v_target_id:=(p_entry->>'targetId')::uuid;
    v_evidence_id:=(p_entry->>'evidenceVersionId')::uuid;
    v_amount:=case when v_kind='correction' then 0 else (p_entry->>'amountMinor')::bigint end;
  exception when data_exception then
    raise exception using errcode='22023',message='INVALID_DEPOSIT_ENTRY';
  end;
  if v_date is null or not isfinite(v_date) or v_amount is null or v_amount not between 0 and 9007199254740991
    or ((v_kind in ('receipt','refund','deduction','other')) and
      (v_amount=0 or v_date>v_today or p_entry->'confirmed' is distinct from 'true'::jsonb))
    or (v_kind in ('refund','deduction','other','correction'))<>(v_target_id is not null)
    or (v_kind='receipt')<>(v_custodian is not null)
    or (v_kind in ('receipt','refund','deduction','other'))<>(v_reference is not null)
    or (v_kind in ('deduction','other','correction') and v_detail is null)
    or (v_kind='correction' and (p_entry ? 'amountMinor' or p_entry ? 'effectiveOn'))
    or (v_kind='deduction' and (v_evidence_id is null or v_notice is null or v_approval is null))
    or (v_kind<>'deduction' and (v_evidence_id is not null or v_notice is not null or v_approval is not null))
  then raise exception using errcode='22023',message='INVALID_DEPOSIT_ENTRY'; end if;

  select * into v_current from private.tenancy_deposit_entries o
    where o.organization_id=p_organization_id and o.tenancy_id=p_tenancy_id and o.kind='obligation'
    order by o.version desc limit 1;
  if v_kind='obligation' and v_current.id is not null and v_detail is null then
    raise exception using errcode='22023',message='DEPOSIT_CORRECTION_REASON_REQUIRED';
  end if;
  if v_kind='receipt' then
    if v_current.id is null then raise exception using errcode='23514',message='DEPOSIT_OBLIGATION_REQUIRED'; end if;
    if exists(select 1 from private.tenancy_deposit_entries r
      where r.organization_id=p_organization_id and r.tenancy_id=p_tenancy_id and r.kind='receipt'
        and lower(r.reference)=lower(v_reference) and not exists(select 1 from private.tenancy_deposit_entries c
          where c.target_id=r.id and c.kind='correction')) then
      raise exception using errcode='23505',message='DEPOSIT_RECEIPT_REFERENCE_EXISTS';
    end if;
  end if;
  if v_target_id is not null then
    select * into v_target from private.tenancy_deposit_entries t
    where t.organization_id=p_organization_id and t.tenancy_id=p_tenancy_id and t.id=v_target_id
      and not exists(select 1 from private.tenancy_deposit_entries c where c.target_id=t.id and c.kind='correction');
    if not found or (v_kind='correction' and v_target.kind in ('obligation','correction'))
      or (v_kind<>'correction' and (v_target.kind<>'receipt' or v_date<v_target.effective_on)) then
      raise exception using errcode='23514',message='DEPOSIT_TARGET_INVALID';
    end if;
    select coalesce(sum(d.amount_minor),0) into v_available from private.tenancy_deposit_entries d
      where d.target_id=v_target.id and d.kind in ('refund','deduction','other')
        and not exists(select 1 from private.tenancy_deposit_entries c where c.target_id=d.id and c.kind='correction');
    if v_kind='correction' and v_target.kind='receipt' and v_available>0 then
      raise exception using errcode='23514',message='DEPOSIT_RECEIPT_HAS_DISPOSITIONS';
    elsif v_kind<>'correction' and v_amount>v_target.amount_minor-v_available then
      raise exception using errcode='23514',message='DEPOSIT_AMOUNT_EXCEEDS_HELD';
    end if;
  end if;
  if v_kind='deduction' then
    if not (private.has_property_access(v_tenancy.property_id,'documents.read')
      or private.has_property_access(v_tenancy.property_id,'documents.manage')) then
      raise exception using errcode='23514',message='DEPOSIT_EVIDENCE_NOT_READY';
    end if;
    perform 1 from public.documents d join public.document_versions v
      on v.organization_id=d.organization_id and v.document_id=d.id
    where d.organization_id=p_organization_id and d.property_id=v_tenancy.property_id
      and d.document_type='deposit_evidence' and d.status='active'
      and (d.tenancy_id is null or d.tenancy_id=p_tenancy_id)
      and (d.unit_id is null or d.unit_id=v_tenancy.unit_id)
      and v.id=v_evidence_id and v.upload_status='clean' and v.sha256_hex is not null
    for share of d,v;
    if not found then raise exception using errcode='23514',message='DEPOSIT_EVIDENCE_NOT_READY'; end if;
    insert into private.tenancy_deposit_evidence(evidence_version_id,organization_id,tenancy_id)
      values(v_evidence_id,p_organization_id,p_tenancy_id) on conflict (evidence_version_id) do nothing;
    if not exists(select 1 from private.tenancy_deposit_evidence e
      where e.evidence_version_id=v_evidence_id and e.organization_id=p_organization_id and e.tenancy_id=p_tenancy_id) then
      raise exception using errcode='23514',message='DEPOSIT_EVIDENCE_NOT_READY';
    end if;
  end if;

  insert into private.tenancy_deposit_entries(organization_id,tenancy_id,version,kind,amount_minor,currency_code,effective_on,
    target_id,reference,detail,custodian,evidence_version_id,notice_reference,approval_reference,
    actor_user_id,operation_key,request_hash)
  values(p_organization_id,p_tenancy_id,v_version+1,v_kind,v_amount,v_currency,v_date,v_target_id,v_reference,v_detail,
    v_custodian,v_evidence_id,v_notice,v_approval,v_actor,p_operation_key,v_hash) returning * into v_saved;
  v_event:=case v_kind when 'obligation' then 'tenancy.deposit_obligation_recorded' when 'receipt' then 'tenancy.deposit_receipt_recorded'
    when 'correction' then 'tenancy.deposit_entry_corrected' else 'tenancy.deposit_disposition_recorded' end;
  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
    values(p_organization_id,v_actor,'user',v_event,'tenancy_deposit_entry',v_saved.id,v_correlation,
      jsonb_build_object('tenancyId',p_tenancy_id,'version',v_saved.version,'kind',v_kind,'targetId',v_target_id));
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
    values(p_organization_id,v_event,'tenancy_deposit_entry',v_saved.id,v_correlation,
      jsonb_build_object('tenancyId',p_tenancy_id,'entryId',v_saved.id,'version',v_saved.version));
  return jsonb_build_object('tenancyId',p_tenancy_id,'entryId',v_saved.id,'version',v_saved.version);
end;
$$;

revoke all on function public.get_tenancy_deposit(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.record_tenancy_deposit_entry(uuid,uuid,integer,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.get_tenancy_deposit(uuid,uuid) to authenticated;
grant execute on function public.record_tenancy_deposit_entry(uuid,uuid,integer,uuid,jsonb) to authenticated;

commit;
