-- Phase 8: operator owner setup.
--
-- owner_entities and ownership_interests shipped with owner statements and approvals, but nothing has
-- ever WRITTEN to them — the only way to create an owner or an ownership interest was direct SQL. This
-- adds the two missing command functions so an operator can build the owner/property structure that
-- owner statements, invitations and approvals already assume.
--
-- No new table and no new RLS policy: both tables and their SELECT policies already exist, so the
-- authority counts are unchanged. The commands reuse the existing model exactly rather than inventing
-- a second one. The binding financial invariant — that a property's active ownership fractions sum to
-- exactly 1 with no duplicate owner on any date — stays where it belongs, in the owner-statement
-- engine (OWNERSHIP_ALLOCATION_INCOMPLETE). These commands must not weaken it, so they do not attempt
-- to re-enforce sum=1 at write time (a sum above 1 can be a legitimate transient while an operator
-- re-allocates), but they DO reject a same-owner overlapping interest, which can never satisfy that
-- engine's distinct-owner rule and is therefore always wrong.
begin;

-- ── create_owner_entity ─────────────────────────────────────────────────────────────────────────────
create or replace function public.create_owner_entity(
  p_organization_id uuid,
  p_display_name text,
  p_entity_type text,
  p_email text,
  p_phone_e164 text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_scope text;
  v_previous private.idempotency_records%rowtype;
  v_request_hash text;
  v_display_name text := trim(coalesce(p_display_name,''));
  v_email public.citext := nullif(trim(coalesce(p_email,'')),'')::public.citext;
  v_phone text := nullif(trim(coalesce(p_phone_e164,'')),'');
  v_owner_entity_id uuid := gen_random_uuid();
  v_correlation_id uuid := gen_random_uuid();
  v_response jsonb;
begin
  if v_actor_id is null then
    raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 200 then
    raise exception using errcode='22023',message='IDEMPOTENCY_KEY_REQUIRED';
  end if;
  if length(v_display_name) not between 1 and 160 then
    raise exception using errcode='22023',message='INVALID_OWNER_NAME';
  end if;
  if p_entity_type is null or p_entity_type not in ('person','company','trust','partnership','other') then
    raise exception using errcode='22023',message='INVALID_OWNER_ENTITY_TYPE';
  end if;
  if v_phone is not null and v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception using errcode='22023',message='INVALID_OWNER_PHONE';
  end if;
  -- An owner has no property yet, so authorization is org-wide, not property-scoped.
  if not private.has_unscoped_org_permission(p_organization_id,'owner.manage') then
    raise exception using errcode='42501',message='OWNER_SCOPE_DENIED';
  end if;
  if not private.has_plan_entitlement(p_organization_id,'portal.owner.standard',false) then
    raise exception using errcode='42501',message='OWNER_PLAN_UNAVAILABLE';
  end if;

  v_actor_scope := 'user:'||v_actor_id::text;
  v_request_hash := encode(sha256(convert_to(concat_ws(
    '|',p_organization_id,v_display_name,p_entity_type,coalesce(v_email::text,''),coalesce(v_phone,'')
  ),'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(
    '|',p_organization_id,v_actor_scope,'CreateOwnerEntity',trim(p_idempotency_key)
  ),0));
  select * into v_previous
  from private.idempotency_records r
  where r.organization_id=p_organization_id
    and r.actor_user_id=v_actor_id
    and r.route='CreateOwnerEntity'
    and r.idempotency_key=trim(p_idempotency_key);
  if found then
    if v_previous.request_hash<>v_request_hash then
      raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT';
    end if;
    if v_previous.state='completed' then return v_previous.response_body; end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;

  insert into private.idempotency_records(
    organization_id,actor_user_id,actor_scope,route,idempotency_key,request_hash,expires_at
  ) values (
    p_organization_id,v_actor_id,v_actor_scope,'CreateOwnerEntity',
    trim(p_idempotency_key),v_request_hash,now()+interval '24 hours'
  );

  insert into public.owner_entities(id,organization_id,display_name,entity_type,email,phone_e164,status)
  values (v_owner_entity_id,p_organization_id,v_display_name,p_entity_type,v_email,v_phone,'active');

  insert into audit.audit_events(
    organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,
    correlation_id,reason,after_data
  ) values (
    p_organization_id,v_actor_id,'user','owner.entityCreated','owner_entity',v_owner_entity_id,
    v_correlation_id,null,jsonb_build_object('displayName',v_display_name,'entityType',p_entity_type)
  );
  insert into private.outbox_events(
    organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload
  ) values (
    p_organization_id,'owner.entityCreated','owner_entity',v_owner_entity_id,v_correlation_id,
    jsonb_build_object('ownerEntityId',v_owner_entity_id,'displayName',v_display_name,'entityType',p_entity_type)
  );

  v_response := jsonb_build_object(
    'ownerEntityId',v_owner_entity_id,'displayName',v_display_name,'entityType',p_entity_type,
    'email',v_email,'phoneE164',v_phone,'status','active'
  );
  update private.idempotency_records r
  set state='completed',response_status=201,response_body=v_response,completed_at=now()
  where r.organization_id=p_organization_id and r.actor_user_id=v_actor_id
    and r.route='CreateOwnerEntity' and r.idempotency_key=trim(p_idempotency_key);
  return v_response;
end;
$$;
revoke all on function public.create_owner_entity(uuid,text,text,text,text,text) from public,anon;
grant execute on function public.create_owner_entity(uuid,text,text,text,text,text) to authenticated;

-- ── create_ownership_interest ───────────────────────────────────────────────────────────────────────
create or replace function public.create_ownership_interest(
  p_organization_id uuid,
  p_property_id uuid,
  p_owner_entity_id uuid,
  p_ownership_fraction numeric,
  p_effective_from date,
  p_effective_to date,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_scope text;
  v_previous private.idempotency_records%rowtype;
  v_request_hash text;
  v_property public.properties%rowtype;
  v_owner_active boolean;
  v_interest_id uuid := gen_random_uuid();
  v_correlation_id uuid := gen_random_uuid();
  v_response jsonb;
begin
  if v_actor_id is null then
    raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 200 then
    raise exception using errcode='22023',message='IDEMPOTENCY_KEY_REQUIRED';
  end if;
  if p_ownership_fraction is null or p_ownership_fraction<=0 or p_ownership_fraction>1 then
    raise exception using errcode='22023',message='INVALID_OWNERSHIP_FRACTION';
  end if;
  if p_effective_from is null then
    raise exception using errcode='22007',message='INVALID_EFFECTIVE_FROM';
  end if;
  if p_effective_to is not null and p_effective_to<p_effective_from then
    raise exception using errcode='22007',message='INVALID_EFFECTIVE_RANGE';
  end if;
  if not private.has_property_access(p_property_id,'owner.manage') then
    raise exception using errcode='42501',message='OWNERSHIP_INTEREST_SCOPE_DENIED';
  end if;
  if not private.has_plan_entitlement(p_organization_id,'portal.owner.standard',false) then
    raise exception using errcode='42501',message='OWNER_PLAN_UNAVAILABLE';
  end if;

  select * into v_property
  from public.properties p
  where p.id=p_property_id and p.organization_id=p_organization_id;
  if not found then
    raise exception using errcode='P0002',message='PROPERTY_NOT_FOUND';
  end if;

  -- The owner must belong to this organization and be active. Captured as an explicit boolean because
  -- FOUND is reset by the inserts that follow the idempotency short-circuit.
  select (oe.status='active') into v_owner_active
  from public.owner_entities oe
  where oe.id=p_owner_entity_id and oe.organization_id=p_organization_id;
  if v_owner_active is null then
    raise exception using errcode='P0002',message='OWNER_ENTITY_NOT_FOUND';
  end if;
  if not v_owner_active then
    raise exception using errcode='23514',message='OWNER_ENTITY_INACTIVE';
  end if;

  v_actor_scope := 'user:'||v_actor_id::text;
  v_request_hash := encode(sha256(convert_to(concat_ws(
    '|',p_organization_id,p_property_id,p_owner_entity_id,p_ownership_fraction,
    p_effective_from,coalesce(p_effective_to::text,'')
  ),'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(
    '|',p_organization_id,v_actor_scope,'CreateOwnershipInterest',trim(p_idempotency_key)
  ),0));
  select * into v_previous
  from private.idempotency_records r
  where r.organization_id=p_organization_id
    and r.actor_user_id=v_actor_id
    and r.route='CreateOwnershipInterest'
    and r.idempotency_key=trim(p_idempotency_key);
  if found then
    if v_previous.request_hash<>v_request_hash then
      raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT';
    end if;
    if v_previous.state='completed' then return v_previous.response_body; end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;

  -- The one write-time guard. Two interests for the SAME owner on the SAME property with overlapping
  -- effective windows can never satisfy the statement engine's one-row-per-owner-per-date rule, so this
  -- is always invalid — unlike an allocation whose total exceeds 1, which may be a transient the
  -- operator is mid-way through fixing. A null effective_to is an open-ended window (+infinity). This
  -- runs AFTER the idempotency short-circuit so a completed replay returns rather than re-checking.
  if exists (
    select 1 from public.ownership_interests oi
    where oi.organization_id=p_organization_id
      and oi.property_id=p_property_id
      and oi.owner_entity_id=p_owner_entity_id
      and oi.effective_from <= coalesce(p_effective_to,'infinity'::date)
      and coalesce(oi.effective_to,'infinity'::date) >= p_effective_from
  ) then
    raise exception using errcode='23514',message='OWNERSHIP_INTEREST_OVERLAP';
  end if;

  insert into private.idempotency_records(
    organization_id,actor_user_id,actor_scope,route,idempotency_key,request_hash,expires_at
  ) values (
    p_organization_id,v_actor_id,v_actor_scope,'CreateOwnershipInterest',
    trim(p_idempotency_key),v_request_hash,now()+interval '24 hours'
  );

  insert into public.ownership_interests(
    id,organization_id,property_id,owner_entity_id,ownership_fraction,effective_from,effective_to
  ) values (
    v_interest_id,p_organization_id,p_property_id,p_owner_entity_id,p_ownership_fraction,
    p_effective_from,p_effective_to
  );

  insert into audit.audit_events(
    organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,
    correlation_id,reason,after_data
  ) values (
    p_organization_id,v_actor_id,'user','owner.interestCreated','ownership_interest',v_interest_id,
    v_correlation_id,null,jsonb_build_object(
      'propertyId',p_property_id,'ownerEntityId',p_owner_entity_id,
      'ownershipFraction',p_ownership_fraction,'effectiveFrom',p_effective_from,'effectiveTo',p_effective_to
    )
  );
  insert into private.outbox_events(
    organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload
  ) values (
    p_organization_id,'owner.interestCreated','ownership_interest',v_interest_id,v_correlation_id,
    jsonb_build_object(
      'ownershipInterestId',v_interest_id,'propertyId',p_property_id,'ownerEntityId',p_owner_entity_id,
      'ownershipFraction',p_ownership_fraction,'effectiveFrom',p_effective_from,'effectiveTo',p_effective_to
    )
  );

  v_response := jsonb_build_object(
    'ownershipInterestId',v_interest_id,'propertyId',p_property_id,'ownerEntityId',p_owner_entity_id,
    'ownershipFraction',p_ownership_fraction,'effectiveFrom',p_effective_from,'effectiveTo',p_effective_to
  );
  update private.idempotency_records r
  set state='completed',response_status=201,response_body=v_response,completed_at=now()
  where r.organization_id=p_organization_id and r.actor_user_id=v_actor_id
    and r.route='CreateOwnershipInterest' and r.idempotency_key=trim(p_idempotency_key);
  return v_response;
end;
$$;
revoke all on function public.create_ownership_interest(uuid,uuid,uuid,numeric,date,date,text) from public,anon;
grant execute on function public.create_ownership_interest(uuid,uuid,uuid,numeric,date,date,text) to authenticated;

commit;
