-- Phase 3: occupied-portfolio import — occupied-lease leg (import_type='leases').
--
-- The portfolio import (20260720121643) creates empty properties/units. This slice imports the OCCUPIED
-- half against already-imported units: each row activates a lease — household + primary member, lease,
-- receivable account, active tenancy, rent charge schedule, and a balanced opening receivable — so the
-- tenancy is immediately operational (its next recurring rent charge is generatable) and the opening
-- ledger balances (1100 DR / 3900 CR). It mirrors public.activate_existing_lease's postings exactly,
-- batched and without the per-row signed-document requirement (document association is a later slice).
--
-- Forward-only; adds two commands (validate_occupied_import, commit_occupied_import) and extends
-- create_import_job to accept import_type='leases' (gated on the imports.full entitlement). No new table
-- or RLS policy — import_jobs/import_rows and their policies already exist; authority counts unchanged.
begin;

-- ── create_import_job: additionally accept the occupied-lease import type ─────────────────────────
-- Portfolio stays on imports.basic; the occupied-lease import is the "full" import feature.
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
  v_feature_code text;
  v_job_id uuid := gen_random_uuid();
  v_row_count integer;
  v_correlation_id uuid := gen_random_uuid();
  v_response jsonb;
begin
  if v_actor_id is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  if p_import_type not in ('portfolio','leases') then raise exception using errcode='0A000',message='IMPORT_TYPE_NOT_AVAILABLE'; end if;
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

  v_feature_code := case when p_import_type='portfolio' then 'imports.basic' else 'imports.full' end;
  select s.plan_code into v_plan_code from public.organization_subscriptions s
  where s.organization_id=p_organization_id and s.status in ('trialing','active','past_due','restricted')
  order by s.created_at desc limit 1;
  if not found or not exists(
    select 1 from public.plan_entitlements e
    where e.plan_code=v_plan_code and e.feature_code=v_feature_code and e.enabled
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
revoke all on function public.create_import_job(uuid,text,uuid,uuid,jsonb,jsonb,text) from public,anon;
grant execute on function public.create_import_job(uuid,text,uuid,uuid,jsonb,jsonb,text) to authenticated;

-- ── validate_occupied_import: normalize + validate each occupied-lease row ─────────────────────────
create or replace function public.validate_occupied_import(
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
  v_errors jsonb;
  v_all_errors jsonb := '[]'::jsonb;
  v_error_rows integer := 0;
  v_create_count integer := 0;
  v_skip_count integer := 0;
  v_normalized jsonb;
  v_property_name text; v_address_line1 text; v_locality text; v_country_code text; v_unit_code text;
  v_household_name text; v_first_name text; v_last_name text; v_email text; v_phone text;
  v_start_text text; v_end_text text; v_rent_text text; v_rent_frequency text; v_currency_code text;
  v_external_reference text; v_opening_text text; v_due_text text;
  v_start_date date; v_end_date date; v_due_date date; v_rent_minor bigint; v_opening_minor bigint;
  v_property public.properties%rowtype; v_unit public.units%rowtype; v_book public.accounting_books%rowtype;
  v_unit_key text;
  v_validation_hash text; v_status text; v_totals jsonb;
  v_correlation_id uuid := gen_random_uuid();
begin
  if v_actor_id is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  select * into v_job from public.import_jobs j where j.id=p_import_job_id for update;
  if not found then raise exception using errcode='P0002',message='IMPORT_NOT_FOUND'; end if;
  if v_job.import_type<>'leases' then raise exception using errcode='23514',message='IMPORT_TYPE_MISMATCH'; end if;
  if not private.can_manage_portfolio_import(v_actor_id,v_job.organization_id) then
    raise exception using errcode='42501',message='PROPERTY_SCOPE_DENIED';
  end if;
  if v_job.status in ('committing','completed','canceled') then
    raise exception using errcode='23514',message='IMPORT_STATE_CONFLICT';
  end if;
  if p_options->>'dedupeMode' not in ('strict','review') or nullif(trim(p_options->>'dateLocale'),'') is null then
    raise exception using errcode='22023',message='INVALID_IMPORT_OPTIONS';
  end if;
  if not (p_mapping ?& array['propertyName','addressLine1','countryCode','unitCode','primaryFirstName','primaryLastName','leaseStartDate','rentAmountMinor','rentFrequency','currencyCode']) then
    raise exception using errcode='22023',message='REQUIRED_MAPPING_MISSING';
  end if;

  update public.import_jobs j set status='validating',error_message=null where j.id=p_import_job_id;
  for v_row in select * from private.import_rows r where r.import_job_id=p_import_job_id order by r.row_number loop
    v_errors := '[]'::jsonb;
    v_property := null; v_unit := null; v_book := null;
    v_start_date := null; v_end_date := null; v_due_date := null; v_rent_minor := null; v_opening_minor := 0;

    v_property_name := private.import_source_value(v_row.source_data,p_mapping,'propertyName');
    v_address_line1 := private.import_source_value(v_row.source_data,p_mapping,'addressLine1');
    v_locality := private.import_source_value(v_row.source_data,p_mapping,'locality');
    v_country_code := upper(private.import_source_value(v_row.source_data,p_mapping,'countryCode'));
    v_unit_code := private.import_source_value(v_row.source_data,p_mapping,'unitCode');
    v_household_name := private.import_source_value(v_row.source_data,p_mapping,'householdName');
    v_first_name := private.import_source_value(v_row.source_data,p_mapping,'primaryFirstName');
    v_last_name := private.import_source_value(v_row.source_data,p_mapping,'primaryLastName');
    v_email := nullif(lower(private.import_source_value(v_row.source_data,p_mapping,'primaryEmail')),'');
    v_phone := private.import_source_value(v_row.source_data,p_mapping,'primaryPhone');
    v_start_text := private.import_source_value(v_row.source_data,p_mapping,'leaseStartDate');
    v_end_text := private.import_source_value(v_row.source_data,p_mapping,'leaseEndDate');
    v_rent_text := private.import_source_value(v_row.source_data,p_mapping,'rentAmountMinor');
    v_rent_frequency := lower(private.import_source_value(v_row.source_data,p_mapping,'rentFrequency'));
    v_currency_code := upper(private.import_source_value(v_row.source_data,p_mapping,'currencyCode'));
    v_external_reference := nullif(private.import_source_value(v_row.source_data,p_mapping,'externalReference'),'');
    v_opening_text := private.import_source_value(v_row.source_data,p_mapping,'openingBalanceMinor');
    v_due_text := private.import_source_value(v_row.source_data,p_mapping,'firstChargeDueDate');

    -- Compute the in-file dedupe key unconditionally so error rows never inherit a prior row's key.
    v_unit_key := lower(coalesce(v_property_name,''))||'|'||lower(coalesce(v_address_line1,''))||'|'||lower(coalesce(v_locality,''))||'|'||coalesce(v_country_code,'')||'|'||lower(coalesce(v_unit_code,''));

    -- Required identity + household + lease fields.
    if v_property_name is null then v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','propertyName','code','REQUIRED','message','Property name is required.')); end if;
    if v_address_line1 is null then v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','addressLine1','code','REQUIRED','message','Address line 1 is required.')); end if;
    if v_country_code is null or v_country_code not in ('US','CA','MX') then v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','countryCode','code','INVALID_COUNTRY','message','Country must be US, CA, or MX.')); end if;
    if v_unit_code is null then v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','unitCode','code','REQUIRED','message','Unit code is required for an occupied-lease import.')); end if;
    if v_first_name is null or length(v_first_name)>100 then v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','primaryFirstName','code','REQUIRED','message','Primary resident first name is required.')); end if;
    if v_last_name is null or length(v_last_name)>100 then v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','primaryLastName','code','REQUIRED','message','Primary resident last name is required.')); end if;
    if v_email is not null and v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','primaryEmail','code','INVALID_EMAIL','message','Primary resident email is not a valid address.')); end if;
    if v_phone is not null and v_phone !~ '^\+[1-9][0-9]{7,14}$' then v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','primaryPhone','code','INVALID_PHONE','message','Phone must be E.164 (e.g. +14155550123).')); end if;
    if v_rent_text is null or v_rent_text !~ '^[0-9]+$' then v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','rentAmountMinor','code','INVALID_RENT_AMOUNT','message','Rent must be a whole number of minor units.')); end if;
    if v_rent_frequency is null or v_rent_frequency not in ('weekly','biweekly','monthly','quarterly','semiannual','annual','custom') then v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','rentFrequency','code','INVALID_RENT_FREQUENCY','message','Unsupported rent frequency.')); end if;
    if v_currency_code is null or v_currency_code not in ('USD','CAD','MXN') then v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','currencyCode','code','INVALID_CURRENCY','message','Currency must be USD, CAD, or MXN.')); end if;
    if v_opening_text is not null and v_opening_text !~ '^-?[0-9]+$' then v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','openingBalanceMinor','code','INVALID_INTEGER','message','Opening balance must be a whole number of minor units.')); end if;

    -- Dates.
    if v_start_text is null then
      v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','leaseStartDate','code','REQUIRED','message','Lease start date is required.'));
    else
      begin v_start_date := v_start_text::date; exception when others then
        v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','leaseStartDate','code','INVALID_DATE','message','Lease start date is not a valid date.'));
      end;
    end if;
    if v_end_text is not null then
      begin v_end_date := v_end_text::date; exception when others then
        v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','leaseEndDate','code','INVALID_DATE','message','Lease end date is not a valid date.'));
      end;
    end if;
    if v_due_text is not null then
      begin v_due_date := v_due_text::date; exception when others then
        v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','firstChargeDueDate','code','INVALID_DATE','message','First charge due date is not a valid date.'));
      end;
    end if;
    if v_start_date is not null and v_end_date is not null and v_end_date<v_start_date then
      v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','leaseEndDate','code','INVALID_LEASE_DATES','message','Lease end date is before the start date.'));
    end if;
    if v_start_date is not null and v_end_date is not null and v_end_date<current_date then
      v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','leaseEndDate','code','LEASE_ALREADY_ENDED','message','This lease has already ended.'));
    end if;

    -- Resolve the (existing) property + unit + open book, and check currency + occupancy.
    if jsonb_array_length(v_errors)=0 then
      v_rent_minor := v_rent_text::bigint;
      v_opening_minor := coalesce(v_opening_text::bigint,0);
      v_due_date := coalesce(v_due_date,v_start_date);

      select p.* into v_property from public.properties p
      where p.organization_id=v_job.organization_id and lower(p.name)=lower(v_property_name)
        and lower(p.address_line1)=lower(v_address_line1) and lower(coalesce(p.locality,''))=lower(coalesce(v_locality,''))
        and p.country_code=v_country_code order by p.created_at limit 1;
      if not found then
        v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','propertyName','code','PROPERTY_NOT_FOUND','message','No imported property matches this name/address — import the portfolio first.'));
      else
        select u.* into v_unit from public.units u
        where u.organization_id=v_job.organization_id and u.property_id=v_property.id and lower(u.unit_code)=lower(v_unit_code);
        if not found then
          v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','unitCode','code','UNIT_NOT_FOUND','message','No unit with this code exists on the matched property.'));
        elsif v_unit.operational_status<>'active' then
          v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','unitCode','code','UNIT_NOT_ACTIVE','message','This unit is not active and cannot take a tenancy.'));
        end if;
        if v_unit.id is not null then
          select b.* into v_book from public.accounting_books b
          where b.id=v_property.accounting_book_id and b.organization_id=v_job.organization_id and b.status='open';
          if not found then
            v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','unitCode','code','ACCOUNTING_BOOK_NOT_OPEN','message','The property''s accounting book is not open.'));
          elsif v_currency_code is not null and v_currency_code<>v_book.functional_currency_code then
            v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','currencyCode','code','CURRENCY_MISMATCH','message','Rent currency does not match the property book currency.'));
          end if;
          -- Overlap with any live tenancy on this unit (existing rows or an earlier row in this file).
          if v_start_date is not null and exists(
            select 1 from public.tenancies t
            where t.unit_id=v_unit.id and t.status in ('scheduled','active','notice_given','move_out_in_progress')
              and daterange(t.possession_start,coalesce(t.possession_end,'infinity'::date),'[]')
                && daterange(v_start_date,coalesce(v_end_date,'infinity'::date),'[]')
          ) then
            v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','unitCode','code','TENANCY_OVERLAP','message','This unit already has a live tenancy overlapping these dates.'));
          end if;
        end if;
      end if;

      -- Duplicate unit within this file (strict mode → error; review mode → skip below).
      if jsonb_array_length(v_errors)=0 and exists(
        select 1 from private.import_rows earlier
        where earlier.import_job_id=p_import_job_id and earlier.row_number<v_row.row_number
          and earlier.normalized_data->>'unitKey'=v_unit_key and earlier.proposed_action='create_tenancy'
      ) then
        if p_options->>'dedupeMode'='strict' then
          v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','unitCode','code','DUPLICATE_UNIT','message','This unit appears more than once in the file.'));
        end if;
      end if;
    end if;

    v_normalized := jsonb_build_object(
      'unitKey',v_unit_key,'propertyId',v_property.id,'unitId',v_unit.id,
      'operatingEntityId',v_property.operating_entity_id,'accountingBookId',v_property.accounting_book_id,
      'countryProfileId',v_property.country_profile_id,
      'householdName',coalesce(v_household_name,trim(coalesce(v_first_name,'')||' '||coalesce(v_last_name,''))),
      'firstName',v_first_name,'lastName',v_last_name,'email',v_email,'phoneE164',v_phone,
      'startDate',v_start_date,'endDate',v_end_date,'dueDate',v_due_date,
      'rentAmountMinor',v_rent_minor,'rentFrequency',v_rent_frequency,'currencyCode',v_currency_code,
      'externalReference',v_external_reference,'openingBalanceMinor',v_opening_minor
    );

    if jsonb_array_length(v_errors)>0 then
      v_error_rows := v_error_rows+1;
      v_all_errors := v_all_errors||v_errors;
      update private.import_rows r set normalized_data=v_normalized,validation_errors=v_errors,proposed_action='error' where r.id=v_row.id;
    elsif p_options->>'dedupeMode'='review' and exists(
      select 1 from private.import_rows earlier
      where earlier.import_job_id=p_import_job_id and earlier.row_number<v_row.row_number
        and earlier.normalized_data->>'unitKey'=v_unit_key and earlier.proposed_action='create_tenancy'
    ) then
      v_skip_count := v_skip_count+1;
      update private.import_rows r set normalized_data=v_normalized,validation_errors='[]',proposed_action='skip' where r.id=v_row.id;
    else
      v_create_count := v_create_count+1;
      update private.import_rows r set normalized_data=v_normalized,validation_errors='[]',proposed_action='create_tenancy' where r.id=v_row.id;
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
    'warnings',0,'errors',v_error_rows,'creates',v_create_count,'updates',0,'skips',v_skip_count
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
revoke all on function public.validate_occupied_import(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.validate_occupied_import(uuid,jsonb,jsonb) to authenticated;

-- ── commit_occupied_import: activate each validated lease (mirrors activate_existing_lease) ────────
create or replace function public.commit_occupied_import(
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
  v_nd jsonb;
  v_household_id uuid; v_person_id uuid; v_lease_id uuid; v_receivable_account_id uuid; v_tenancy_id uuid; v_charge_schedule_id uuid;
  v_start_date date; v_end_date date; v_due_date date; v_rent_minor bigint; v_opening_minor bigint; v_currency char(3);
  v_ar_account_id uuid; v_equity_account_id uuid; v_journal_transaction_id uuid;
  v_tenancies_created integer := 0; v_opening_posted integer := 0;
  v_report_document_id uuid := gen_random_uuid();
  v_response jsonb;
  v_correlation_id uuid := gen_random_uuid();
  v_error text;
begin
  if v_actor_id is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  select * into v_job from public.import_jobs j where j.id=p_import_job_id for update;
  if not found then raise exception using errcode='P0002',message='IMPORT_NOT_FOUND'; end if;
  if v_job.import_type<>'leases' then raise exception using errcode='23514',message='IMPORT_TYPE_MISMATCH'; end if;
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

    for v_row in select * from private.import_rows r where r.import_job_id=p_import_job_id and r.proposed_action='create_tenancy' order by r.row_number loop
      v_nd := v_row.normalized_data;
      v_household_id := gen_random_uuid(); v_lease_id := gen_random_uuid();
      v_receivable_account_id := gen_random_uuid(); v_tenancy_id := gen_random_uuid(); v_charge_schedule_id := gen_random_uuid();
      v_start_date := (v_nd->>'startDate')::date; v_end_date := nullif(v_nd->>'endDate','')::date; v_due_date := (v_nd->>'dueDate')::date;
      v_rent_minor := (v_nd->>'rentAmountMinor')::bigint; v_opening_minor := coalesce((v_nd->>'openingBalanceMinor')::bigint,0);
      v_currency := v_nd->>'currencyCode';

      -- Re-check occupancy under the row FOR UPDATE lock to avoid a race with a concurrent activation.
      perform 1 from public.units u where u.id=(v_nd->>'unitId')::uuid for update;
      if exists(
        select 1 from public.tenancies t
        where t.unit_id=(v_nd->>'unitId')::uuid and t.status in ('scheduled','active','notice_given','move_out_in_progress')
          and daterange(t.possession_start,coalesce(t.possession_end,'infinity'::date),'[]')
            && daterange(v_start_date,coalesce(v_end_date,'infinity'::date),'[]')
      ) then raise exception using errcode='23P01',message='TENANCY_OVERLAP'; end if;

      insert into public.households(id,organization_id,display_name,status)
      values (v_household_id,v_job.organization_id,left(trim(v_nd->>'householdName'),160),'resident');
      insert into public.people(organization_id,first_name,last_name,email,phone_e164)
      values (v_job.organization_id,v_nd->>'firstName',v_nd->>'lastName',nullif(v_nd->>'email',''),nullif(v_nd->>'phoneE164',''))
      returning id into v_person_id;
      insert into public.household_members(organization_id,household_id,person_id,is_primary_contact,is_financially_responsible,starts_on)
      values (v_job.organization_id,v_household_id,v_person_id,true,true,v_start_date);

      insert into public.leases(
        id,organization_id,property_id,unit_id,household_id,country_profile_id,source,external_reference,
        start_date,end_date,rent_amount_minor,currency_code,rent_frequency,status,executed_at,created_by
      ) values (
        v_lease_id,v_job.organization_id,(v_nd->>'propertyId')::uuid,(v_nd->>'unitId')::uuid,v_household_id,(v_nd->>'countryProfileId')::uuid,'imported',nullif(v_nd->>'externalReference',''),
        v_start_date,v_end_date,v_rent_minor,v_currency,v_nd->>'rentFrequency','active',now(),v_actor_id
      );
      insert into public.receivable_accounts(id,organization_id,accounting_book_id,public_reference,currency_code)
      values (v_receivable_account_id,v_job.organization_id,(v_nd->>'accountingBookId')::uuid,'TEN-'||upper(substr(replace(v_tenancy_id::text,'-',''),1,12)),v_currency);
      insert into public.tenancies(
        id,organization_id,property_id,unit_id,household_id,lease_id,receivable_account_id,possession_start,possession_end,status
      ) values (
        v_tenancy_id,v_job.organization_id,(v_nd->>'propertyId')::uuid,(v_nd->>'unitId')::uuid,v_household_id,v_lease_id,v_receivable_account_id,
        v_start_date,v_end_date,case when v_start_date>current_date then 'scheduled'::public.tenancy_status else 'active'::public.tenancy_status end
      );
      insert into public.charge_schedules(
        id,organization_id,accounting_book_id,tenancy_id,receivable_account_id,charge_type,amount_minor,currency_code,
        cadence,due_day,starts_on,ends_on,next_run_on,status
      ) values (
        v_charge_schedule_id,v_job.organization_id,(v_nd->>'accountingBookId')::uuid,v_tenancy_id,v_receivable_account_id,'rent',v_rent_minor,v_currency,
        v_nd->>'rentFrequency',extract(day from v_due_date)::smallint,v_due_date,v_end_date,v_due_date,'active'
      );

      if v_opening_minor<>0 then
        insert into public.ledger_accounts(organization_id,accounting_book_id,account_code,account_name,account_class,normal_balance)
        values (v_job.organization_id,(v_nd->>'accountingBookId')::uuid,'1100','Accounts receivable','asset','debit')
        on conflict (accounting_book_id,account_code) do update set account_name=excluded.account_name returning id into v_ar_account_id;
        insert into public.ledger_accounts(organization_id,accounting_book_id,account_code,account_name,account_class,normal_balance)
        values (v_job.organization_id,(v_nd->>'accountingBookId')::uuid,'3900','Opening balance equity','equity','credit')
        on conflict (accounting_book_id,account_code) do update set account_name=excluded.account_name returning id into v_equity_account_id;
        insert into public.journal_transactions(
          organization_id,operating_entity_id,accounting_book_id,transaction_type,effective_date,source_type,source_id,
          idempotency_key,currency_code,correlation_id,created_by,metadata
        ) values (
          v_job.organization_id,(v_nd->>'operatingEntityId')::uuid,(v_nd->>'accountingBookId')::uuid,'opening_balance',current_date,'tenancy',v_tenancy_id,
          'occupied-import:'||p_import_job_id||':'||v_tenancy_id,v_currency,v_correlation_id,v_actor_id,jsonb_build_object('importJobId',p_import_job_id)
        ) returning id into v_journal_transaction_id;
        if v_opening_minor>0 then
          insert into public.journal_entries(journal_transaction_id,organization_id,accounting_book_id,ledger_account_id,debit_minor,property_id,unit_id,tenancy_id,receivable_account_id,memo)
          values (v_journal_transaction_id,v_job.organization_id,(v_nd->>'accountingBookId')::uuid,v_ar_account_id,v_opening_minor,(v_nd->>'propertyId')::uuid,(v_nd->>'unitId')::uuid,v_tenancy_id,v_receivable_account_id,'Opening resident balance (import)');
          insert into public.journal_entries(journal_transaction_id,organization_id,accounting_book_id,ledger_account_id,credit_minor,property_id,unit_id,tenancy_id,receivable_account_id,memo)
          values (v_journal_transaction_id,v_job.organization_id,(v_nd->>'accountingBookId')::uuid,v_equity_account_id,v_opening_minor,(v_nd->>'propertyId')::uuid,(v_nd->>'unitId')::uuid,v_tenancy_id,v_receivable_account_id,'Opening resident balance offset (import)');
        else
          insert into public.journal_entries(journal_transaction_id,organization_id,accounting_book_id,ledger_account_id,debit_minor,property_id,unit_id,tenancy_id,receivable_account_id,memo)
          values (v_journal_transaction_id,v_job.organization_id,(v_nd->>'accountingBookId')::uuid,v_equity_account_id,abs(v_opening_minor),(v_nd->>'propertyId')::uuid,(v_nd->>'unitId')::uuid,v_tenancy_id,v_receivable_account_id,'Opening resident credit offset (import)');
          insert into public.journal_entries(journal_transaction_id,organization_id,accounting_book_id,ledger_account_id,credit_minor,property_id,unit_id,tenancy_id,receivable_account_id,memo)
          values (v_journal_transaction_id,v_job.organization_id,(v_nd->>'accountingBookId')::uuid,v_ar_account_id,abs(v_opening_minor),(v_nd->>'propertyId')::uuid,(v_nd->>'unitId')::uuid,v_tenancy_id,v_receivable_account_id,'Opening resident credit (import)');
        end if;
        v_opening_posted := v_opening_posted+1;
      end if;

      update private.import_rows r set committed_resource_type='tenancy',committed_resource_id=v_tenancy_id where r.id=v_row.id;
      v_tenancies_created := v_tenancies_created+1;

      insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data) values
        (v_job.organization_id,v_actor_id,'user','lease.recorded','lease',v_lease_id,v_correlation_id,jsonb_build_object('source','imported','importJobId',p_import_job_id)),
        (v_job.organization_id,v_actor_id,'user','tenancy.activated','tenancy',v_tenancy_id,v_correlation_id,jsonb_build_object('householdId',v_household_id,'unitId',(v_nd->>'unitId'),'receivableAccountId',v_receivable_account_id)),
        (v_job.organization_id,v_actor_id,'user','charge_schedule.created','charge_schedule',v_charge_schedule_id,v_correlation_id,jsonb_build_object('tenancyId',v_tenancy_id,'amountMinor',v_rent_minor,'currencyCode',v_currency));
      insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload) values
        (v_job.organization_id,'tenancy.activated','tenancy',v_tenancy_id,v_correlation_id,jsonb_build_object('tenancyId',v_tenancy_id,'householdId',v_household_id,'receivableAccountId',v_receivable_account_id));
      if v_opening_minor<>0 then
        insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
        values (v_job.organization_id,v_actor_id,'user','opening_balance.posted','journal_transaction',v_journal_transaction_id,v_correlation_id,jsonb_build_object('tenancyId',v_tenancy_id,'amountMinor',v_opening_minor,'currencyCode',v_currency));
      end if;
    end loop;

    insert into public.documents(id,organization_id,document_type,title,source,status,operator_supplied_unverified,created_by)
    values (v_report_document_id,v_job.organization_id,'import_report','Occupied lease import report','system_generated','active',false,v_actor_id);

    v_response := jsonb_build_object('status','completed','committed',jsonb_build_object('tenancies',v_tenancies_created,'openingBalances',v_opening_posted),'reportDocumentId',v_report_document_id);
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
      when sqlerrm in ('TENANCY_OVERLAP','VALIDATION_HASH_CONFLICT','IMPORT_HAS_ERRORS') then sqlerrm
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
revoke all on function public.commit_occupied_import(uuid,text) from public,anon;
grant execute on function public.commit_occupied_import(uuid,text) to authenticated;

commit;
