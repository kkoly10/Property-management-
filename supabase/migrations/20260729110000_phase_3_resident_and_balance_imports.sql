-- Phase 3: the residents and opening_balances import legs.
--
-- The lease-bearing legs ('leases', 'combined') each create a household with exactly ONE member — the
-- primary resident. Real households have co-residents, and real migrations arrive with balances in a
-- separate export from the rent roll. These two legs close both gaps against tenancies that already
-- exist:
--   * residents         — adds co-residents to an existing tenancy's household (multi-member support).
--                         An existing person is matched by email within the organization and reused
--                         rather than duplicated, so re-running the file is safe.
--   * opening_balances  — posts a balanced opening receivable (1100/3900) for a tenancy that was
--                         imported without one, keyed so a re-run cannot double-post.
--
-- Both legs resolve their target tenancy by property + unit, the same natural key the rent roll uses.
-- Forward-only; adds four commands and extends create_import_job. No table and no RLS policy, so the
-- authority table/policy counts are unchanged.
begin;

-- ── create_import_job: accept the two remaining legs ──────────────────────────────────────────────
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
  if p_import_type not in ('portfolio','leases','combined','residents','opening_balances') then
    raise exception using errcode='0A000',message='IMPORT_TYPE_NOT_AVAILABLE';
  end if;
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
      and dv.mime_type in ('text/csv','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
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

-- ── Shared: resolve the tenancy a row targets, by property + unit ─────────────────────────────────
create or replace function private.import_resolve_tenancy(
  p_organization_id uuid, p_property_name text, p_address_line1 text, p_locality text,
  p_country_code text, p_unit_code text
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.id
  from public.tenancies t
  join public.properties p on p.id=t.property_id
  join public.units u on u.id=t.unit_id
  where t.organization_id=p_organization_id
    and t.status in ('scheduled','active','notice_given','move_out_in_progress')
    and lower(p.name)=lower(p_property_name)
    and lower(p.address_line1)=lower(p_address_line1)
    and lower(coalesce(p.locality,''))=lower(coalesce(p_locality,''))
    and p.country_code=p_country_code
    and lower(u.unit_code)=lower(p_unit_code)
  order by t.possession_start desc, t.id
  limit 1
$$;
revoke all on function private.import_resolve_tenancy(uuid,text,text,text,text,text) from public,anon,authenticated;

-- ── validate_resident_import ──────────────────────────────────────────────────────────────────────
create or replace function public.validate_resident_import(
  p_import_job_id uuid, p_mapping jsonb, p_options jsonb
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
  v_errors jsonb; v_all_errors jsonb := '[]'::jsonb;
  v_error_rows integer := 0; v_create_count integer := 0;
  v_normalized jsonb;
  v_property_name text; v_address_line1 text; v_locality text; v_country_code text; v_unit_code text;
  v_first_name text; v_last_name text; v_email text; v_phone text;
  v_responsible_text text; v_start_text text;
  v_responsible boolean; v_starts_on date;
  v_tenancy_id uuid; v_household_id uuid; v_existing_person_id uuid;
  v_member_key text;
  v_validation_hash text; v_status text; v_totals jsonb;
  v_correlation_id uuid := gen_random_uuid();
begin
  if v_actor_id is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  select * into v_job from public.import_jobs j where j.id=p_import_job_id for update;
  if not found then raise exception using errcode='P0002',message='IMPORT_NOT_FOUND'; end if;
  if v_job.import_type<>'residents' then raise exception using errcode='23514',message='IMPORT_TYPE_MISMATCH'; end if;
  if not private.can_manage_portfolio_import(v_actor_id,v_job.organization_id) then
    raise exception using errcode='42501',message='PROPERTY_SCOPE_DENIED';
  end if;
  if v_job.status in ('committing','completed','canceled') then
    raise exception using errcode='23514',message='IMPORT_STATE_CONFLICT';
  end if;
  if p_options->>'dedupeMode' not in ('strict','review') or nullif(trim(p_options->>'dateLocale'),'') is null then
    raise exception using errcode='22023',message='INVALID_IMPORT_OPTIONS';
  end if;
  if not (p_mapping ?& array['propertyName','addressLine1','countryCode','unitCode','firstName','lastName']) then
    raise exception using errcode='22023',message='REQUIRED_MAPPING_MISSING';
  end if;

  update public.import_jobs j set status='validating',error_message=null where j.id=p_import_job_id;
  for v_row in select * from private.import_rows r where r.import_job_id=p_import_job_id order by r.row_number loop
    v_errors := '[]'::jsonb;
    v_tenancy_id := null; v_household_id := null; v_existing_person_id := null;
    v_starts_on := null; v_responsible := false;

    v_property_name := private.import_source_value(v_row.source_data,p_mapping,'propertyName');
    v_address_line1 := private.import_source_value(v_row.source_data,p_mapping,'addressLine1');
    v_locality := private.import_source_value(v_row.source_data,p_mapping,'locality');
    v_country_code := upper(private.import_source_value(v_row.source_data,p_mapping,'countryCode'));
    v_unit_code := private.import_source_value(v_row.source_data,p_mapping,'unitCode');
    v_first_name := private.import_source_value(v_row.source_data,p_mapping,'firstName');
    v_last_name := private.import_source_value(v_row.source_data,p_mapping,'lastName');
    v_email := nullif(lower(private.import_source_value(v_row.source_data,p_mapping,'email')),'');
    v_phone := private.import_source_value(v_row.source_data,p_mapping,'phone');
    v_responsible_text := lower(coalesce(private.import_source_value(v_row.source_data,p_mapping,'financiallyResponsible'),'false'));
    v_start_text := private.import_source_value(v_row.source_data,p_mapping,'startsOn');

    v_member_key := lower(coalesce(v_property_name,''))||'|'||lower(coalesce(v_unit_code,''))||'|'||lower(coalesce(v_email,coalesce(v_first_name,'')||' '||coalesce(v_last_name,'')));

    if v_property_name is null then v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','propertyName','code','REQUIRED','message','Property name is required.')); end if;
    if v_address_line1 is null then v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','addressLine1','code','REQUIRED','message','Address line 1 is required.')); end if;
    if v_country_code is null or v_country_code not in ('US','CA','MX') then v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','countryCode','code','INVALID_COUNTRY','message','Country must be US, CA, or MX.')); end if;
    if v_unit_code is null then v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','unitCode','code','REQUIRED','message','Unit code is required.')); end if;
    if v_first_name is null or length(v_first_name)>100 then v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','firstName','code','REQUIRED','message','Resident first name is required.')); end if;
    if v_last_name is null or length(v_last_name)>100 then v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','lastName','code','REQUIRED','message','Resident last name is required.')); end if;
    if v_email is not null and v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','email','code','INVALID_EMAIL','message','Resident email is not a valid address.')); end if;
    if v_phone is not null and v_phone !~ '^\+[1-9][0-9]{7,14}$' then v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','phone','code','INVALID_PHONE','message','Phone must be E.164 (e.g. +14155550123).')); end if;
    if v_responsible_text not in ('true','false','yes','no','1','0') then
      v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','financiallyResponsible','code','INVALID_BOOLEAN','message','Financially responsible must be true or false.'));
    else
      v_responsible := v_responsible_text in ('true','yes','1');
    end if;
    if v_start_text is not null then
      begin v_starts_on := v_start_text::date; exception when others then
        v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','startsOn','code','INVALID_DATE','message','Start date is not a valid date.'));
      end;
    end if;

    if jsonb_array_length(v_errors)=0 then
      v_tenancy_id := private.import_resolve_tenancy(v_job.organization_id,v_property_name,v_address_line1,v_locality,v_country_code,v_unit_code);
      if v_tenancy_id is null then
        v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','unitCode','code','TENANCY_NOT_FOUND','message','No active tenancy was found for this property and unit; import the lease first.'));
      else
        select t.household_id, coalesce(v_starts_on,t.possession_start) into v_household_id, v_starts_on
        from public.tenancies t where t.id=v_tenancy_id;

        -- Reuse a person already known to this organization (matched by email) so re-running the file
        -- adds a membership rather than a duplicate person record.
        if v_email is not null then
          -- Compared as lowered text rather than cast to citext: the extension's schema is not on the
          -- empty search_path, and v_email is already lowercased at read time.
          select p.id into v_existing_person_id from public.people p
          where p.organization_id=v_job.organization_id and lower(p.email::text)=v_email and p.archived_at is null
          order by p.created_at limit 1;
        end if;

        -- Already a member of this household for the same span: nothing to do (the primary member the
        -- lease import created lands here when the roster restates them).
        if v_existing_person_id is not null and exists(
          select 1 from public.household_members hm
          where hm.household_id=v_household_id and hm.person_id=v_existing_person_id and hm.starts_on=v_starts_on
        ) then
          v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','email','code','ALREADY_A_MEMBER','message','This person is already a member of the household from this date.'));
        end if;

        if exists(
          select 1 from private.import_rows earlier
          where earlier.import_job_id=p_import_job_id and earlier.row_number<v_row.row_number
            and earlier.normalized_data->>'memberKey'=v_member_key
        ) then
          v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','email','code','DUPLICATE_MEMBER','message','This resident appears more than once for the same unit in the file.'));
        end if;
      end if;
    end if;

    v_normalized := jsonb_build_object(
      'memberKey',v_member_key,'tenancyId',v_tenancy_id,'householdId',v_household_id,
      'existingPersonId',v_existing_person_id,'firstName',v_first_name,'lastName',v_last_name,
      'email',v_email,'phoneE164',v_phone,'financiallyResponsible',v_responsible,'startsOn',v_starts_on
    );

    if jsonb_array_length(v_errors)>0 then
      v_error_rows := v_error_rows+1; v_all_errors := v_all_errors||v_errors;
      update private.import_rows r set normalized_data=v_normalized,validation_errors=v_errors,proposed_action='error' where r.id=v_row.id;
    else
      v_create_count := v_create_count+1;
      update private.import_rows r set normalized_data=v_normalized,validation_errors='[]'::jsonb,proposed_action='create_household_member' where r.id=v_row.id;
    end if;
  end loop;

  v_status := case when v_error_rows>0 then 'mapping' else 'ready' end;
  v_totals := jsonb_build_object('rows',(select count(*) from private.import_rows r where r.import_job_id=p_import_job_id),
    'valid',v_create_count,'warnings',0,'errors',v_error_rows,'creates',v_create_count,'updates',0,'skips',0);
  v_validation_hash := encode(sha256(convert_to(coalesce((
    select jsonb_agg(jsonb_build_object('row',r.row_number,'action',r.proposed_action,'normalized',r.normalized_data,'errors',r.validation_errors) order by r.row_number)
    from private.import_rows r where r.import_job_id=p_import_job_id
  ),'[]'::jsonb)::text,'UTF8')),'hex');

  update public.import_jobs j
  set status=v_status::public.import_status,mapping=jsonb_build_object('columns',p_mapping,'options',p_options),
      validation_hash=case when v_status='ready' then v_validation_hash else null end,
      validated_at=now(),summary=j.summary||jsonb_build_object('totals',v_totals)
  where j.id=p_import_job_id;
  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
  values (v_job.organization_id,v_actor_id,'user','import.validated','import_job',p_import_job_id,v_correlation_id,
    jsonb_build_object('status',v_status,'totals',v_totals));

  return jsonb_build_object('importJobId',p_import_job_id,'status',v_status,'totals',v_totals,
    'validationHash',case when v_status='ready' then v_validation_hash else null end,'errors',v_all_errors);
end;
$$;
revoke all on function public.validate_resident_import(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.validate_resident_import(uuid,jsonb,jsonb) to authenticated;

-- ── commit_resident_import ────────────────────────────────────────────────────────────────────────
create or replace function public.commit_resident_import(
  p_import_job_id uuid, p_expected_validation_hash text
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
  v_person_id uuid;
  v_people_created integer := 0; v_members_added integer := 0;
  v_report_document_id uuid := gen_random_uuid();
  v_response jsonb; v_correlation_id uuid := gen_random_uuid(); v_error text;
begin
  if v_actor_id is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  select * into v_job from public.import_jobs j where j.id=p_import_job_id for update;
  if not found then raise exception using errcode='P0002',message='IMPORT_NOT_FOUND'; end if;
  if v_job.import_type<>'residents' then raise exception using errcode='23514',message='IMPORT_TYPE_MISMATCH'; end if;
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

    for v_row in select * from private.import_rows r where r.import_job_id=p_import_job_id and r.proposed_action='create_household_member' order by r.row_number loop
      v_nd := v_row.normalized_data;
      v_person_id := nullif(v_nd->>'existingPersonId','')::uuid;
      if v_person_id is null then
        insert into public.people(organization_id,first_name,last_name,email,phone_e164)
        values (v_job.organization_id,v_nd->>'firstName',v_nd->>'lastName',nullif(v_nd->>'email',''),nullif(v_nd->>'phoneE164',''))
        returning id into v_person_id;
        v_people_created := v_people_created+1;
      end if;

      -- A co-resident is never the primary contact: the lease import already designated one, and two
      -- primaries would make notification routing ambiguous.
      insert into public.household_members(organization_id,household_id,person_id,is_primary_contact,is_financially_responsible,starts_on)
      values (v_job.organization_id,(v_nd->>'householdId')::uuid,v_person_id,false,(v_nd->>'financiallyResponsible')::boolean,(v_nd->>'startsOn')::date);
      v_members_added := v_members_added+1;

      update private.import_rows r set committed_resource_type='household_member',committed_resource_id=v_person_id where r.id=v_row.id;
      insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
      values (v_job.organization_id,v_actor_id,'user','household_member.added','household',(v_nd->>'householdId')::uuid,v_correlation_id,
        jsonb_build_object('personId',v_person_id,'tenancyId',v_nd->>'tenancyId','financiallyResponsible',(v_nd->>'financiallyResponsible')::boolean,'importJobId',p_import_job_id));
    end loop;

    insert into public.documents(id,organization_id,document_type,title,source,status,operator_supplied_unverified,created_by)
    values (v_report_document_id,v_job.organization_id,'import_report','Resident roster import report','system_generated','active',false,v_actor_id);

    v_response := jsonb_build_object('status','completed','committed',jsonb_build_object('people',v_people_created,'householdMembers',v_members_added),'reportDocumentId',v_report_document_id);
    update public.import_jobs j set status='completed',committed_at=now(),error_message=null,
      summary=j.summary||jsonb_build_object('commitResponse',v_response) where j.id=p_import_job_id;
    insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
    values (v_job.organization_id,v_actor_id,'user','import.committed','import_job',p_import_job_id,v_correlation_id,
      jsonb_build_object('validationHash',p_expected_validation_hash,'committed',v_response->'committed','reportDocumentId',v_report_document_id));
    insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
    values (v_job.organization_id,'import.committed','import_job',p_import_job_id,v_correlation_id,
      jsonb_build_object('importJobId',p_import_job_id,'committed',v_response->'committed','reportDocumentId',v_report_document_id));
    return v_response;
  exception when others then
    v_error := case when sqlerrm in ('VALIDATION_HASH_CONFLICT','IMPORT_HAS_ERRORS') then sqlerrm else 'IMPORT_COMMIT_FAILED' end;
    update public.import_jobs j set status='failed',error_message=v_error where j.id=p_import_job_id;
    insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
    values (v_job.organization_id,v_actor_id,'user','import.failed','import_job',p_import_job_id,v_correlation_id,jsonb_build_object('error',v_error));
    return jsonb_build_object('status','failed','error',v_error);
  end;
end;
$$;
revoke all on function public.commit_resident_import(uuid,text) from public,anon;
grant execute on function public.commit_resident_import(uuid,text) to authenticated;

-- ── validate_opening_balance_import ───────────────────────────────────────────────────────────────
create or replace function public.validate_opening_balance_import(
  p_import_job_id uuid, p_mapping jsonb, p_options jsonb
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
  v_errors jsonb; v_all_errors jsonb := '[]'::jsonb;
  v_error_rows integer := 0; v_create_count integer := 0; v_net_minor bigint := 0;
  v_normalized jsonb;
  v_property_name text; v_address_line1 text; v_locality text; v_country_code text; v_unit_code text;
  v_amount_text text; v_effective_text text; v_memo text;
  v_amount_minor bigint; v_effective_date date;
  v_tenancy_id uuid; v_tenancy public.tenancies%rowtype; v_property public.properties%rowtype;
  v_receivable public.receivable_accounts%rowtype;
  v_balance_key text;
  v_validation_hash text; v_status text; v_totals jsonb;
  v_correlation_id uuid := gen_random_uuid();
begin
  if v_actor_id is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  select * into v_job from public.import_jobs j where j.id=p_import_job_id for update;
  if not found then raise exception using errcode='P0002',message='IMPORT_NOT_FOUND'; end if;
  if v_job.import_type<>'opening_balances' then raise exception using errcode='23514',message='IMPORT_TYPE_MISMATCH'; end if;
  if not private.can_manage_portfolio_import(v_actor_id,v_job.organization_id) then
    raise exception using errcode='42501',message='PROPERTY_SCOPE_DENIED';
  end if;
  if v_job.status in ('committing','completed','canceled') then
    raise exception using errcode='23514',message='IMPORT_STATE_CONFLICT';
  end if;
  if p_options->>'dedupeMode' not in ('strict','review') or nullif(trim(p_options->>'dateLocale'),'') is null then
    raise exception using errcode='22023',message='INVALID_IMPORT_OPTIONS';
  end if;
  if not (p_mapping ?& array['propertyName','addressLine1','countryCode','unitCode','openingBalanceMinor']) then
    raise exception using errcode='22023',message='REQUIRED_MAPPING_MISSING';
  end if;

  update public.import_jobs j set status='validating',error_message=null where j.id=p_import_job_id;
  for v_row in select * from private.import_rows r where r.import_job_id=p_import_job_id order by r.row_number loop
    v_errors := '[]'::jsonb;
    v_tenancy_id := null; v_tenancy := null; v_property := null; v_receivable := null;
    v_amount_minor := null; v_effective_date := null;

    v_property_name := private.import_source_value(v_row.source_data,p_mapping,'propertyName');
    v_address_line1 := private.import_source_value(v_row.source_data,p_mapping,'addressLine1');
    v_locality := private.import_source_value(v_row.source_data,p_mapping,'locality');
    v_country_code := upper(private.import_source_value(v_row.source_data,p_mapping,'countryCode'));
    v_unit_code := private.import_source_value(v_row.source_data,p_mapping,'unitCode');
    v_amount_text := private.import_source_value(v_row.source_data,p_mapping,'openingBalanceMinor');
    v_effective_text := private.import_source_value(v_row.source_data,p_mapping,'effectiveDate');
    v_memo := private.import_source_value(v_row.source_data,p_mapping,'memo');

    v_balance_key := lower(coalesce(v_property_name,''))||'|'||lower(coalesce(v_address_line1,''))||'|'||lower(coalesce(v_locality,''))||'|'||coalesce(v_country_code,'')||'|'||lower(coalesce(v_unit_code,''));

    if v_property_name is null then v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','propertyName','code','REQUIRED','message','Property name is required.')); end if;
    if v_address_line1 is null then v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','addressLine1','code','REQUIRED','message','Address line 1 is required.')); end if;
    if v_country_code is null or v_country_code not in ('US','CA','MX') then v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','countryCode','code','INVALID_COUNTRY','message','Country must be US, CA, or MX.')); end if;
    if v_unit_code is null then v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','unitCode','code','REQUIRED','message','Unit code is required.')); end if;
    if v_amount_text is null or v_amount_text !~ '^-?[0-9]+$' then
      v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','openingBalanceMinor','code','INVALID_OPENING_BALANCE','message','Opening balance must be a whole number of minor units.'));
    else
      v_amount_minor := v_amount_text::bigint;
      if v_amount_minor=0 then
        v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','openingBalanceMinor','code','ZERO_OPENING_BALANCE','message','A zero opening balance has nothing to post; remove the row.'));
      end if;
    end if;
    if v_effective_text is not null then
      begin v_effective_date := v_effective_text::date; exception when others then
        v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','effectiveDate','code','INVALID_DATE','message','Effective date is not a valid date.'));
      end;
    end if;

    if jsonb_array_length(v_errors)=0 then
      v_tenancy_id := private.import_resolve_tenancy(v_job.organization_id,v_property_name,v_address_line1,v_locality,v_country_code,v_unit_code);
      if v_tenancy_id is null then
        v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','unitCode','code','TENANCY_NOT_FOUND','message','No active tenancy was found for this property and unit; import the lease first.'));
      else
        select * into v_tenancy from public.tenancies t where t.id=v_tenancy_id;
        select * into v_property from public.properties p where p.id=v_tenancy.property_id;
        select * into v_receivable from public.receivable_accounts ra where ra.id=v_tenancy.receivable_account_id;
        if coalesce(v_effective_date,current_date) < v_tenancy.possession_start then
          v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','effectiveDate','code','EFFECTIVE_BEFORE_POSSESSION','message','The effective date precedes the tenancy start.'));
        end if;
        -- One opening balance per tenancy, ever: re-running the export must not double the receivable.
        if exists(
          select 1 from public.journal_transactions jt
          where jt.source_type='tenancy' and jt.source_id=v_tenancy_id and jt.transaction_type='opening_balance'
        ) then
          v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','openingBalanceMinor','code','OPENING_BALANCE_EXISTS','message','This tenancy already has an opening balance; post a correction instead.'));
        end if;
        if exists(
          select 1 from private.import_rows earlier
          where earlier.import_job_id=p_import_job_id and earlier.row_number<v_row.row_number
            and earlier.normalized_data->>'balanceKey'=v_balance_key
        ) then
          v_errors := v_errors||jsonb_build_array(jsonb_build_object('row',v_row.row_number,'field','unitCode','code','DUPLICATE_BALANCE','message','This unit appears more than once in the file.'));
        end if;
      end if;
    end if;

    v_normalized := jsonb_build_object(
      'balanceKey',v_balance_key,'tenancyId',v_tenancy_id,
      'propertyId',v_tenancy.property_id,'unitId',v_tenancy.unit_id,
      'operatingEntityId',v_property.operating_entity_id,'accountingBookId',v_property.accounting_book_id,
      'receivableAccountId',v_tenancy.receivable_account_id,'currencyCode',v_receivable.currency_code,
      'amountMinor',v_amount_minor,'effectiveDate',coalesce(v_effective_date,current_date),
      'memo',left(coalesce(v_memo,'Opening resident balance (import)'),200)
    );

    if jsonb_array_length(v_errors)>0 then
      v_error_rows := v_error_rows+1; v_all_errors := v_all_errors||v_errors;
      update private.import_rows r set normalized_data=v_normalized,validation_errors=v_errors,proposed_action='error' where r.id=v_row.id;
    else
      v_create_count := v_create_count+1; v_net_minor := v_net_minor+v_amount_minor;
      update private.import_rows r set normalized_data=v_normalized,validation_errors='[]'::jsonb,proposed_action='post_opening_balance' where r.id=v_row.id;
    end if;
  end loop;

  v_status := case when v_error_rows>0 then 'mapping' else 'ready' end;
  v_totals := jsonb_build_object('rows',(select count(*) from private.import_rows r where r.import_job_id=p_import_job_id),
    'valid',v_create_count,'warnings',0,'errors',v_error_rows,'creates',v_create_count,'updates',0,'skips',0,'netOpeningBalanceMinor',v_net_minor);
  v_validation_hash := encode(sha256(convert_to(coalesce((
    select jsonb_agg(jsonb_build_object('row',r.row_number,'action',r.proposed_action,'normalized',r.normalized_data,'errors',r.validation_errors) order by r.row_number)
    from private.import_rows r where r.import_job_id=p_import_job_id
  ),'[]'::jsonb)::text,'UTF8')),'hex');

  update public.import_jobs j
  set status=v_status::public.import_status,mapping=jsonb_build_object('columns',p_mapping,'options',p_options),
      validation_hash=case when v_status='ready' then v_validation_hash else null end,
      validated_at=now(),summary=j.summary||jsonb_build_object('totals',v_totals)
  where j.id=p_import_job_id;
  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
  values (v_job.organization_id,v_actor_id,'user','import.validated','import_job',p_import_job_id,v_correlation_id,
    jsonb_build_object('status',v_status,'totals',v_totals));

  return jsonb_build_object('importJobId',p_import_job_id,'status',v_status,'totals',v_totals,
    'validationHash',case when v_status='ready' then v_validation_hash else null end,'errors',v_all_errors);
end;
$$;
revoke all on function public.validate_opening_balance_import(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.validate_opening_balance_import(uuid,jsonb,jsonb) to authenticated;

-- ── commit_opening_balance_import ─────────────────────────────────────────────────────────────────
create or replace function public.commit_opening_balance_import(
  p_import_job_id uuid, p_expected_validation_hash text
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
  v_amount_minor bigint; v_currency char(3);
  v_ar_account_id uuid; v_equity_account_id uuid; v_journal_transaction_id uuid;
  v_posted integer := 0; v_net_minor bigint := 0;
  v_report_document_id uuid := gen_random_uuid();
  v_response jsonb; v_correlation_id uuid := gen_random_uuid(); v_error text;
begin
  if v_actor_id is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  select * into v_job from public.import_jobs j where j.id=p_import_job_id for update;
  if not found then raise exception using errcode='P0002',message='IMPORT_NOT_FOUND'; end if;
  if v_job.import_type<>'opening_balances' then raise exception using errcode='23514',message='IMPORT_TYPE_MISMATCH'; end if;
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

    for v_row in select * from private.import_rows r where r.import_job_id=p_import_job_id and r.proposed_action='post_opening_balance' order by r.row_number loop
      v_nd := v_row.normalized_data;
      v_amount_minor := (v_nd->>'amountMinor')::bigint;
      v_currency := v_nd->>'currencyCode';

      -- Re-check under the tenancy lock: validation ran earlier and another path may have posted an
      -- opening balance since. Double-posting a receivable is a financial defect, not a nuisance.
      perform 1 from public.tenancies t where t.id=(v_nd->>'tenancyId')::uuid for update;
      if exists(
        select 1 from public.journal_transactions jt
        where jt.source_type='tenancy' and jt.source_id=(v_nd->>'tenancyId')::uuid and jt.transaction_type='opening_balance'
      ) then raise exception using errcode='23505',message='OPENING_BALANCE_EXISTS'; end if;

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
        v_job.organization_id,(v_nd->>'operatingEntityId')::uuid,(v_nd->>'accountingBookId')::uuid,'opening_balance',
        (v_nd->>'effectiveDate')::date,'tenancy',(v_nd->>'tenancyId')::uuid,
        'balance-import:'||p_import_job_id||':'||(v_nd->>'tenancyId'),v_currency,v_correlation_id,v_actor_id,
        jsonb_build_object('importJobId',p_import_job_id)
      ) returning id into v_journal_transaction_id;

      if v_amount_minor>0 then
        insert into public.journal_entries(journal_transaction_id,organization_id,accounting_book_id,ledger_account_id,debit_minor,property_id,unit_id,tenancy_id,receivable_account_id,memo)
        values (v_journal_transaction_id,v_job.organization_id,(v_nd->>'accountingBookId')::uuid,v_ar_account_id,v_amount_minor,(v_nd->>'propertyId')::uuid,(v_nd->>'unitId')::uuid,(v_nd->>'tenancyId')::uuid,(v_nd->>'receivableAccountId')::uuid,v_nd->>'memo');
        insert into public.journal_entries(journal_transaction_id,organization_id,accounting_book_id,ledger_account_id,credit_minor,property_id,unit_id,tenancy_id,receivable_account_id,memo)
        values (v_journal_transaction_id,v_job.organization_id,(v_nd->>'accountingBookId')::uuid,v_equity_account_id,v_amount_minor,(v_nd->>'propertyId')::uuid,(v_nd->>'unitId')::uuid,(v_nd->>'tenancyId')::uuid,(v_nd->>'receivableAccountId')::uuid,v_nd->>'memo');
      else
        insert into public.journal_entries(journal_transaction_id,organization_id,accounting_book_id,ledger_account_id,debit_minor,property_id,unit_id,tenancy_id,receivable_account_id,memo)
        values (v_journal_transaction_id,v_job.organization_id,(v_nd->>'accountingBookId')::uuid,v_equity_account_id,abs(v_amount_minor),(v_nd->>'propertyId')::uuid,(v_nd->>'unitId')::uuid,(v_nd->>'tenancyId')::uuid,(v_nd->>'receivableAccountId')::uuid,v_nd->>'memo');
        insert into public.journal_entries(journal_transaction_id,organization_id,accounting_book_id,ledger_account_id,credit_minor,property_id,unit_id,tenancy_id,receivable_account_id,memo)
        values (v_journal_transaction_id,v_job.organization_id,(v_nd->>'accountingBookId')::uuid,v_ar_account_id,abs(v_amount_minor),(v_nd->>'propertyId')::uuid,(v_nd->>'unitId')::uuid,(v_nd->>'tenancyId')::uuid,(v_nd->>'receivableAccountId')::uuid,v_nd->>'memo');
      end if;

      v_posted := v_posted+1; v_net_minor := v_net_minor+v_amount_minor;
      update private.import_rows r set committed_resource_type='journal_transaction',committed_resource_id=v_journal_transaction_id where r.id=v_row.id;
      insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
      values (v_job.organization_id,v_actor_id,'user','opening_balance.posted','journal_transaction',v_journal_transaction_id,v_correlation_id,
        jsonb_build_object('tenancyId',v_nd->>'tenancyId','amountMinor',v_amount_minor,'currencyCode',v_currency,'importJobId',p_import_job_id));
    end loop;

    insert into public.documents(id,organization_id,document_type,title,source,status,operator_supplied_unverified,created_by)
    values (v_report_document_id,v_job.organization_id,'import_report','Opening balance import report','system_generated','active',false,v_actor_id);

    v_response := jsonb_build_object('status','completed','committed',jsonb_build_object('openingBalances',v_posted,'netOpeningBalanceMinor',v_net_minor),'reportDocumentId',v_report_document_id);
    update public.import_jobs j set status='completed',committed_at=now(),error_message=null,
      summary=j.summary||jsonb_build_object('commitResponse',v_response) where j.id=p_import_job_id;
    insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
    values (v_job.organization_id,v_actor_id,'user','import.committed','import_job',p_import_job_id,v_correlation_id,
      jsonb_build_object('validationHash',p_expected_validation_hash,'committed',v_response->'committed','reportDocumentId',v_report_document_id));
    insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
    values (v_job.organization_id,'import.committed','import_job',p_import_job_id,v_correlation_id,
      jsonb_build_object('importJobId',p_import_job_id,'committed',v_response->'committed','reportDocumentId',v_report_document_id));
    return v_response;
  exception when others then
    v_error := case when sqlerrm in ('VALIDATION_HASH_CONFLICT','IMPORT_HAS_ERRORS','OPENING_BALANCE_EXISTS') then sqlerrm else 'IMPORT_COMMIT_FAILED' end;
    update public.import_jobs j set status='failed',error_message=v_error where j.id=p_import_job_id;
    insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
    values (v_job.organization_id,v_actor_id,'user','import.failed','import_job',p_import_job_id,v_correlation_id,jsonb_build_object('error',v_error));
    return jsonb_build_object('status','failed','error',v_error);
  end;
end;
$$;
revoke all on function public.commit_opening_balance_import(uuid,text) from public,anon;
grant execute on function public.commit_opening_balance_import(uuid,text) to authenticated;

commit;
