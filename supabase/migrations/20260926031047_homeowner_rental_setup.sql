-- ADR-HR-2026-09-25: additive self-managing context and atomic rental setup.
begin;

alter table public.units add column if not exists rental_details jsonb not null default '{}'::jsonb;
alter table public.units add constraint units_rental_details_object
  check (jsonb_typeof(rental_details)='object' and pg_column_size(rental_details)<=8192);

create or replace function public.list_operator_organizations()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('organizations',coalesce((
    select jsonb_agg(jsonb_build_object(
      'organizationId',o.id,'displayName',o.display_name,'slug',o.slug,'roleCode',m.role_code,
      'customerPath',o.customer_path,'defaultLocale',o.default_locale,
      'defaultTimeZone',o.default_time_zone,'headquartersCountryCode',o.headquarters_country_code
    ) order by o.display_name,o.id)
    from public.organization_memberships m join public.organizations o on o.id=m.organization_id
    where m.user_id=(select auth.uid()) and m.status='active' and m.starts_at<=now()
      and (m.ends_at is null or m.ends_at>now())
  ),'[]'::jsonb))
$$;
revoke all on function public.list_operator_organizations() from public,anon;
grant execute on function public.list_operator_organizations() to authenticated;

create or replace function public.create_homeowner_rental(
  p_organization_id uuid,p_details jsonb,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid(); v_hash text; v_previous private.idempotency_records%rowtype;
  v_property jsonb; v_space jsonb; v_field text; v_value numeric;
  v_property_id uuid; v_book_id uuid; v_entity_id uuid; v_unit_id uuid;
  v_country char(2); v_currency char(3); v_child jsonb; v_response jsonb;
  v_correlation uuid := gen_random_uuid(); v_prefix text;
begin
  if v_actor is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  if p_organization_id is null or not private.has_unscoped_org_permission(p_organization_id,'property.manage') then
    raise exception using errcode='42501',message='ORGANIZATION_SCOPE_DENIED';
  end if;
  if not exists(select 1 from public.organizations where id=p_organization_id and customer_path='self_managing') then
    raise exception using errcode='42501',message='SELF_MANAGING_WORKSPACE_REQUIRED';
  end if;
  if p_idempotency_key is null or p_idempotency_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception using errcode='22023',message='INVALID_OPERATION_KEY';
  end if;
  if jsonb_typeof(p_details) is distinct from 'object' or pg_column_size(p_details)>8192 then
    raise exception using errcode='22023',message='INVALID_RENTAL_DETAILS';
  end if;
  v_property := p_details->'property'; v_space := p_details->'space';
  if jsonb_typeof(v_property) is distinct from 'object' or jsonb_typeof(v_space) is distinct from 'object'
    or exists(select 1 from jsonb_object_keys(p_details) k where k not in ('property','space')) then
    raise exception using errcode='22023',message='INVALID_RENTAL_DETAILS';
  end if;
  if exists(select 1 from jsonb_object_keys(v_space) k where k not in
    ('name','type','bedrooms','bathrooms','entrance','kitchen','bathroom','laundry','utilitiesNotes','parkingNotes'))
    or jsonb_typeof(v_space->'name') is distinct from 'string'
    or length(trim(v_space->>'name')) not between 1 and 80
    or coalesce(v_space->>'type','') not in ('basement','room','apartment','entire_home','other') then
    raise exception using errcode='22023',message='INVALID_RENTAL_SPACE';
  end if;
  foreach v_field in array array['entrance','kitchen','bathroom','laundry'] loop
    if coalesce(v_space->>v_field,'') not in ('private','shared','none') then
      raise exception using errcode='22023',message='INVALID_SPACE_ACCESS';
    end if;
  end loop;
  foreach v_field in array array['utilitiesNotes','parkingNotes'] loop
    if jsonb_typeof(v_space->v_field) is distinct from 'string' or length(v_space->>v_field)>500 then
      raise exception using errcode='22023',message='INVALID_RENTAL_NOTES';
    end if;
  end loop;
  foreach v_field in array array['bedrooms','bathrooms'] loop
    if jsonb_typeof(v_space->v_field) is distinct from 'null' then
      if jsonb_typeof(v_space->v_field) is distinct from 'number' then
        raise exception using errcode='22023',message='INVALID_ROOM_COUNT';
      end if;
      v_value := (v_space->>v_field)::numeric;
      if v_value<0 or v_value>50 or mod(v_value,0.5)<>0 then
        raise exception using errcode='22023',message='INVALID_ROOM_COUNT';
      end if;
    end if;
  end loop;
  if coalesce(v_property->>'kind','')='existing' then
    if exists(select 1 from jsonb_object_keys(v_property) k where k not in ('kind','propertyId'))
      or coalesce(v_property->>'propertyId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception using errcode='22023',message='INVALID_PROPERTY';
    end if;
  elsif coalesce(v_property->>'kind','')='new' then
    if exists(select 1 from jsonb_object_keys(v_property) k where k not in
      ('kind','accountingBookId','legalName','entityType','name','addressLine1','addressLine2','locality','subdivisionCode','postalCode','countryCode','timeZone')) then
      raise exception using errcode='22023',message='INVALID_PROPERTY';
    end if;
    if jsonb_typeof(v_property->'legalName') is distinct from 'string'
      or jsonb_typeof(v_property->'addressLine2') is distinct from 'string'
      or coalesce(jsonb_typeof(v_property->'accountingBookId'),'missing') not in ('string','null') then
      raise exception using errcode='22023',message='INVALID_PROPERTY';
    end if;
    foreach v_field in array array['name','addressLine1','locality','subdivisionCode','postalCode','countryCode','timeZone'] loop
      if jsonb_typeof(v_property->v_field) is distinct from 'string' or length(trim(v_property->>v_field)) not between 1 and 200 then
        raise exception using errcode='22023',message='INVALID_PROPERTY';
      end if;
    end loop;
    if length(v_property->>'name')>160 or length(v_property->>'locality')>100
      or length(v_property->>'subdivisionCode')>100 or length(v_property->>'postalCode')>30
      or length(v_property->>'timeZone')>80 or length(coalesce(v_property->>'legalName',''))>200
      or length(coalesce(v_property->>'addressLine2',''))>200
      or (v_property->>'countryCode') not in ('US','CA','MX')
      or coalesce(v_property->>'entityType','') not in ('individual','sole_proprietor','company')
      or not exists(select 1 from pg_catalog.pg_timezone_names where name=v_property->>'timeZone') then
      raise exception using errcode='22023',message='INVALID_PROPERTY';
    end if;
  else
    raise exception using errcode='22023',message='INVALID_PROPERTY';
  end if;
  v_hash := encode(sha256(convert_to(p_details::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||':homeowner:'||p_idempotency_key,0));
  select * into v_previous from private.idempotency_records r
    where r.organization_id=p_organization_id and r.actor_user_id=v_actor
      and r.route='CreateHomeownerRental' and r.idempotency_key=p_idempotency_key;
  if found then
    if v_previous.request_hash<>v_hash then raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT'; end if;
    if v_previous.state='completed' then return v_previous.response_body; end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;
  -- Retain the minimal receipt; ordinary 24-hour cleanup must not make an old retry create again.
  insert into private.idempotency_records(organization_id,actor_user_id,route,idempotency_key,request_hash,expires_at)
    values(p_organization_id,v_actor,'CreateHomeownerRental',p_idempotency_key,v_hash,'infinity'::timestamptz);
  v_prefix := 'HR:'||p_idempotency_key;
  if v_property->>'kind'='existing' then
    select p.id,p.accounting_book_id,p.operating_entity_id,p.country_code
      into v_property_id,v_book_id,v_entity_id,v_country from public.properties p
      where p.id=(v_property->>'propertyId')::uuid and p.organization_id=p_organization_id
        and p.status<>'archived' and p.archived_at is null;
    if not found then raise exception using errcode='42501',message='PROPERTY_SCOPE_DENIED'; end if;
  else
    v_country := (v_property->>'countryCode')::char(2);
    v_currency := case v_country when 'US' then 'USD' when 'CA' then 'CAD' when 'MX' then 'MXN' end;
    v_book_id := nullif(v_property->>'accountingBookId','')::uuid;
    if v_book_id is null then
      if length(trim(coalesce(v_property->>'legalName',''))) not between 1 and 200 then
        raise exception using errcode='22023',message='LEGAL_NAME_REQUIRED';
      end if;
      v_child := public.create_operating_entity_and_book(p_organization_id,v_property->>'legalName',
        left(trim(v_property->>'legalName'),160),v_country,v_property->>'entityType',v_currency,
        left((v_property->>'name')||' rentals',120),v_prefix||':entity');
      v_book_id := (v_child->>'accountingBookId')::uuid;
      v_entity_id := (v_child->>'operatingEntityId')::uuid;
    else
      select b.operating_entity_id into v_entity_id from public.accounting_books b
        join public.operating_entities e on e.id=b.operating_entity_id and e.organization_id=b.organization_id
        where b.id=v_book_id and b.organization_id=p_organization_id and b.status='open'
          and b.functional_currency_code=v_currency and e.country_code=v_country;
      if not found then raise exception using errcode='42501',message='ACCOUNTING_BOOK_SCOPE_DENIED'; end if;
    end if;
    v_child := public.create_property(p_organization_id,v_entity_id,v_book_id,
      v_country||'_NATIONAL',v_property->>'name','other_residential',v_property->>'addressLine1',
      v_property->>'addressLine2',v_property->>'locality',v_property->>'subdivisionCode',
      v_property->>'postalCode',v_country,v_property->>'timeZone',v_prefix||':property');
    v_property_id := (v_child->>'propertyId')::uuid;
  end if;
  v_child := public.create_unit(p_organization_id,v_property_id,null,v_space->>'name',v_space->>'type',
    (v_space->>'bedrooms')::numeric,(v_space->>'bathrooms')::numeric,null,v_prefix||':unit');
  v_unit_id := (v_child->>'unitId')::uuid;
  update public.units set rental_details=v_space - 'name' - 'type' - 'bedrooms' - 'bathrooms',updated_at=now()
    where organization_id=p_organization_id and id=v_unit_id;
  v_response := jsonb_build_object('organizationId',p_organization_id,'propertyId',v_property_id,
    'unitId',v_unit_id,'accountingBookId',v_book_id,'operatingEntityId',v_entity_id);
  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
    values(p_organization_id,v_actor,'user','homeowner_rental.created','unit',v_unit_id,v_correlation,v_response);
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
    values(p_organization_id,'homeowner_rental.created','unit',v_unit_id,v_correlation,v_response);
  update private.idempotency_records set state='completed',response_status=201,response_body=v_response,
    resource_type='unit',resource_id=v_unit_id,completed_at=now()
    where organization_id=p_organization_id and actor_user_id=v_actor
      and route='CreateHomeownerRental' and idempotency_key=p_idempotency_key;
  return v_response;
end;
$$;
revoke all on function public.create_homeowner_rental(uuid,jsonb,text) from public,anon;
grant execute on function public.create_homeowner_rental(uuid,jsonb,text) to authenticated;

comment on column public.units.rental_details is
  'Private self-managing space descriptors. Not a public listing or authorization grant.';
commit;
