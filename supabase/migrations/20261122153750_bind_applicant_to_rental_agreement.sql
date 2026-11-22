begin;

create table private.rental_agreement_application_links (
  agreement_id uuid primary key references private.rental_agreements(id) on delete restrict,
  organization_id uuid not null,
  application_id uuid not null,
  -- A withdrawn or closed application deletes its draft. Keep the setup ID as evidence.
  setup_id uuid not null,
  application_version integer not null check (application_version>0),
  foreign key (organization_id,application_id)
    references public.rental_applications(organization_id,id) on delete restrict
);
alter table private.rental_agreement_application_links enable row level security;
create index rental_agreement_application_links_setup_idx on private.rental_agreement_application_links(setup_id);
create index rental_agreement_application_links_application_idx
  on private.rental_agreement_application_links(organization_id,application_id);
revoke all on table private.rental_agreement_application_links from public,anon,authenticated,service_role;

create function private.require_application_signing_setup(p_organization_id uuid,p_application_id uuid)
returns private.homeowner_lease_setups
language plpgsql stable set search_path = ''
as $$
declare
  v_setup private.homeowner_lease_setups%rowtype;
  v_actor uuid := auth.uid();
begin
  select s.* into v_setup
    from private.homeowner_lease_setups s join public.rental_applications a
      on a.id=s.source_rental_application_id and a.organization_id=s.organization_id and a.unit_id=s.unit_id
   where s.organization_id=p_organization_id and a.id=p_application_id
     and s.actor_user_id=v_actor and s.status='draft'
     and a.status='lease_preparation' and a.verified_at is not null
     and private.can_manage_rental_agreement(a.organization_id,a.property_id)
     and private.is_agreement_actor_verified(v_actor)
     and exists (select 1 from public.organization_memberships m
       where m.organization_id=a.organization_id and m.user_id=v_actor and m.status='active'
         and m.role_code='org_owner' and m.starts_at<=now() and (m.ends_at is null or m.ends_at>now()));
  if not found then raise exception using errcode='42501',message='APPLICATION_SIGNING_SETUP_UNAVAILABLE'; end if;
  return v_setup;
end;
$$;
revoke all on function private.require_application_signing_setup(uuid,uuid) from public,anon,authenticated,service_role;

create function public.get_rental_application_signing_setup(p_organization_id uuid,p_application_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_setup private.homeowner_lease_setups%rowtype;
  v_app public.rental_applications%rowtype;
begin
  perform private.enter_organization_context(p_organization_id);
  v_setup := private.require_application_signing_setup(p_organization_id,p_application_id);
  select * into strict v_app from public.rental_applications a where a.id=p_application_id;
  return jsonb_build_object('applicationId',v_app.id,'applicationVersion',v_app.version,
    'setupId',v_setup.id,'unitId',v_app.unit_id,'name',concat_ws(' ',v_app.first_name,v_app.last_name),
    'email',v_app.email::text,'agreementId',(
      select a.id from private.rental_agreement_application_links l
      join private.rental_agreements a on a.id=l.agreement_id
      where l.setup_id=v_setup.id and (a.status='executed' or (a.status='open' and a.expires_at>now()))
      order by a.issued_at desc limit 1
    ));
end;
$$;
revoke all on function public.get_rental_application_signing_setup(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_rental_application_signing_setup(uuid,uuid) to authenticated;

create function public.issue_rental_application_agreement(
  p_organization_id uuid,p_application_id uuid,p_setup_id uuid,p_expected_application_version integer,
  p_agreement_id uuid,p_document_version_id uuid,p_valid_days integer,p_landlord_authority_confirmed boolean
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_setup private.homeowner_lease_setups%rowtype;
  v_app public.rental_applications%rowtype;
  v_existing private.rental_agreement_application_links%rowtype;
  v_receipt jsonb;
begin
  perform private.enter_organization_context(p_organization_id);
  if coalesce(auth.jwt()->>'aal','aal1')<>'aal2' then
    raise exception using errcode='42501',message='MFA_REQUIRED';
  end if;
  if p_agreement_id is null or p_setup_id is null or coalesce(p_expected_application_version,0)<1 then
    raise exception using errcode='22023',message='INVALID_APPLICATION_SIGNING_SETUP';
  end if;

  -- The same unit-first lock order as preparation, withdrawal, closure and activation.
  v_setup := private.require_application_signing_setup(p_organization_id,p_application_id);
  perform 1 from public.units u where u.id=v_setup.unit_id and u.organization_id=p_organization_id for update;
  select * into strict v_app from public.rental_applications a where a.id=p_application_id for update;
  v_setup := private.require_application_signing_setup(p_organization_id,p_application_id);
  if v_setup.id<>p_setup_id or v_app.version<>p_expected_application_version then
    raise exception using errcode='40001',message='APPLICATION_SIGNING_SETUP_CHANGED';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('rental-agreement-issue:'||p_agreement_id::text,0));
  select * into v_existing from private.rental_agreement_application_links where agreement_id=p_agreement_id;
  if found then
    if v_existing.organization_id<>p_organization_id or v_existing.application_id<>p_application_id
      or v_existing.setup_id<>p_setup_id or v_existing.application_version<>p_expected_application_version then
      raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT';
    end if;
  elsif exists (select 1 from private.rental_agreements a where a.id=p_agreement_id) then
    raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT';
  elsif exists (
    select 1 from private.rental_agreement_application_links l join private.rental_agreements a on a.id=l.agreement_id
    where l.setup_id=p_setup_id and (a.status='executed' or (a.status='open' and a.expires_at>now()))
  ) then raise exception using errcode='23505',message='APPLICATION_AGREEMENT_ALREADY_OPEN';
  end if;

  v_receipt := public.issue_rental_agreement(p_organization_id,p_agreement_id,v_app.unit_id,p_document_version_id,
    array[lower(trim(v_app.email::text))],p_valid_days,p_landlord_authority_confirmed);
  if v_existing.agreement_id is null then
    insert into private.rental_agreement_application_links (
      agreement_id,organization_id,application_id,setup_id,application_version
    ) values (p_agreement_id,p_organization_id,p_application_id,p_setup_id,p_expected_application_version);
    insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
      values (p_organization_id,auth.uid(),'user','rental_agreement.application_linked','rental_agreement',p_agreement_id,p_agreement_id,
        jsonb_build_object('applicationId',p_application_id,'setupId',p_setup_id,'unitId',v_app.unit_id));
    insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
      values (p_organization_id,'rental_agreement.application_linked','rental_agreement',p_agreement_id,p_agreement_id,
        jsonb_build_object('agreementId',p_agreement_id,'applicationId',p_application_id,'setupId',p_setup_id,'unitId',v_app.unit_id));
  end if;
  return v_receipt;
end;
$$;
revoke all on function public.issue_rental_application_agreement(uuid,uuid,uuid,integer,uuid,uuid,integer,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.issue_rental_application_agreement(uuid,uuid,uuid,integer,uuid,uuid,integer,boolean)
  to authenticated;

-- The existing close and withdrawal commands already hold the unit and application locks.
-- Their outcome serializes with signers through the agreement row, preserving executed history.
create function private.revoke_closed_application_agreements()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  with voided as (
    update private.rental_agreements a set status='void',closed_at=clock_timestamp(),closed_by=auth.uid()
    from private.rental_agreement_application_links l
    where l.agreement_id=a.id and l.organization_id=new.organization_id and l.application_id=new.id and a.status='open'
    returning a.id
  ), audited as (
    insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
      select new.organization_id,auth.uid(),case when auth.uid() is null then 'system' else 'user' end,
        'rental_agreement.void','rental_agreement',id,id,jsonb_build_object('status','void','applicationStatus',new.status)
      from voided returning resource_id
  )
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
    select new.organization_id,'rental_agreement.void','rental_agreement',resource_id,resource_id,
      jsonb_build_object('agreementId',resource_id,'status','void') from audited;
  return new;
end;
$$;
revoke all on function private.revoke_closed_application_agreements() from public,anon,authenticated,service_role;
create trigger revoke_closed_application_agreements after update of status on public.rental_applications
  for each row when (old.status is distinct from new.status and new.status in ('closed','withdrawn'))
  execute function private.revoke_closed_application_agreements();

-- Attachments and setup receipts are written in the same activation transaction in this order.
-- The deferred checks validate both directions after all existing writes and conversion complete.
create function private.require_exact_linked_application_agreement()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from private.rental_agreement_application_links l where l.setup_id=new.id)
    and not exists (
      select 1 from private.rental_agreement_application_links l
      join private.rental_agreements a on a.id=l.agreement_id and a.organization_id=l.organization_id
      join private.rental_agreement_filings f on f.agreement_id=a.id and f.organization_id=a.organization_id
      where l.setup_id=new.id and l.organization_id=new.organization_id
        and l.application_id=new.source_rental_application_id and a.unit_id=new.unit_id
        and a.status='executed' and a.source_version_id::text=new.result->>'documentVersionId'
        and f.tenancy_id::text=new.result->>'tenancyId'
    ) then raise exception using errcode='23514',message='APPLICATION_AGREEMENT_REQUIRED';
  end if;
  return new;
end;
$$;
revoke all on function private.require_exact_linked_application_agreement() from public,anon,authenticated,service_role;
create constraint trigger require_exact_linked_application_agreement
  after update of status,result on private.homeowner_lease_setups deferrable initially deferred
  for each row when (new.status='activated' and old.status<>'activated')
  execute function private.require_exact_linked_application_agreement();

create function private.require_linked_agreement_activation()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from private.rental_agreement_application_links l where l.agreement_id=new.agreement_id)
    and not exists (
      select 1 from private.rental_agreement_application_links l
      join private.rental_agreements a on a.id=l.agreement_id and a.organization_id=l.organization_id
      join private.homeowner_lease_setups s on s.id=l.setup_id and s.source_rental_application_id=l.application_id
      join public.rental_applications app on app.id=l.application_id and app.organization_id=l.organization_id
      where l.agreement_id=new.agreement_id and l.organization_id=new.organization_id
        and s.organization_id=l.organization_id and s.unit_id=a.unit_id and s.status='activated'
        and app.unit_id=a.unit_id and app.status='converted' and app.converted_tenancy_id=new.tenancy_id
        and a.source_version_id::text=s.result->>'documentVersionId' and new.tenancy_id::text=s.result->>'tenancyId'
    ) then raise exception using errcode='23514',message='AGREEMENT_APPLICATION_SETUP_REQUIRED';
  end if;
  return new;
end;
$$;
revoke all on function private.require_linked_agreement_activation() from public,anon,authenticated,service_role;
create constraint trigger require_linked_agreement_activation
  after update of tenancy_id on private.rental_agreement_filings deferrable initially deferred
  for each row when (new.tenancy_id is not null and old.tenancy_id is distinct from new.tenancy_id)
  execute function private.require_linked_agreement_activation();

create or replace function public.get_rental_agreement_filing(p_organization_id uuid,p_agreement_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_agreement private.rental_agreements%rowtype;
  v_filing private.rental_agreement_filings%rowtype;
  v_link private.rental_agreement_application_links%rowtype;
  v_active_setup uuid;
begin
  if p_organization_id is null then raise exception using errcode='42501',message='AGREEMENT_FORBIDDEN'; end if;
  v_agreement := private.agreement_visible_to_actor(p_agreement_id,p_organization_id);
  select * into v_filing from private.rental_agreement_filings f where f.agreement_id=v_agreement.id;
  select * into v_link from private.rental_agreement_application_links l where l.agreement_id=v_agreement.id;
  select s.id into v_active_setup from private.homeowner_lease_setups s
    where s.id=v_link.setup_id and s.actor_user_id=auth.uid() and s.status='draft';
  return jsonb_build_object('agreementId',p_agreement_id,'propertyId',v_agreement.property_id,'unitId',v_agreement.unit_id,
    'documentId',v_filing.document_id,'tenancyId',v_filing.tenancy_id,
    'applicationId',v_link.application_id,'applicationSetupId',v_active_setup);
end;
$$;

commit;
