begin;

create table private.rental_application_recovery_attempts (
  application_contact_hash text not null check (application_contact_hash ~ '^[0-9a-f]{64}$'),
  operation_key uuid not null,
  network_hash text check (network_hash ~ '^[0-9a-f]{64}$'),
  attempted_at timestamptz not null default now(),
  primary key (application_contact_hash,operation_key)
);
create index rental_application_recovery_attempt_contact_idx
  on private.rental_application_recovery_attempts(application_contact_hash,attempted_at desc);
create index rental_application_recovery_attempt_network_idx
  on private.rental_application_recovery_attempts(network_hash,attempted_at desc) where network_hash is not null;
create index rental_application_recovery_attempt_age_idx
  on private.rental_application_recovery_attempts(attempted_at);

create table private.rental_application_recovery_challenges (
  application_id uuid primary key,
  organization_id uuid not null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  notification_job_id uuid not null references private.notification_jobs(id) on delete restrict,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (organization_id,application_id) references public.rental_applications(organization_id,id) on delete cascade,
  check (expires_at>created_at),
  check (consumed_at is null or consumed_at>=created_at)
);

alter table private.rental_application_recovery_attempts enable row level security;
alter table private.rental_application_recovery_challenges enable row level security;
revoke all on private.rental_application_recovery_attempts,private.rental_application_recovery_challenges
  from public,anon,authenticated,service_role;

create or replace function private.scrub_rental_application_verification_token()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.template_code in ('rental_application_verification','rental_application_recovery')
    and new.status in ('sent','dead_letter','canceled') then
    new.payload:=new.payload-'verificationToken';
  end if;
  return new;
end; $$;

create function public.request_rental_application_recovery(
  p_reference text,p_email text,p_application_contact_hash text,p_network_hash text,p_operation_key uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_email text:=lower(trim(coalesce(p_email,'')));
  v_application public.rental_applications%rowtype;
  v_previous private.rental_application_recovery_challenges%rowtype;
  v_locale text;
  v_raw_token text;
  v_job_id uuid;
  v_expires_at timestamptz:=now()+interval '30 minutes';
  v_accepted constant jsonb:='{"accepted":true}'::jsonb;
begin
  if coalesce(p_reference,'') !~ '^APP-[0-9A-F]{12}$' or length(v_email) not between 3 and 320
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or coalesce(p_application_contact_hash,'') !~ '^[0-9a-f]{64}$'
    or (p_network_hash is not null and p_network_hash !~ '^[0-9a-f]{64}$') or p_operation_key is null then
    return v_accepted;
  end if;

  with aged as (
    select a.application_contact_hash,a.operation_key from private.rental_application_recovery_attempts a
    where a.attempted_at<now()-interval '48 hours' order by a.attempted_at limit 100 for update skip locked
  ) delete from private.rental_application_recovery_attempts a
    using aged where a.application_contact_hash=aged.application_contact_hash and a.operation_key=aged.operation_key;

  -- Take these locks before counting so the budgets apply across concurrent requests.
  perform pg_advisory_xact_lock(hashtextextended('rental-application-recovery-contact|'||p_application_contact_hash,0));
  if p_network_hash is not null then
    perform pg_advisory_xact_lock(hashtextextended('rental-application-recovery-network|'||p_network_hash,0));
  end if;
  if exists(select 1 from private.rental_application_recovery_attempts a
      where a.application_contact_hash=p_application_contact_hash and a.operation_key=p_operation_key)
    or (select count(*) from private.rental_application_recovery_attempts a
      where a.application_contact_hash=p_application_contact_hash and a.attempted_at>=now()-interval '24 hours')>=3
    or (p_network_hash is not null and (select count(*) from private.rental_application_recovery_attempts a
      where a.network_hash=p_network_hash and a.attempted_at>=now()-interval '1 hour')>=20) then
    return v_accepted;
  end if;

  insert into private.rental_application_recovery_attempts(application_contact_hash,operation_key,network_hash)
    values(p_application_contact_hash,p_operation_key,p_network_hash);

  select a.* into v_application from public.rental_applications a
    join public.organizations o on o.id=a.organization_id
    where a.public_reference=p_reference and lower(a.email::text)=v_email
      and a.verified_at is not null and a.status in ('submitted','lease_preparation')
      and o.status not in ('closing','closed') for update of a;
  if not found then return v_accepted; end if;

  select * into v_previous from private.rental_application_recovery_challenges c
    where c.application_id=v_application.id;
  if found and v_previous.consumed_at is null and v_previous.expires_at>now()
    and v_previous.created_at>now()-interval '2 minutes' then return v_accepted; end if;

  select o.default_locale into v_locale from public.organizations o where o.id=v_application.organization_id;
  v_raw_token:=encode(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')),'hex');
  insert into private.notification_jobs(
    organization_id,template_code,locale,channel,recipient_address,payload,idempotency_key
  ) values (v_application.organization_id,'rental_application_recovery',v_locale,'email',v_application.email,
    jsonb_build_object('applicationReference',v_application.public_reference,
      'verificationToken',v_raw_token,'expiresAt',v_expires_at),
    'rental-application-recovery:'||gen_random_uuid()::text
  ) returning id into v_job_id;
  insert into private.rental_application_recovery_challenges(
    application_id,organization_id,token_hash,notification_job_id,expires_at
  ) values (v_application.id,v_application.organization_id,
    encode(sha256(convert_to(v_raw_token,'UTF8')),'hex'),v_job_id,v_expires_at)
  on conflict(application_id) do update set token_hash=excluded.token_hash,
    notification_job_id=excluded.notification_job_id,expires_at=excluded.expires_at,
    consumed_at=null,created_at=excluded.created_at;
  update private.notification_jobs set status='canceled',last_error='RECOVERY_SUPERSEDED'
    where id=v_previous.notification_job_id and status in ('queued','failed');
  return v_accepted;
end; $$;
revoke all on function public.request_rental_application_recovery(text,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.request_rental_application_recovery(text,text,text,text,uuid) to service_role;

create function public.confirm_rental_application_recovery(p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_token text:=lower(trim(coalesce(p_token,'')));
  v_hash text;
  v_challenge private.rental_application_recovery_challenges%rowtype;
  v_application public.rental_applications%rowtype;
  v_access_token text;
  v_invalid constant jsonb:='{"verified":false}'::jsonb;
begin
  if v_token !~ '^[0-9a-f]{64}$' then return v_invalid; end if;
  v_hash:=encode(sha256(convert_to(v_token,'UTF8')),'hex');
  select * into v_challenge from private.rental_application_recovery_challenges c where c.token_hash=v_hash;
  if not found or v_challenge.consumed_at is not null or v_challenge.expires_at<=clock_timestamp() then return v_invalid; end if;

  -- Withdrawal locks the access row before locking the application. Match that order.
  perform 1 from private.rental_application_access x where x.application_id=v_challenge.application_id for update;
  select a.* into v_application from public.rental_applications a
    join public.organizations o on o.id=a.organization_id
    where a.id=v_challenge.application_id and a.organization_id=v_challenge.organization_id
      and a.verified_at is not null and a.status in ('submitted','lease_preparation')
      and o.status not in ('closing','closed') for update of a;
  if not found then return v_invalid; end if;
  update private.rental_application_recovery_challenges c set consumed_at=clock_timestamp()
    where c.token_hash=v_hash and c.application_id=v_application.id
      and c.consumed_at is null and c.expires_at>clock_timestamp() returning * into v_challenge;
  if not found then return v_invalid; end if;

  v_access_token:=encode(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')),'hex');
  insert into private.rental_application_access(application_id,organization_id,token_hash,expires_at)
    values(v_application.id,v_application.organization_id,
      encode(sha256(convert_to(v_access_token,'UTF8')),'hex'),now()+interval '30 days')
    on conflict(application_id) do update set token_hash=excluded.token_hash,
      expires_at=excluded.expires_at,updated_at=now();
  update private.notification_jobs set status='canceled',last_error='RECOVERY_LINK_USED'
    where id=v_challenge.notification_job_id and status in ('queued','failed');

  insert into audit.audit_events(organization_id,actor_type,action_code,resource_type,resource_id,correlation_id)
    values(v_application.organization_id,'system','rental_application.access_recovered',
      'rental_application',v_application.id,gen_random_uuid());
  return jsonb_build_object('verified',true,'applicationReference',v_application.public_reference,'accessToken',v_access_token);
end; $$;
revoke all on function public.confirm_rental_application_recovery(text) from public,anon,authenticated;
grant execute on function public.confirm_rental_application_recovery(text) to service_role;

create function private.cancel_terminal_rental_application_recovery()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  update private.notification_jobs j set status='canceled',last_error='RECOVERY_APPLICATION_TERMINAL'
    where j.id=(select c.notification_job_id from private.rental_application_recovery_challenges c
      where c.application_id=new.id and c.organization_id=new.organization_id)
      and j.status in ('queued','failed');
  return new;
end; $$;
revoke all on function private.cancel_terminal_rental_application_recovery() from public,anon,authenticated,service_role;
create trigger cancel_terminal_rental_application_recovery
after update of status on public.rental_applications
for each row when (old.status in ('submitted','lease_preparation') and new.status not in ('submitted','lease_preparation'))
execute function private.cancel_terminal_rental_application_recovery();

commit;
