begin;

create type public.import_status as enum ('uploaded','mapping','validating','ready','committing','completed','failed','canceled');

insert into public.plan_entitlements(plan_code,feature_code,enabled) values
  ('free','imports.basic',false),('free','imports.full',false),
  ('starter','imports.basic',true),('starter','imports.full',false),
  ('growth','imports.basic',true),('growth','imports.full',true),
  ('pro','imports.basic',true),('pro','imports.full',true)
on conflict (plan_code,feature_code) do update set enabled=excluded.enabled;

create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  import_type text not null check (import_type in ('portfolio','residents','leases','opening_balances','documents','combined')),
  status public.import_status not null default 'uploaded',
  source_document_id uuid not null references public.documents(id) on delete restrict,
  source_document_version_id uuid not null references public.document_versions(id) on delete restrict,
  mapping jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  validation_hash text check (validation_hash is null or validation_hash ~ '^[0-9a-f]{64}$'),
  error_message text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete restrict,
  validated_at timestamptz,
  committed_at timestamptz,
  unique (organization_id,id),
  foreign key (organization_id,source_document_id) references public.documents(organization_id,id) on delete restrict,
  foreign key (organization_id,source_document_version_id) references public.document_versions(organization_id,id) on delete restrict
);
create index import_jobs_org_created_idx on public.import_jobs(organization_id,created_at desc);

create table private.import_rows (
  id uuid primary key default gen_random_uuid(),
  import_job_id uuid not null references public.import_jobs(id) on delete cascade,
  row_number integer not null,
  source_data jsonb not null,
  normalized_data jsonb,
  validation_errors jsonb not null default '[]'::jsonb,
  proposed_action text,
  committed_resource_type text,
  committed_resource_id uuid,
  unique (import_job_id,row_number)
);
create index import_rows_job_action_idx on private.import_rows(import_job_id,proposed_action,row_number);

create or replace function private.import_source_value(source_row jsonb,column_mapping jsonb,canonical_key text)
returns text
language sql immutable
set search_path = ''
as $$
  select nullif(trim(source_row ->> (column_mapping ->> canonical_key)),'')
$$;
revoke all on function private.import_source_value(jsonb,jsonb,text) from public,anon,authenticated;

create or replace function private.can_manage_portfolio_import(target_user uuid,target_organization uuid)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists(
    select 1
    from public.organization_memberships m
    join public.role_permissions rp on rp.role_code=m.role_code
    join public.role_definitions rd on rd.code=m.role_code
    where m.organization_id=target_organization and m.user_id=target_user and m.status='active'
      and m.starts_at<=now() and (m.ends_at is null or m.ends_at>now())
      and rd.organization_wide_allowed
      and not exists(select 1 from public.membership_property_scopes s where s.membership_id=m.id)
      and (rp.permission_code='*' or rp.permission_code='property.manage')
  )
$$;
revoke all on function private.can_manage_portfolio_import(uuid,uuid) from public,anon,authenticated;

create or replace function private.current_user_can_manage_portfolio_import(target_organization uuid)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select private.can_manage_portfolio_import((select auth.uid()),target_organization)
$$;
revoke all on function private.current_user_can_manage_portfolio_import(uuid) from public,anon;
grant execute on function private.current_user_can_manage_portfolio_import(uuid) to authenticated;

create or replace function public.create_import_job(
  p_organization_id uuid,
  p_import_type text,
  p_source_document_id uuid,
  p_source_document_version_id uuid,
  p_source_headers jsonb,
  p_source_rows jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_request_hash text;
  v_previous private.idempotency_records%rowtype;
  v_plan_code text;
  v_job_id uuid := gen_random_uuid();
  v_row_count integer;
  v_correlation_id uuid := gen_random_uuid();
  v_response jsonb;
begin
  if v_actor_id is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  if p_import_type<>'portfolio' then raise exception using errcode='0A000',message='IMPORT_TYPE_NOT_AVAILABLE'; end if;
  if not private.can_manage_portfolio_import(v_actor_id,p_organization_id) then
    raise exception using errcode='42501',message='PROPERTY_SCOPE_DENIED';
  end if;
  if jsonb_typeof(p_source_headers)<>'array' or jsonb_typeof(p_source_rows)<>'array' then
    raise exception using errcode='22023',message='INVALID_IMPORT_SOURCE';
  end if;
  v_row_count := jsonb_array_length(p_source_rows);
  if v_row_count<1 or v_row_count>10000 then raise exception using errcode='22023',message='IMPORT_ROW_LIMIT'; end if;
  if jsonb_array_length(p_source_headers)<1 or jsonb_array_length(p_source_headers)>100 then
    raise exception using errcode='22023',message='IMPORT_COLUMN_LIMIT';
  end if;

  if not exists(
    select 1
    from public.documents d
    join public.document_versions dv on dv.document_id=d.id and dv.organization_id=d.organization_id
    where d.id=p_source_document_id and d.organization_id=p_organization_id and d.property_id is null
      and dv.id=p_source_document_version_id and dv.upload_status='clean'
      and dv.mime_type in ('text/csv','application/vnd.ms-excel')
  ) then raise exception using errcode='23514',message='SOURCE_DOCUMENT_NOT_READY'; end if;

  select s.plan_code into v_plan_code from public.organization_subscriptions s
  where s.organization_id=p_organization_id and s.status in ('trialing','active','past_due','restricted')
  order by s.created_at desc limit 1;
  if not found or not exists(
    select 1 from public.plan_entitlements e
    where e.plan_code=v_plan_code and e.feature_code='imports.basic' and e.enabled
  ) then raise exception using errcode='23514',message='PLAN_LIMIT_EXCEEDED'; end if;

  v_request_hash := encode(sha256(convert_to(concat_ws('|',p_organization_id,p_import_type,p_source_document_id,p_source_document_version_id,p_source_headers::text,p_source_rows::text),'UTF8')),'hex');
  select * into v_previous from private.idempotency_records r
  where r.organization_id=p_organization_id and r.actor_user_id=v_actor_id
    and r.route='CreateImportJob' and r.idempotency_key=p_idempotency_key;
  if found then
    if v_previous.request_hash<>v_request_hash then raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT'; end if;
    if v_previous.state='completed' then return v_previous.response_body; end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;

  insert into private.idempotency_records(organization_id,actor_user_id,route,idempotency_key,request_hash,expires_at)
  values (p_organization_id,v_actor_id,'CreateImportJob',p_idempotency_key,v_request_hash,now()+interval '24 hours');
  insert into public.import_jobs(
    id,organization_id,import_type,status,source_document_id,source_document_version_id,summary,created_by
  ) values (
    v_job_id,p_organization_id,p_import_type,'mapping',p_source_document_id,p_source_document_version_id,
    jsonb_build_object('sourceHeaders',p_source_headers,'totals',jsonb_build_object('rows',v_row_count,'valid',0,'warnings',0,'errors',0,'creates',0,'updates',0,'skips',0)),v_actor_id
  );
  insert into private.import_rows(import_job_id,row_number,source_data)
  select v_job_id,ordinality::integer,value
  from jsonb_array_elements(p_source_rows) with ordinality;

  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
  values (p_organization_id,v_actor_id,'user','import.created','import_job',v_job_id,v_correlation_id,
    jsonb_build_object('importType',p_import_type,'sourceDocumentId',p_source_document_id,'rows',v_row_count));
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
  values (p_organization_id,'import.created','import_job',v_job_id,v_correlation_id,
    jsonb_build_object('importJobId',v_job_id,'importType',p_import_type,'rows',v_row_count));

  v_response := jsonb_build_object('importJobId',v_job_id,'status','mapping');
  update private.idempotency_records r set state='completed',response_status=201,response_body=v_response,
    resource_type='import_job',resource_id=v_job_id,completed_at=now()
  where r.organization_id=p_organization_id and r.actor_user_id=v_actor_id
    and r.route='CreateImportJob' and r.idempotency_key=p_idempotency_key;
  return v_response;
end;
$$;

create or replace function public.validate_portfolio_import(
  p_import_job_id uuid,
  p_mapping jsonb,
  p_options jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_job public.import_jobs%rowtype;
  v_row private.import_rows%rowtype;
  v_normalized jsonb;
  v_errors jsonb;
  v_all_errors jsonb := '[]'::jsonb;
  v_error_rows integer := 0;
  v_warning_count integer := 0;
  v_create_count integer := 0;
  v_skip_count integer := 0;
  v_property_name text;
  v_property_type text;
  v_address_line1 text;
  v_address_line2 text;
  v_locality text;
  v_subdivision_code text;
  v_postal_code text;
  v_country_code text;
  v_time_zone text;
  v_unit_code text;
  v_unit_type text;
  v_bedrooms_text text;
  v_bathrooms_text text;
  v_square_feet_text text;
  v_property_key text;
  v_operating_entity_id uuid;
  v_accounting_book_id uuid;
  v_country_profile_id uuid;
  v_profile_currency char(3);
  v_existing_property_id uuid;
  v_duplicate_unit boolean;
  v_validation_hash text;
  v_status text;
  v_totals jsonb;
  v_correlation_id uuid := gen_random_uuid();
begin
  if v_actor_id is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  select * into v_job from public.import_jobs j where j.id=p_import_job_id for update;
  if not found then raise exception using errcode='P0002',message='IMPORT_NOT_FOUND'; end if;
  if not private.can_manage_portfolio_import(v_actor_id,v_job.organization_id) then
    raise exception using errcode='42501',message='PROPERTY_SCOPE_DENIED';
  end if;
  if v_job.status in ('committing','completed','canceled') then
    raise exception using errcode='23514',message='IMPORT_STATE_CONFLICT';
  end if;
  if p_options->>'dedupeMode' not in ('strict','review') or nullif(trim(p_options->>'dateLocale'),'') is null then
    raise exception using errcode='22023',message='INVALID_IMPORT_OPTIONS';
  end if;
  if not (p_mapping ?& array['propertyName','propertyType','addressLine1','countryCode','timeZone']) then
    raise exception using errcode='22023',message='REQUIRED_MAPPING_MISSING';
  end if;

  update public.import_jobs j set status='validating',error_message=null where j.id=p_import_job_id;
  for v_row in select * from private.import_rows r where r.import_job_id=p_import_job_id order by r.row_number loop
    v_errors := '[]'::jsonb;
    v_duplicate_unit := false;
    v_property_name := private.import_source_value(v_row.source_data,p_mapping,'propertyName');
    v_property_type := lower(private.import_source_value(v_row.source_data,p_mapping,'propertyType'));
    v_address_line1 := private.import_source_value(v_row.source_data,p_mapping,'addressLine1');
    v_address_line2 := private.import_source_value(v_row.source_data,p_mapping,'addressLine2');
    v_locality := private.import_source_value(v_row.source_data,p_mapping,'locality');
    v_subdivision_code := private.import_source_value(v_row.source_data,p_mapping,'subdivisionCode');
    v_postal_code := private.import_source_value(v_row.source_data,p_mapping,'postalCode');
    v_country_code := upper(private.import_source_value(v_row.source_data,p_mapping,'countryCode'));
    v_time_zone := private.import_source_value(v_row.source_data,p_mapping,'timeZone');
    v_unit_code := private.import_source_value(v_row.source_data,p_mapping,'unitCode');
    v_unit_type := private.import_source_value(v_row.source_data,p_mapping,'unitType');
    v_bedrooms_text := private.import_source_value(v_row.source_data,p_mapping,'bedrooms');
    v_bathrooms_text := private.import_source_value(v_row.source_data,p_mapping,'bathrooms');
    v_square_feet_text := private.import_source_value(v_row.source_data,p_mapping,'squareFeet');

    if v_property_name is null then v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','propertyName','code','REQUIRED','message','Property name is required.')); end if;
    if v_address_line1 is null then v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','addressLine1','code','REQUIRED','message','Address line 1 is required.')); end if;
    if v_property_type is null or v_property_type not in ('single_family','multifamily','mixed_use','student_housing','other_residential') then
      v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','propertyType','code','INVALID_PROPERTY_TYPE','message','Use a supported residential property type.'));
    end if;
    if v_country_code is null or v_country_code not in ('US','CA','MX') then
      v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','countryCode','code','INVALID_COUNTRY','message','Country must be US, CA, or MX.'));
    end if;
    if v_time_zone is null then v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','timeZone','code','REQUIRED','message','Time zone is required.')); end if;
    if v_bedrooms_text is not null and v_bedrooms_text !~ '^\d+(\.\d)?$' then v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','bedrooms','code','INVALID_NUMBER','message','Bedrooms must be a non-negative number.')); end if;
    if v_bathrooms_text is not null and v_bathrooms_text !~ '^\d+(\.\d)?$' then v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','bathrooms','code','INVALID_NUMBER','message','Bathrooms must be a non-negative number.')); end if;
    if v_square_feet_text is not null and v_square_feet_text !~ '^\d+$' then v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','squareFeet','code','INVALID_INTEGER','message','Square feet must be a non-negative whole number.')); end if;

    v_operating_entity_id := null; v_accounting_book_id := null; v_country_profile_id := null; v_profile_currency := null; v_existing_property_id := null;
    if v_country_code in ('US','CA','MX') then
      select cp.id,cp.default_currency_code into v_country_profile_id,v_profile_currency
      from public.country_profiles cp where cp.country_code=v_country_code and cp.status in ('sandbox','active')
        and cp.effective_from<=current_date and (cp.effective_to is null or cp.effective_to>=current_date)
      order by cp.version desc limit 1;
      select b.operating_entity_id,b.id into v_operating_entity_id,v_accounting_book_id
      from public.accounting_books b where b.organization_id=v_job.organization_id
        and b.functional_currency_code=v_profile_currency and b.status='open'
      order by b.created_at,b.id limit 1;
      if v_accounting_book_id is null then
        v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','countryCode','code','ACCOUNTING_BOOK_MISSING','message','No active accounting book matches this country currency.'));
      end if;
    end if;

    v_property_key := lower(coalesce(v_property_name,''))||'|'||lower(coalesce(v_address_line1,''))||'|'||lower(coalesce(v_locality,''))||'|'||coalesce(v_country_code,'');
    if jsonb_array_length(v_errors)=0 then
      select p.id into v_existing_property_id from public.properties p
      where p.organization_id=v_job.organization_id and lower(p.name)=lower(v_property_name)
        and lower(p.address_line1)=lower(v_address_line1) and lower(coalesce(p.locality,''))=lower(coalesce(v_locality,''))
        and p.country_code=v_country_code order by p.created_at limit 1;
      if v_unit_code is not null and exists(
        select 1 from private.import_rows earlier
        where earlier.import_job_id=p_import_job_id and earlier.row_number<v_row.row_number
          and earlier.normalized_data->>'propertyKey'=v_property_key
          and lower(earlier.normalized_data->>'unitCode')=lower(v_unit_code)
      ) then
        if p_options->>'dedupeMode'='strict' then
          v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','unitCode','code','DUPLICATE_UNIT','message','This property and unit code appears more than once in the file.'));
        else
          v_duplicate_unit := true;
          v_warning_count := v_warning_count+1;
        end if;
      end if;
    end if;

    v_normalized := jsonb_build_object(
      'propertyKey',v_property_key,'propertyName',v_property_name,'propertyType',v_property_type,
      'addressLine1',v_address_line1,'addressLine2',v_address_line2,'locality',v_locality,
      'subdivisionCode',v_subdivision_code,'postalCode',v_postal_code,'countryCode',v_country_code,'timeZone',v_time_zone,
      'unitCode',v_unit_code,'unitType',v_unit_type,
      'bedrooms',case when v_bedrooms_text ~ '^\d+(\.\d)?$' then to_jsonb(v_bedrooms_text::numeric) else 'null'::jsonb end,
      'bathrooms',case when v_bathrooms_text ~ '^\d+(\.\d)?$' then to_jsonb(v_bathrooms_text::numeric) else 'null'::jsonb end,
      'squareFeet',case when v_square_feet_text ~ '^\d+$' then to_jsonb(v_square_feet_text::integer) else 'null'::jsonb end,
      'operatingEntityId',v_operating_entity_id,'accountingBookId',v_accounting_book_id,'countryProfileId',v_country_profile_id,
      'existingPropertyId',v_existing_property_id
    );

    if jsonb_array_length(v_errors)>0 then
      v_error_rows := v_error_rows+1;
      v_all_errors := v_all_errors||v_errors;
      update private.import_rows r set normalized_data=v_normalized,validation_errors=v_errors,proposed_action='error' where r.id=v_row.id;
    elsif v_duplicate_unit then
      v_skip_count := v_skip_count+1;
      update private.import_rows r set normalized_data=v_normalized,validation_errors='[]',proposed_action='skip' where r.id=v_row.id;
    elsif v_existing_property_id is null and v_unit_code is not null then
      if exists(select 1 from private.import_rows earlier where earlier.import_job_id=p_import_job_id and earlier.row_number<v_row.row_number and earlier.normalized_data->>'propertyKey'=v_property_key and jsonb_array_length(earlier.validation_errors)=0) then
        v_create_count := v_create_count+1;
        update private.import_rows r set normalized_data=v_normalized,validation_errors='[]',proposed_action='create_unit' where r.id=v_row.id;
      else
        v_create_count := v_create_count+2;
        update private.import_rows r set normalized_data=v_normalized,validation_errors='[]',proposed_action='create_property_and_unit' where r.id=v_row.id;
      end if;
    elsif v_existing_property_id is null then
      if exists(select 1 from private.import_rows earlier where earlier.import_job_id=p_import_job_id and earlier.row_number<v_row.row_number and earlier.normalized_data->>'propertyKey'=v_property_key and jsonb_array_length(earlier.validation_errors)=0) then
        v_skip_count := v_skip_count+1;
        update private.import_rows r set normalized_data=v_normalized,validation_errors='[]',proposed_action='skip' where r.id=v_row.id;
      else
        v_create_count := v_create_count+1;
        update private.import_rows r set normalized_data=v_normalized,validation_errors='[]',proposed_action='create_property' where r.id=v_row.id;
      end if;
    elsif v_unit_code is not null and not exists(select 1 from public.units u where u.property_id=v_existing_property_id and lower(u.unit_code)=lower(v_unit_code)) then
      v_create_count := v_create_count+1;
      update private.import_rows r set normalized_data=v_normalized,validation_errors='[]',proposed_action='create_unit' where r.id=v_row.id;
    else
      v_skip_count := v_skip_count+1;
      update private.import_rows r set normalized_data=v_normalized,validation_errors='[]',proposed_action='skip' where r.id=v_row.id;
    end if;
  end loop;

  select encode(sha256(convert_to(
    p_mapping::text||'|'||p_options::text||'|'||coalesce(jsonb_agg(jsonb_build_object('row',r.row_number,'normalized',r.normalized_data,'errors',r.validation_errors,'action',r.proposed_action) order by r.row_number)::text,'[]'),
    'UTF8')),'hex') into v_validation_hash
  from private.import_rows r where r.import_job_id=p_import_job_id;

  v_status := case when v_error_rows=0 then 'ready' else 'mapping' end;
  v_totals := jsonb_build_object(
    'rows',(select count(*) from private.import_rows r where r.import_job_id=p_import_job_id),
    'valid',(select count(*) from private.import_rows r where r.import_job_id=p_import_job_id and jsonb_array_length(r.validation_errors)=0),
    'warnings',v_warning_count,'errors',v_error_rows,'creates',v_create_count,'updates',0,'skips',v_skip_count
  );
  update public.import_jobs j set status=v_status::public.import_status,mapping=jsonb_build_object('columns',p_mapping,'options',p_options),
    summary=summary||jsonb_build_object('totals',v_totals,'errors',v_all_errors,'validationHash',v_validation_hash),
    validation_hash=v_validation_hash,validated_at=now(),error_message=null
  where j.id=p_import_job_id;

  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
  values (v_job.organization_id,v_actor_id,'user','import.validated','import_job',p_import_job_id,v_correlation_id,
    jsonb_build_object('status',v_status,'validationHash',v_validation_hash,'totals',v_totals));
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
  values (v_job.organization_id,'import.validated','import_job',p_import_job_id,v_correlation_id,
    jsonb_build_object('importJobId',p_import_job_id,'status',v_status,'validationHash',v_validation_hash,'totals',v_totals));
  return jsonb_build_object('status',v_status,'totals',v_totals,'errors',v_all_errors,'validationHash',v_validation_hash);
end;
$$;

create or replace function public.commit_portfolio_import(
  p_import_job_id uuid,
  p_expected_validation_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_job public.import_jobs%rowtype;
  v_row private.import_rows%rowtype;
  v_property_id uuid;
  v_unit_id uuid;
  v_report_document_id uuid := gen_random_uuid();
  v_properties_created integer := 0;
  v_units_created integer := 0;
  v_unit_limit integer;
  v_existing_units integer;
  v_new_units integer;
  v_plan_code text;
  v_response jsonb;
  v_correlation_id uuid := gen_random_uuid();
  v_error text;
begin
  if v_actor_id is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  select * into v_job from public.import_jobs j where j.id=p_import_job_id for update;
  if not found then raise exception using errcode='P0002',message='IMPORT_NOT_FOUND'; end if;
  if not private.can_manage_portfolio_import(v_actor_id,v_job.organization_id) then
    raise exception using errcode='42501',message='PROPERTY_SCOPE_DENIED';
  end if;
  if v_job.status='completed' then
    if v_job.validation_hash<>p_expected_validation_hash then raise exception using errcode='23505',message='VALIDATION_HASH_CONFLICT'; end if;
    return v_job.summary->'commitResponse';
  end if;
  if v_job.status<>'ready' or v_job.validation_hash is null then raise exception using errcode='23514',message='IMPORT_NOT_READY'; end if;
  if v_job.validation_hash<>p_expected_validation_hash then raise exception using errcode='23505',message='VALIDATION_HASH_CONFLICT'; end if;
  if exists(select 1 from private.import_rows r where r.import_job_id=p_import_job_id and jsonb_array_length(r.validation_errors)>0) then
    raise exception using errcode='23514',message='IMPORT_HAS_ERRORS';
  end if;

  begin
    perform 1 from public.organizations o where o.id=v_job.organization_id for update;
    update public.import_jobs j set status='committing' where j.id=p_import_job_id;

    select s.plan_code into v_plan_code from public.organization_subscriptions s
    where s.organization_id=v_job.organization_id and s.status in ('trialing','active','past_due','restricted')
    order by s.created_at desc limit 1;
    select e.limit_value::integer into v_unit_limit from public.plan_entitlements e
    where e.plan_code=v_plan_code and e.feature_code='core.unit' and e.enabled;
    select count(*)::integer into v_existing_units from public.units u
    where u.organization_id=v_job.organization_id and u.operational_status<>'retired' and u.archived_at is null;
    select count(*)::integer into v_new_units from private.import_rows r
    where r.import_job_id=p_import_job_id and r.proposed_action in ('create_property_and_unit','create_unit');
    if v_unit_limit is null or v_existing_units+v_new_units>v_unit_limit then
      raise exception using errcode='23514',message='PLAN_LIMIT_EXCEEDED';
    end if;

    for v_row in select * from private.import_rows r where r.import_job_id=p_import_job_id order by r.row_number loop
      v_property_id := null; v_unit_id := null;
      select p.id into v_property_id from public.properties p
      where p.organization_id=v_job.organization_id
        and lower(p.name)=lower(v_row.normalized_data->>'propertyName')
        and lower(p.address_line1)=lower(v_row.normalized_data->>'addressLine1')
        and lower(coalesce(p.locality,''))=lower(coalesce(v_row.normalized_data->>'locality',''))
        and p.country_code=v_row.normalized_data->>'countryCode'
      order by p.created_at limit 1;
      if v_property_id is null then
        insert into public.properties(
          organization_id,operating_entity_id,accounting_book_id,country_profile_id,name,property_type,country_code,
          subdivision_code,locality,postal_code,address_line1,address_line2,time_zone,status,created_by
        ) values (
          v_job.organization_id,(v_row.normalized_data->>'operatingEntityId')::uuid,(v_row.normalized_data->>'accountingBookId')::uuid,
          (v_row.normalized_data->>'countryProfileId')::uuid,v_row.normalized_data->>'propertyName',v_row.normalized_data->>'propertyType',
          v_row.normalized_data->>'countryCode',v_row.normalized_data->>'subdivisionCode',v_row.normalized_data->>'locality',
          v_row.normalized_data->>'postalCode',v_row.normalized_data->>'addressLine1',v_row.normalized_data->>'addressLine2',
          v_row.normalized_data->>'timeZone','draft',v_actor_id
        ) returning id into v_property_id;
        v_properties_created := v_properties_created+1;
      end if;

      if nullif(v_row.normalized_data->>'unitCode','') is not null then
        select u.id into v_unit_id from public.units u
        where u.property_id=v_property_id and lower(u.unit_code)=lower(v_row.normalized_data->>'unitCode');
        if v_unit_id is null then
          insert into public.units(organization_id,property_id,unit_code,unit_type,bedrooms,bathrooms,square_feet)
          values (
            v_job.organization_id,v_property_id,v_row.normalized_data->>'unitCode',v_row.normalized_data->>'unitType',
            (v_row.normalized_data->>'bedrooms')::numeric,(v_row.normalized_data->>'bathrooms')::numeric,
            (v_row.normalized_data->>'squareFeet')::integer
          ) returning id into v_unit_id;
          v_units_created := v_units_created+1;
        end if;
      end if;
      update private.import_rows r set committed_resource_type=case when v_unit_id is null then 'property' else 'unit' end,
        committed_resource_id=coalesce(v_unit_id,v_property_id) where r.id=v_row.id;
    end loop;

    insert into public.documents(id,organization_id,document_type,title,source,status,operator_supplied_unverified,created_by)
    values (v_report_document_id,v_job.organization_id,'import_report','Portfolio import report','system_generated','active',false,v_actor_id);
    if v_units_created>0 then
      insert into public.usage_records(organization_id,meter_code,quantity,occurred_at,idempotency_key,source_type,source_id)
      values (v_job.organization_id,'active_units',v_existing_units+v_units_created,now(),'import:'||p_import_job_id,'import_job',p_import_job_id);
    end if;

    v_response := jsonb_build_object('status','completed','committed',jsonb_build_object('properties',v_properties_created,'units',v_units_created),'reportDocumentId',v_report_document_id);
    update public.import_jobs j set status='completed',committed_at=now(),error_message=null,
      summary=j.summary||jsonb_build_object('commitResponse',v_response) where j.id=p_import_job_id;
    insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
    values (v_job.organization_id,v_actor_id,'user','import.committed','import_job',p_import_job_id,v_correlation_id,
      jsonb_build_object('validationHash',p_expected_validation_hash,'committed',v_response->'committed','reportDocumentId',v_report_document_id));
    insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
    values (v_job.organization_id,'import.committed','import_job',p_import_job_id,v_correlation_id,
      jsonb_build_object('importJobId',p_import_job_id,'validationHash',p_expected_validation_hash,'committed',v_response->'committed','reportDocumentId',v_report_document_id));
    return v_response;
  exception when others then
    v_error := case
      when sqlerrm in ('PLAN_LIMIT_EXCEEDED','VALIDATION_HASH_CONFLICT','IMPORT_HAS_ERRORS') then sqlerrm
      else 'IMPORT_COMMIT_FAILED'
    end;
    update public.import_jobs j set status='failed',error_message=v_error where j.id=p_import_job_id;
    insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
    values (v_job.organization_id,v_actor_id,'user','import.failed','import_job',p_import_job_id,v_correlation_id,jsonb_build_object('error',v_error));
    insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
    values (v_job.organization_id,'import.failed','import_job',p_import_job_id,v_correlation_id,jsonb_build_object('importJobId',p_import_job_id,'error',v_error));
    return jsonb_build_object('status','failed','error',v_error);
  end;
end;
$$;

create or replace function public.get_import_job_detail(p_import_job_id uuid)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare v_actor_id uuid := auth.uid(); v_job public.import_jobs%rowtype;
begin
  if v_actor_id is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  select * into v_job from public.import_jobs j where j.id=p_import_job_id;
  if not found or not private.can_manage_portfolio_import(v_actor_id,v_job.organization_id) then
    raise exception using errcode='42501',message='IMPORT_NOT_FOUND';
  end if;
  return jsonb_build_object(
    'id',v_job.id,'organizationId',v_job.organization_id,'importType',v_job.import_type,'status',v_job.status,
    'sourceDocumentId',v_job.source_document_id,'mapping',v_job.mapping,'summary',v_job.summary,
    'validationHash',v_job.validation_hash,'errorMessage',v_job.error_message,'createdAt',v_job.created_at,'committedAt',v_job.committed_at,
    'rows',(select coalesce(jsonb_agg(jsonb_build_object('row',r.row_number,'source',r.source_data,'errors',r.validation_errors,'action',r.proposed_action) order by r.row_number),'[]'::jsonb)
      from private.import_rows r where r.import_job_id=p_import_job_id and (jsonb_array_length(r.validation_errors)>0 or r.row_number<=20))
  );
end;
$$;

revoke all on function public.create_import_job(uuid,text,uuid,uuid,jsonb,jsonb,text) from public,anon;
revoke all on function public.validate_portfolio_import(uuid,jsonb,jsonb) from public,anon;
revoke all on function public.commit_portfolio_import(uuid,text) from public,anon;
revoke all on function public.get_import_job_detail(uuid) from public,anon;
grant execute on function public.create_import_job(uuid,text,uuid,uuid,jsonb,jsonb,text) to authenticated;
grant execute on function public.validate_portfolio_import(uuid,jsonb,jsonb) to authenticated;
grant execute on function public.commit_portfolio_import(uuid,text) to authenticated;
grant execute on function public.get_import_job_detail(uuid) to authenticated;

alter table public.import_jobs enable row level security;
create policy import_jobs_privileged_read on public.import_jobs for select to authenticated
using (private.current_user_can_manage_portfolio_import(organization_id));

grant select on public.import_jobs to authenticated;
revoke insert,update,delete on public.import_jobs from anon,authenticated;
revoke all on private.import_rows from public,anon,authenticated;

commit;
