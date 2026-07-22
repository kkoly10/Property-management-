begin;

create table public.provider_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  operating_entity_id uuid not null references public.operating_entities(id) on delete restrict,
  provider_code text not null,
  provider_account_id text not null,
  account_configuration text not null,
  dashboard_access text not null,
  fees_payer text not null,
  losses_collector text not null,
  status text not null check (status in ('pending','requirements_due','enabled','restricted','disabled')),
  capabilities jsonb not null default '{}'::jsonb,
  requirements jsonb not null default '{}'::jsonb,
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (provider_code,provider_account_id),
  unique (organization_id,operating_entity_id,provider_code),
  foreign key (organization_id,operating_entity_id)
    references public.operating_entities(organization_id,id) on delete restrict,
  check (provider_code='stripe'),
  check (provider_account_id ~ '^acct_[A-Za-z0-9]+$'),
  check (account_configuration='standard'),
  check (dashboard_access='full'),
  check (fees_payer='connected_account'),
  check (losses_collector='stripe'),
  check (jsonb_typeof(capabilities)='object'),
  check (jsonb_typeof(requirements)='object')
);
create index provider_connections_org_status_idx
  on public.provider_connections(organization_id,status,operating_entity_id);
create index provider_connections_entity_idx
  on public.provider_connections(operating_entity_id);
create trigger provider_connections_touch
before update on public.provider_connections
for each row execute function private.touch_updated_at();

alter table public.provider_connections enable row level security;
create policy provider_connections_privileged_read
on public.provider_connections for select to authenticated
using (
  (select private.has_org_permission(organization_id,'finance.manage'))
  or (select private.has_org_permission(organization_id,'organization.manage'))
);

revoke all on public.provider_connections from public,anon,authenticated;
grant select on public.provider_connections to authenticated;

create or replace function public.prepare_stripe_onboarding_link(
  p_organization_id uuid,
  p_operating_entity_id uuid,
  p_return_url text,
  p_refresh_url text,
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
  v_entity public.operating_entities%rowtype;
  v_connection public.provider_connections%rowtype;
  v_previous private.idempotency_records%rowtype;
  v_request_hash text;
begin
  if v_actor_id is null then
    raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED';
  end if;
  if coalesce(auth.jwt()->>'aal','aal1')<>'aal2' then
    raise exception using errcode='42501',message='MFA_REQUIRED';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 200 then
    raise exception using errcode='23514',message='INVALID_IDEMPOTENCY_KEY';
  end if;
  if p_return_url is null or length(p_return_url) not between 10 and 2048
    or p_refresh_url is null or length(p_refresh_url) not between 10 and 2048 then
    raise exception using errcode='23514',message='INVALID_RETURN_URL';
  end if;
  if not private.has_org_permission(p_organization_id,'organization.manage') then
    raise exception using errcode='42501',message='ORGANIZATION_SCOPE_DENIED';
  end if;

  select e.* into v_entity
  from public.operating_entities e
  where e.id=p_operating_entity_id
    and e.organization_id=p_organization_id
    and e.status in ('draft','active');
  if not found then
    raise exception using errcode='P0002',message='OPERATING_ENTITY_NOT_FOUND';
  end if;

  v_actor_scope := 'user:'||v_actor_id::text;
  v_request_hash := encode(sha256(convert_to(jsonb_build_object(
    'organizationId',p_organization_id,
    'operatingEntityId',p_operating_entity_id,
    'returnUrl',p_return_url,
    'refreshUrl',p_refresh_url
  )::text,'UTF8')),'hex');

  select r.* into v_previous
  from private.idempotency_records r
  where r.organization_id=p_organization_id
    and r.actor_scope=v_actor_scope
    and r.route='CreateStripeOnboardingLink'
    and r.idempotency_key=trim(p_idempotency_key);
  if found then
    if v_previous.request_hash<>v_request_hash then
      raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT';
    end if;
    if v_previous.state='completed' then
      return jsonb_build_object('replayResponse',v_previous.response_body);
    end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;

  select c.* into v_connection
  from public.provider_connections c
  where c.organization_id=p_organization_id
    and c.operating_entity_id=p_operating_entity_id
    and c.provider_code='stripe';

  return jsonb_build_object(
    'organizationId',p_organization_id,
    'operatingEntityId',v_entity.id,
    'entityDisplayName',v_entity.display_name,
    'countryCode',v_entity.country_code,
    'providerConnectionId',v_connection.id,
    'providerAccountId',v_connection.provider_account_id,
    'replayResponse',null
  );
end;
$$;

create or replace function public.complete_stripe_onboarding_link(
  p_actor_user_id uuid,
  p_actor_aal text,
  p_organization_id uuid,
  p_operating_entity_id uuid,
  p_provider_account_id text,
  p_capabilities jsonb,
  p_requirements jsonb,
  p_charges_enabled boolean,
  p_payouts_enabled boolean,
  p_link_url text,
  p_link_expires_at timestamptz,
  p_return_url text,
  p_refresh_url text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entity public.operating_entities%rowtype;
  v_connection public.provider_connections%rowtype;
  v_previous private.idempotency_records%rowtype;
  v_actor_scope text := 'user:'||p_actor_user_id::text;
  v_request_hash text;
  v_status text;
  v_correlation_id uuid := gen_random_uuid();
  v_created boolean := false;
  v_response jsonb;
begin
  if p_actor_user_id is null or p_actor_aal<>'aal2' then
    raise exception using errcode='42501',message='MFA_REQUIRED';
  end if;
  if not exists (
    select 1
    from public.organization_memberships m
    join public.role_permissions rp on rp.role_code=m.role_code
    where m.organization_id=p_organization_id
      and m.user_id=p_actor_user_id
      and m.status='active'
      and m.starts_at<=now()
      and (m.ends_at is null or m.ends_at>now())
      and (rp.permission_code='*' or rp.permission_code='organization.manage')
  ) then
    raise exception using errcode='42501',message='ORGANIZATION_SCOPE_DENIED';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 200 then
    raise exception using errcode='23514',message='INVALID_IDEMPOTENCY_KEY';
  end if;
  if p_provider_account_id is null or p_provider_account_id !~ '^acct_[A-Za-z0-9]+$' then
    raise exception using errcode='23514',message='INVALID_PROVIDER_ACCOUNT';
  end if;
  if jsonb_typeof(p_capabilities)<>'object' or jsonb_typeof(p_requirements)<>'object' then
    raise exception using errcode='23514',message='INVALID_PROVIDER_STATE';
  end if;
  if p_link_url is null or length(p_link_url) not between 10 and 2048
    or p_link_url !~ '^https://connect\.stripe\.com/'
    or p_link_expires_at is null or p_link_expires_at<=now() then
    raise exception using errcode='23514',message='INVALID_PROVIDER_LINK';
  end if;
  if p_return_url is null or length(p_return_url) not between 10 and 2048
    or p_refresh_url is null or length(p_refresh_url) not between 10 and 2048 then
    raise exception using errcode='23514',message='INVALID_RETURN_URL';
  end if;

  select e.* into v_entity
  from public.operating_entities e
  where e.id=p_operating_entity_id
    and e.organization_id=p_organization_id
    and e.status in ('draft','active')
  for update;
  if not found then
    raise exception using errcode='P0002',message='OPERATING_ENTITY_NOT_FOUND';
  end if;

  v_request_hash := encode(sha256(convert_to(jsonb_build_object(
    'organizationId',p_organization_id,
    'operatingEntityId',p_operating_entity_id,
    'returnUrl',p_return_url,
    'refreshUrl',p_refresh_url
  )::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(
    '|',p_organization_id,v_actor_scope,'CreateStripeOnboardingLink',trim(p_idempotency_key)
  ),0));
  select r.* into v_previous
  from private.idempotency_records r
  where r.organization_id=p_organization_id
    and r.actor_scope=v_actor_scope
    and r.route='CreateStripeOnboardingLink'
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
    p_organization_id,p_actor_user_id,v_actor_scope,'CreateStripeOnboardingLink',
    trim(p_idempotency_key),v_request_hash,now()+interval '24 hours'
  );

  if coalesce(p_requirements->>'disabledReason','')<>'' then
    v_status := 'restricted';
  elsif jsonb_array_length(coalesce(p_requirements->'currentlyDue','[]'::jsonb))>0 then
    v_status := 'requirements_due';
  elsif p_charges_enabled and p_payouts_enabled then
    v_status := 'enabled';
  else
    v_status := 'pending';
  end if;

  select c.* into v_connection
  from public.provider_connections c
  where c.organization_id=p_organization_id
    and c.operating_entity_id=p_operating_entity_id
    and c.provider_code='stripe'
  for update;

  if found then
    if v_connection.provider_account_id<>p_provider_account_id then
      raise exception using errcode='23505',message='PROVIDER_CONNECTION_CONFLICT';
    end if;
    update public.provider_connections c set
      status=v_status,
      capabilities=p_capabilities,
      requirements=p_requirements,
      charges_enabled=p_charges_enabled,
      payouts_enabled=p_payouts_enabled,
      verified_at=case when p_charges_enabled and p_payouts_enabled then coalesce(c.verified_at,now()) else null end
    where c.id=v_connection.id
    returning c.* into v_connection;
  else
    insert into public.provider_connections(
      organization_id,operating_entity_id,provider_code,provider_account_id,
      account_configuration,dashboard_access,fees_payer,losses_collector,status,
      capabilities,requirements,charges_enabled,payouts_enabled,verified_at
    ) values (
      p_organization_id,p_operating_entity_id,'stripe',p_provider_account_id,
      'standard','full','connected_account','stripe',v_status,
      p_capabilities,p_requirements,p_charges_enabled,p_payouts_enabled,
      case when p_charges_enabled and p_payouts_enabled then now() else null end
    ) returning * into v_connection;
    v_created := true;
  end if;

  if v_created then
    insert into audit.audit_events(
      organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,
      correlation_id,after_data
    ) values (
      p_organization_id,p_actor_user_id,'user','payment_connection.created',
      'provider_connection',v_connection.id,v_correlation_id,
      jsonb_build_object('providerCode','stripe','operatingEntityId',p_operating_entity_id,'status',v_connection.status)
    );
    insert into private.outbox_events(
      organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload
    ) values (
      p_organization_id,'payment_connection.created','provider_connection',v_connection.id,v_correlation_id,
      jsonb_build_object('providerConnectionId',v_connection.id,'operatingEntityId',p_operating_entity_id,'status',v_connection.status)
    );
  end if;

  insert into audit.audit_events(
    organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,
    correlation_id,after_data
  ) values (
    p_organization_id,p_actor_user_id,'user','payment_connection.onboarding_link_created',
    'provider_connection',v_connection.id,v_correlation_id,
    jsonb_build_object('expiresAt',p_link_expires_at,'status',v_connection.status)
  );
  insert into private.outbox_events(
    organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload
  ) values (
    p_organization_id,'payment_connection.onboarding_link_created','provider_connection',v_connection.id,v_correlation_id,
    jsonb_build_object('providerConnectionId',v_connection.id,'expiresAt',p_link_expires_at,'status',v_connection.status)
  );

  v_response := jsonb_build_object(
    'providerConnectionId',v_connection.id,
    'url',p_link_url,
    'expiresAt',p_link_expires_at
  );
  update private.idempotency_records r set
    state='completed',response_status=201,response_body=v_response,
    resource_type='provider_connection',resource_id=v_connection.id,completed_at=now()
  where r.organization_id=p_organization_id
    and r.actor_scope=v_actor_scope
    and r.route='CreateStripeOnboardingLink'
    and r.idempotency_key=trim(p_idempotency_key);

  return v_response;
end;
$$;

create or replace function public.get_payment_connection_settings()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'authenticatorLevel',coalesce(auth.jwt()->>'aal','aal1'),
    'items',coalesce(jsonb_agg(jsonb_build_object(
      'organizationId',e.organization_id,
      'operatingEntityId',e.id,
      'entityDisplayName',e.display_name,
      'countryCode',e.country_code,
      'providerConnectionId',c.id,
      'providerAccountReference',case when c.provider_account_id is null then null else 'acct_••••'||right(c.provider_account_id,4) end,
      'status',coalesce(c.status,'not_connected'),
      'chargesEnabled',coalesce(c.charges_enabled,false),
      'payoutsEnabled',coalesce(c.payouts_enabled,false),
      'capabilities',coalesce(c.capabilities,'{}'::jsonb),
      'requirements',coalesce(c.requirements,'{}'::jsonb),
      'updatedAt',c.updated_at
    ) order by e.display_name),'[]'::jsonb)
  )
  from public.operating_entities e
  left join public.provider_connections c
    on c.organization_id=e.organization_id
    and c.operating_entity_id=e.id
    and c.provider_code='stripe'
  where e.status in ('draft','active')
    and (select private.has_org_permission(e.organization_id,'organization.manage'));
$$;

revoke all on function public.prepare_stripe_onboarding_link(uuid,uuid,text,text,text) from public,anon,service_role;
grant execute on function public.prepare_stripe_onboarding_link(uuid,uuid,text,text,text) to authenticated;
revoke all on function public.complete_stripe_onboarding_link(uuid,text,uuid,uuid,text,jsonb,jsonb,boolean,boolean,text,timestamptz,text,text,text) from public,anon,authenticated;
grant execute on function public.complete_stripe_onboarding_link(uuid,text,uuid,uuid,text,jsonb,jsonb,boolean,boolean,text,timestamptz,text,text,text) to service_role;
revoke all on function public.get_payment_connection_settings() from public,anon,service_role;
grant execute on function public.get_payment_connection_settings() to authenticated;

commit;
