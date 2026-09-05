-- Operator command boundary for Crecy Living community presentation metadata.
begin;

create or replace function public.save_living_community_profile(
  p_property_id uuid,
  p_subdomain text,
  p_display_name text,
  p_public_address_text text,
  p_headline text,
  p_leasing_email text,
  p_leasing_phone_e164 text,
  p_office_hours_text text[],
  p_amenities text[],
  p_public_notice_title text,
  p_public_notice_body text,
  p_status text,
  p_expected_version integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_organization_id uuid;
  v_existing public.living_community_profiles%rowtype;
  v_profile public.living_community_profiles%rowtype;
  v_request_hash text;
  v_previous private.idempotency_records%rowtype;
  v_correlation_id uuid := gen_random_uuid();
  v_response jsonb;
  v_office_hours text[];
  v_amenities text[];
begin
  if v_actor_id is null then
    raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED';
  end if;
  if not private.has_property_access(p_property_id,'property.manage') then
    raise exception using errcode='42501',message='PROPERTY_SCOPE_DENIED';
  end if;
  if p_expected_version is null or p_expected_version < 0 then
    raise exception using errcode='23514',message='INVALID_VERSION';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 then
    raise exception using errcode='23514',message='IDEMPOTENCY_KEY_REQUIRED';
  end if;

  select p.organization_id into v_organization_id
  from public.properties p
  where p.id=p_property_id;
  if not found then
    raise exception using errcode='23503',message='PROPERTY_NOT_FOUND';
  end if;

  v_office_hours := coalesce(
    array(
      select trim(value)
      from unnest(coalesce(p_office_hours_text,'{}'::text[])) value
      where trim(value)<>''
    ),
    '{}'::text[]
  );
  v_amenities := coalesce(
    array(
      select trim(value)
      from unnest(coalesce(p_amenities,'{}'::text[])) value
      where trim(value)<>''
    ),
    '{}'::text[]
  );

  v_request_hash := encode(
    sha256(convert_to(concat_ws('|',
      p_property_id,
      lower(trim(p_subdomain)),
      trim(p_display_name),
      trim(coalesce(p_public_address_text,'')),
      trim(coalesce(p_headline,'')),
      lower(trim(coalesce(p_leasing_email,''))),
      trim(coalesce(p_leasing_phone_e164,'')),
      v_office_hours::text,
      v_amenities::text,
      trim(coalesce(p_public_notice_title,'')),
      trim(coalesce(p_public_notice_body,'')),
      p_status,
      p_expected_version
    ),'UTF8')),
    'hex'
  );

  select * into v_previous
  from private.idempotency_records r
  where r.organization_id=v_organization_id
    and r.actor_user_id=v_actor_id
    and r.route='SaveLivingCommunityProfile'
    and r.idempotency_key=p_idempotency_key;

  if found then
    if v_previous.request_hash<>v_request_hash then
      raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT';
    end if;
    if v_previous.state='completed' then
      return v_previous.response_body;
    end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;

  insert into private.idempotency_records(
    organization_id,actor_user_id,route,idempotency_key,request_hash,expires_at
  ) values (
    v_organization_id,v_actor_id,'SaveLivingCommunityProfile',
    p_idempotency_key,v_request_hash,now()+interval '24 hours'
  );

  select * into v_existing
  from public.living_community_profiles cp
  where cp.property_id=p_property_id
  for update;

  if found then
    if v_existing.version<>p_expected_version then
      raise exception using errcode='40001',message='VERSION_CONFLICT';
    end if;

    update public.living_community_profiles cp
    set
      subdomain=lower(trim(p_subdomain))::citext,
      display_name=trim(p_display_name),
      public_address_text=nullif(trim(coalesce(p_public_address_text,'')),''),
      headline=nullif(trim(coalesce(p_headline,'')),''),
      leasing_email=nullif(lower(trim(coalesce(p_leasing_email,''))),'')::citext,
      leasing_phone_e164=nullif(trim(coalesce(p_leasing_phone_e164,'')),''),
      office_hours_text=v_office_hours,
      amenities=v_amenities,
      public_notice_title=nullif(trim(coalesce(p_public_notice_title,'')),''),
      public_notice_body=nullif(trim(coalesce(p_public_notice_body,'')),''),
      status=p_status,
      published_at=case
        when p_status='published' then coalesce(cp.published_at,now())
        else cp.published_at
      end,
      updated_by=v_actor_id,
      version=cp.version+1
    where cp.property_id=p_property_id
    returning * into v_profile;
  else
    if p_expected_version<>0 then
      raise exception using errcode='40001',message='VERSION_CONFLICT';
    end if;

    insert into public.living_community_profiles(
      property_id,organization_id,subdomain,display_name,public_address_text,
      headline,leasing_email,leasing_phone_e164,office_hours_text,amenities,
      public_notice_title,public_notice_body,status,published_at,created_by,updated_by
    ) values (
      p_property_id,v_organization_id,lower(trim(p_subdomain))::citext,trim(p_display_name),
      nullif(trim(coalesce(p_public_address_text,'')),''),
      nullif(trim(coalesce(p_headline,'')),''),
      nullif(lower(trim(coalesce(p_leasing_email,''))),'')::citext,
      nullif(trim(coalesce(p_leasing_phone_e164,'')),''),
      v_office_hours,v_amenities,
      nullif(trim(coalesce(p_public_notice_title,'')),''),
      nullif(trim(coalesce(p_public_notice_body,'')),''),
      p_status,
      case when p_status='published' then now() else null end,
      v_actor_id,v_actor_id
    )
    returning * into v_profile;
  end if;

  insert into audit.audit_events(
    organization_id,actor_user_id,actor_type,action_code,resource_type,
    resource_id,correlation_id,before_data,after_data
  ) values (
    v_organization_id,v_actor_id,'user','living.community_profile.saved',
    'living_community_profile',p_property_id,v_correlation_id,
    case
      when v_existing.property_id is null then null
      else jsonb_build_object(
        'subdomain',v_existing.subdomain::text,
        'displayName',v_existing.display_name,
        'status',v_existing.status,
        'version',v_existing.version
      )
    end,
    jsonb_build_object(
      'subdomain',v_profile.subdomain::text,
      'displayName',v_profile.display_name,
      'status',v_profile.status,
      'version',v_profile.version
    )
  );

  insert into private.outbox_events(
    organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload
  ) values (
    v_organization_id,'living.community_profile.saved',
    'living_community_profile',p_property_id,v_correlation_id,
    jsonb_build_object(
      'propertyId',p_property_id,
      'subdomain',v_profile.subdomain::text,
      'status',v_profile.status,
      'version',v_profile.version
    )
  );

  v_response := jsonb_build_object(
    'propertyId',p_property_id,
    'subdomain',v_profile.subdomain::text,
    'displayName',v_profile.display_name,
    'status',v_profile.status,
    'version',v_profile.version,
    'publishedAt',v_profile.published_at
  );

  update private.idempotency_records r
  set
    state='completed',
    response_status=200,
    response_body=v_response,
    resource_type='living_community_profile',
    resource_id=p_property_id,
    completed_at=now()
  where r.organization_id=v_organization_id
    and r.actor_user_id=v_actor_id
    and r.route='SaveLivingCommunityProfile'
    and r.idempotency_key=p_idempotency_key;

  return v_response;
end;
$$;

revoke all on function public.save_living_community_profile(
  uuid,text,text,text,text,text,text,text[],text[],text,text,text,integer,text
) from public,anon;
grant execute on function public.save_living_community_profile(
  uuid,text,text,text,text,text,text,text[],text[],text,text,text,integer,text
) to authenticated;

commit;
