-- FD-HR-002–005 / B4: verified minimal rental applications and explicit application -> lease conversion.
-- No screening, scoring, ranking, automated eligibility, native applicant e-sign, or marketplace discovery.
begin;

create table public.rental_applications (
  id uuid primary key default gen_random_uuid(),
  public_reference text not null unique,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  listing_id uuid not null,
  property_id uuid not null references public.properties(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  first_name text not null check (length(trim(first_name)) between 1 and 80),
  last_name text not null check (length(trim(last_name)) between 1 and 80),
  email citext not null check (length(trim(email::text)) between 3 and 320),
  desired_move_in_on date not null,
  lease_term_text text not null default '' check (length(lease_term_text)<=300),
  applicant_note text not null default '' check (length(applicant_note)<=2000),
  listing_title_snapshot text not null check (length(trim(listing_title_snapshot)) between 1 and 160),
  listing_rent_amount_minor bigint not null check (listing_rent_amount_minor>=0 and listing_rent_amount_minor<=9007199254740991),
  currency_code char(3) not null check (currency_code in ('USD','CAD','MXN')),
  listing_available_on date not null,
  source text not null default 'shared_link' check (source='shared_link'),
  status text not null default 'pending_verification'
    check (status in ('pending_verification','submitted','lease_preparation','withdrawn','closed','expired','converted')),
  verified_at timestamptz,
  lease_prepared_at timestamptz,
  withdrawn_at timestamptz,
  closed_at timestamptz,
  converted_at timestamptz,
  converted_household_id uuid references public.households(id) on delete restrict,
  converted_tenancy_id uuid references public.tenancies(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version>0),
  unique (organization_id,id),
  foreign key (organization_id,listing_id) references public.rental_listings(organization_id,id) on delete restrict,
  foreign key (organization_id,property_id) references public.properties(organization_id,id) on delete restrict,
  foreign key (organization_id,property_id,unit_id) references public.units(organization_id,property_id,id) on delete restrict
);
alter table public.rental_applications add constraint rental_applications_state_consistent check (
  (status='pending_verification' and verified_at is null and lease_prepared_at is null and withdrawn_at is null and closed_at is null and converted_at is null)
  or (status='submitted' and verified_at is not null and lease_prepared_at is null and withdrawn_at is null and closed_at is null and converted_at is null)
  or (status='lease_preparation' and verified_at is not null and lease_prepared_at is not null and withdrawn_at is null and closed_at is null and converted_at is null)
  or (status='withdrawn' and verified_at is not null and withdrawn_at is not null and closed_at is null and converted_at is null)
  or (status='closed' and verified_at is not null and closed_at is not null and converted_at is null)
  or (status='expired' and verified_at is null and converted_at is null)
  or (status='converted' and verified_at is not null and lease_prepared_at is not null and converted_at is not null
      and converted_household_id is not null and converted_tenancy_id is not null)
);
create index rental_applications_unit_status_idx
  on public.rental_applications(organization_id,unit_id,status,created_at desc);
create index rental_applications_listing_email_idx
  on public.rental_applications(listing_id,email,created_at desc);
create unique index rental_applications_one_preparation_per_unit
  on public.rental_applications(organization_id,unit_id) where status='lease_preparation';

create table private.rental_application_verifications (
  application_id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  notification_job_id uuid references private.notification_jobs(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (organization_id,application_id) references public.rental_applications(organization_id,id) on delete cascade,
  check (expires_at>created_at),
  check (consumed_at is null or consumed_at>=created_at)
);
create index rental_application_verifications_expiry_idx
  on private.rental_application_verifications(expires_at) where consumed_at is null;
create table private.rental_application_access (
  application_id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id,application_id) references public.rental_applications(organization_id,id) on delete cascade,
  check (expires_at>created_at)
);
create index rental_application_access_expiry_idx on private.rental_application_access(expires_at);

create table private.rental_application_attempts (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.rental_listings(id) on delete cascade,
  email_hash text not null check (email_hash ~ '^[0-9a-f]{64}$'),
  network_hash text check (network_hash is null or network_hash ~ '^[0-9a-f]{64}$'),
  attempted_at timestamptz not null default now()
);
create index rental_application_attempts_email_idx
  on private.rental_application_attempts(listing_id,email_hash,attempted_at desc);
create index rental_application_attempts_network_idx
  on private.rental_application_attempts(network_hash,attempted_at desc) where network_hash is not null;

-- Submission receipts are not permanent audit evidence; index the bounded age sweep.
create index rental_application_attempts_age_idx
  on private.rental_application_attempts(attempted_at);

alter table private.homeowner_lease_setups
  add column source_rental_application_id uuid references public.rental_applications(id) on delete restrict;
create index homeowner_lease_setups_source_application_idx
  on private.homeowner_lease_setups(source_rental_application_id) where source_rental_application_id is not null;

alter table public.rental_applications enable row level security;
create policy rental_applications_verified_operator_read on public.rental_applications
for select to authenticated using (
  status not in ('pending_verification','expired') and (
    private.has_property_access(property_id,'lease.manage')
    or private.has_property_access(property_id,'property.manage')
  )
);
grant select on public.rental_applications to authenticated;
revoke insert,update,delete on public.rental_applications from anon,authenticated;
revoke all on public.rental_applications from anon;
revoke all on private.rental_application_verifications,private.rental_application_access,private.rental_application_attempts
  from public,anon,authenticated,service_role;
create unique index homeowner_lease_setups_source_application_unique
  on private.homeowner_lease_setups(source_rental_application_id) where source_rental_application_id is not null;

create or replace function public.submit_public_rental_application(
  p_public_id uuid, p_first_name text, p_last_name text, p_email text,
  p_desired_move_in_on date, p_lease_term_text text, p_applicant_note text,
  p_network_hash text, p_locale text, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_listing public.rental_listings%rowtype;
  v_property public.properties%rowtype;
  v_first text:=trim(coalesce(p_first_name,''));
  v_last text:=trim(coalesce(p_last_name,''));
  v_email text:=lower(trim(coalesce(p_email,'')));
  v_term text:=trim(coalesce(p_lease_term_text,''));
  v_note text:=trim(coalesce(p_applicant_note,''));
  v_email_hash text; v_actor_scope text; v_request_hash text; v_storage_key text;
  v_previous private.idempotency_records%rowtype;
  v_existing public.rental_applications%rowtype;
  v_application_id uuid:=gen_random_uuid(); v_reference text;
  v_raw_token text; v_token_hash text; v_expires_at timestamptz:=now()+interval '60 minutes';
  v_job_id uuid; v_corr uuid:=gen_random_uuid();
  v_response jsonb:=jsonb_build_object('accepted',true);
  v_local_day date;
begin
  if p_public_id is null then raise exception using errcode='22023',message='LISTING_REQUIRED'; end if;
  if length(v_first) not between 1 and 80 or length(v_last) not between 1 and 80 then
    raise exception using errcode='22023',message='INVALID_APPLICANT_NAME';
  end if;  if length(v_email) not between 3 and 320
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception using errcode='22023',message='INVALID_APPLICANT_EMAIL';
  end if;
  if length(v_term)>300 or length(v_note)>2000 then
    raise exception using errcode='22023',message='INVALID_APPLICATION_TEXT';
  end if;
  if p_network_hash is not null and p_network_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='22023',message='INVALID_NETWORK_HASH';
  end if;
  if p_locale not in ('en-US','en-CA','es-MX','fr-CA') then
    raise exception using errcode='22023',message='INVALID_APPLICATION_LOCALE';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 200 then
    raise exception using errcode='22023',message='INVALID_IDEMPOTENCY_KEY';
  end if;

  select * into v_listing from public.rental_listings l
  where l.public_id=p_public_id and l.status='published' and l.visibility='unlisted' for share;
  if not found then raise exception using errcode='P0002',message='LISTING_NOT_AVAILABLE'; end if;
  select * into v_property from public.properties p
  where p.id=v_listing.property_id and p.organization_id=v_listing.organization_id;
  if not found then raise exception using errcode='P0002',message='PROPERTY_NOT_FOUND'; end if;
  v_local_day:=(now() at time zone v_property.time_zone)::date;
  if p_desired_move_in_on is null or p_desired_move_in_on<=v_local_day
    or p_desired_move_in_on<v_listing.available_on
    or p_desired_move_in_on>v_local_day+365 then
    raise exception using errcode='22023',message='INVALID_DESIRED_MOVE_IN_DATE';
  end if;
  v_email_hash:=encode(sha256(convert_to(v_email,'UTF8')),'hex');
  v_actor_scope:='public-application:'||p_public_id::text||':'||substr(v_email_hash,1,32);
  v_request_hash:=encode(sha256(convert_to(jsonb_build_object(
    'publicId',p_public_id,'firstName',v_first,'lastName',v_last,'email',v_email,
    'desiredMoveInOn',p_desired_move_in_on,'leaseTermText',v_term,'applicantNote',v_note,'locale',p_locale
  )::text,'UTF8')),'hex');
  v_storage_key:=encode(sha256(convert_to(v_actor_scope||'|'||trim(p_idempotency_key),'UTF8')),'hex');

  -- Retain more than the 24-hour email budget but prevent indefinite
  -- accumulation of pseudonymous applicant/network attempt signals.
  -- A bounded SKIP LOCKED pass avoids cross-listing lock contention.
  with aged as (
    select a.id from private.rental_application_attempts a
    where a.attempted_at < now()-interval '48 hours'
    order by a.attempted_at
    limit 100
    for update skip locked
  )
  delete from private.rental_application_attempts a
    using aged e where a.id=e.id;

  perform pg_advisory_xact_lock(hashtextextended('rental-application|'||v_listing.id::text,0));
  -- The per-network limit spans listings: serialize its count/insert across
  -- different listings, not merely submissions to the same listing.
  -- Lock order is always listing first, network second.
  if p_network_hash is not null then
    perform pg_advisory_xact_lock(hashtextextended('rental-application-network|'||p_network_hash,0));
  end if;
  select * into v_previous from private.idempotency_records r
  where r.organization_id=v_listing.organization_id and r.actor_scope=v_actor_scope
    and r.route='SubmitPublicRentalApplication' and r.idempotency_key=v_storage_key;
  if found then
    if v_previous.request_hash<>v_request_hash then
      raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT';
    end if;
    if v_previous.state='completed' then return v_previous.response_body; end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;
  insert into private.idempotency_records(
    organization_id,actor_scope,route,idempotency_key,request_hash,expires_at
  ) values (v_listing.organization_id,v_actor_scope,'SubmitPublicRentalApplication',
    v_storage_key,v_request_hash,now()+interval '24 hours');
  if (select count(*) from private.rental_application_attempts a
      where a.listing_id=v_listing.id and a.email_hash=v_email_hash
        and a.attempted_at>=now()-interval '24 hours')>=3 then
    insert into private.rental_application_attempts(listing_id,email_hash,network_hash)
      values(v_listing.id,v_email_hash,p_network_hash);
    update private.idempotency_records r set state='completed',response_status=202,
      response_body=v_response,completed_at=now()
    where r.organization_id=v_listing.organization_id and r.actor_scope=v_actor_scope
      and r.route='SubmitPublicRentalApplication' and r.idempotency_key=v_storage_key;
    return v_response;
  end if;
  if p_network_hash is not null and (select count(*) from private.rental_application_attempts a
      where a.network_hash=p_network_hash and a.attempted_at>=now()-interval '1 hour')>=20 then
    insert into private.rental_application_attempts(listing_id,email_hash,network_hash)
      values(v_listing.id,v_email_hash,p_network_hash);
    update private.idempotency_records r set state='completed',response_status=202,
      response_body=v_response,completed_at=now()
    where r.organization_id=v_listing.organization_id and r.actor_scope=v_actor_scope
      and r.route='SubmitPublicRentalApplication' and r.idempotency_key=v_storage_key;
    return v_response;
  end if;
  insert into private.rental_application_attempts(listing_id,email_hash,network_hash)
    values(v_listing.id,v_email_hash,p_network_hash);

  select * into v_existing from public.rental_applications a
  where a.listing_id=v_listing.id and lower(a.email::text)=v_email
    and a.status in ('pending_verification','submitted','lease_preparation','converted')
  order by a.created_at desc limit 1 for update;  if found then
    if v_existing.status='pending_verification' and exists(
      select 1 from private.rental_application_verifications v
      where v.application_id=v_existing.id and v.expires_at<=now()
    ) then
      update public.rental_applications set status='expired',updated_at=now(),version=version+1
        where id=v_existing.id;
      update private.rental_application_verifications set consumed_at=coalesce(consumed_at,now())
        where application_id=v_existing.id;
      -- A newly submitted application must never leave the expired link queued for delivery.
      update private.notification_jobs
        set status='canceled',last_error='VERIFICATION_EXPIRED'
        where id=(select notification_job_id from private.rental_application_verifications
                  where application_id=v_existing.id)
          and status in ('queued','failed');
    else
      update private.idempotency_records r set state='completed',response_status=202,
        response_body=v_response,resource_type='rental_application',resource_id=v_existing.id,completed_at=now()
      where r.organization_id=v_listing.organization_id and r.actor_scope=v_actor_scope
        and r.route='SubmitPublicRentalApplication' and r.idempotency_key=v_storage_key;
      return v_response;
    end if;
  end if;

  v_reference:='APP-'||upper(substr(replace(v_application_id::text,'-',''),1,12));
  v_raw_token:=encode(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')),'hex');
  v_token_hash:=encode(sha256(convert_to(v_raw_token,'UTF8')),'hex');
  insert into public.rental_applications(
    id,public_reference,organization_id,listing_id,property_id,unit_id,
    first_name,last_name,email,desired_move_in_on,lease_term_text,applicant_note,
    listing_title_snapshot,listing_rent_amount_minor,currency_code,listing_available_on
  ) values (v_application_id,v_reference,v_listing.organization_id,v_listing.id,
    v_listing.property_id,v_listing.unit_id,v_first,v_last,v_email,p_desired_move_in_on,
    v_term,v_note,v_listing.title,v_listing.rent_amount_minor,v_listing.currency_code,v_listing.available_on);
  insert into private.rental_application_verifications(
    application_id,organization_id,token_hash,expires_at
  ) values (v_application_id,v_listing.organization_id,v_token_hash,v_expires_at);
  insert into private.notification_jobs(
    organization_id,template_code,locale,channel,recipient_address,payload,idempotency_key
  ) values (v_listing.organization_id,'rental_application_verification',p_locale,'email',v_email,
    jsonb_build_object(
      'applicationReference',v_reference,'listingTitle',v_listing.title,
      'verificationToken',v_raw_token,'expiresAt',v_expires_at
    ),'rental-application-verification:'||v_application_id::text
  ) returning id into v_job_id;
  update private.rental_application_verifications set notification_job_id=v_job_id
    where application_id=v_application_id;

  insert into audit.audit_events(
    organization_id,actor_type,action_code,resource_type,resource_id,correlation_id,ip_hash,after_data
  ) values (v_listing.organization_id,'system','rental_application.pending_verification',
    'rental_application',v_application_id,v_corr,p_network_hash,
    jsonb_build_object('listingId',v_listing.id,'unitId',v_listing.unit_id,'source','shared_link'));
  insert into private.outbox_events(
    organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload
  ) values (v_listing.organization_id,'rental_application.pending_verification',
    'rental_application',v_application_id,v_corr,
    jsonb_build_object('applicationId',v_application_id,'listingId',v_listing.id,'unitId',v_listing.unit_id));
  update private.idempotency_records r set state='completed',response_status=202,response_body=v_response,
    resource_type='rental_application',resource_id=v_application_id,completed_at=now()
  where r.organization_id=v_listing.organization_id and r.actor_scope=v_actor_scope
    and r.route='SubmitPublicRentalApplication' and r.idempotency_key=v_storage_key;
  return v_response;
end; $$;revoke all on function public.submit_public_rental_application(
  uuid,text,text,text,date,text,text,text,text,text
) from public,anon,authenticated;
grant execute on function public.submit_public_rental_application(
  uuid,text,text,text,date,text,text,text,text,text
) to service_role;

create or replace function private.scrub_rental_application_verification_token()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.template_code='rental_application_verification'
    and new.status in ('sent','dead_letter','canceled') then
    new.payload:=new.payload-'verificationToken';
  end if;
  return new;
end; $$;
revoke all on function private.scrub_rental_application_verification_token()
  from public,anon,authenticated,service_role;
create trigger scrub_rental_application_verification_token
before insert or update of status on private.notification_jobs
for each row execute function private.scrub_rental_application_verification_token();
create or replace function public.verify_public_rental_application(p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_token text:=lower(trim(coalesce(p_token,''))); v_hash text;
  v_verification private.rental_application_verifications%rowtype;
  v_application public.rental_applications%rowtype;
  v_access_token text; v_access_hash text; v_corr uuid:=gen_random_uuid();
begin
  if v_token !~ '^[0-9a-f]{64}$' then return jsonb_build_object('verified',false); end if;
  v_hash:=encode(sha256(convert_to(v_token,'UTF8')),'hex');
  -- Lock application before verification; expiration/re-submission uses this same
  -- order and can otherwise deadlock an email verification arriving concurrently.
  select * into v_verification from private.rental_application_verifications v
    where v.token_hash=v_hash;
  if not found then return jsonb_build_object('verified',false); end if;
  select * into v_application from public.rental_applications a
    where a.id=v_verification.application_id and a.organization_id=v_verification.organization_id for update;
  if not found then return jsonb_build_object('verified',false); end if;
  -- Re-read after the application lock: a concurrent submission may have expired
  -- and consumed this token while we waited for the application row.
  select * into v_verification from private.rental_application_verifications v
    where v.token_hash=v_hash and v.application_id=v_application.id for update;
  if not found then return jsonb_build_object('verified',false); end if;

  if v_verification.consumed_at is not null then
    if v_application.verified_at is not null and v_application.status not in ('pending_verification','expired') then
      return jsonb_build_object('verified',true,'applicationReference',v_application.public_reference,
        'status',v_application.status);
    end if;
    return jsonb_build_object('verified',false);
  end if;
  if v_verification.expires_at<=now() then
    update private.rental_application_verifications set consumed_at=now() where application_id=v_application.id;
    update private.notification_jobs
      set status='canceled',last_error='VERIFICATION_EXPIRED'
      where id=v_verification.notification_job_id and status in ('queued','failed');
    if v_application.status='pending_verification' then
      update public.rental_applications set status='expired',updated_at=now(),version=version+1
        where id=v_application.id;
    end if;
    return jsonb_build_object('verified',false);
  end if;  if v_application.status<>'pending_verification' then return jsonb_build_object('verified',false); end if;
  update public.rental_applications
    set status='submitted',verified_at=now(),updated_at=now(),version=version+1
    where id=v_application.id returning * into v_application;
  update private.rental_application_verifications set consumed_at=now() where application_id=v_application.id;

  v_access_token:=encode(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')),'hex');
  v_access_hash:=encode(sha256(convert_to(v_access_token,'UTF8')),'hex');
  insert into private.rental_application_access(application_id,organization_id,token_hash,expires_at)
    values(v_application.id,v_application.organization_id,v_access_hash,now()+interval '30 days');

  insert into audit.audit_events(
    organization_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data
  ) values (v_application.organization_id,'system','rental_application.verified',
    'rental_application',v_application.id,v_corr,
    jsonb_build_object('listingId',v_application.listing_id,'unitId',v_application.unit_id,'status','submitted'));
  insert into private.outbox_events(
    organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload
  ) values (v_application.organization_id,'rental_application.verified','rental_application',
    v_application.id,v_corr,jsonb_build_object(
      'applicationId',v_application.id,'listingId',v_application.listing_id,'unitId',v_application.unit_id
    ));
  return jsonb_build_object('verified',true,'applicationReference',v_application.public_reference,
    'status',v_application.status,'accessToken',v_access_token);
end; $$;
revoke all on function public.verify_public_rental_application(text) from public,anon,authenticated;
grant execute on function public.verify_public_rental_application(text) to service_role;
create or replace function public.get_public_rental_application_for_access(p_access_token text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_token text:=lower(trim(coalesce(p_access_token,''))); v_hash text; v_app public.rental_applications%rowtype;
begin
  if v_token !~ '^[0-9a-f]{64}$' then return null; end if;
  v_hash:=encode(sha256(convert_to(v_token,'UTF8')),'hex');
  select a.* into v_app
  from private.rental_application_access x
  join public.rental_applications a on a.id=x.application_id and a.organization_id=x.organization_id
  where x.token_hash=v_hash and x.expires_at>now()
    and a.status in ('submitted','lease_preparation');
  if not found then return null; end if;
  return jsonb_build_object(
    'applicationReference',v_app.public_reference,
    'firstName',v_app.first_name,'lastName',v_app.last_name,'email',v_app.email,
    'desiredMoveInOn',v_app.desired_move_in_on,'leaseTermText',v_app.lease_term_text,
    'applicantNote',v_app.applicant_note,'status',v_app.status,
    'listingTitle',v_app.listing_title_snapshot,'rentAmountMinor',v_app.listing_rent_amount_minor,
    'currencyCode',v_app.currency_code,'listingAvailableOn',v_app.listing_available_on,
    'verifiedAt',v_app.verified_at,'leasePreparedAt',v_app.lease_prepared_at,
    'withdrawnAt',v_app.withdrawn_at,'closedAt',v_app.closed_at,'convertedAt',v_app.converted_at,
    'version',v_app.version
  );
end; $$;
revoke all on function public.get_public_rental_application_for_access(text) from public,anon,authenticated;
grant execute on function public.get_public_rental_application_for_access(text) to service_role;
create or replace function public.withdraw_public_rental_application(
  p_access_token text, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_token text:=lower(trim(coalesce(p_access_token,''))); v_token_hash text;
  v_access private.rental_application_access%rowtype; v_app public.rental_applications%rowtype; v_unit_id uuid;
  v_actor_scope text; v_hash text; v_storage_key text; v_previous private.idempotency_records%rowtype;
  v_corr uuid:=gen_random_uuid(); v_response jsonb;
begin
  if v_token !~ '^[0-9a-f]{64}$' or p_idempotency_key is null
    or length(trim(p_idempotency_key)) not between 8 and 200 then
    raise exception using errcode='22023',message='INVALID_APPLICATION_ACCESS';
  end if;
  v_token_hash:=encode(sha256(convert_to(v_token,'UTF8')),'hex');
  select * into v_access from private.rental_application_access x
    where x.token_hash=v_token_hash and x.expires_at>now() for update;
  if not found then raise exception using errcode='P0002',message='APPLICATION_ACCESS_NOT_FOUND'; end if;
  select unit_id into v_unit_id from public.rental_applications a
    where a.id=v_access.application_id and a.organization_id=v_access.organization_id;
  if not found then raise exception using errcode='P0002',message='APPLICATION_NOT_FOUND'; end if;
  perform 1 from public.units u where u.id=v_unit_id and u.organization_id=v_access.organization_id for update;
  select * into v_app from public.rental_applications a
    where a.id=v_access.application_id and a.organization_id=v_access.organization_id for update;

  v_actor_scope:='application:'||v_app.id::text;
  v_hash:=encode(sha256(convert_to(jsonb_build_object(
    'applicationId',v_app.id,'action','withdraw'
  )::text,'UTF8')),'hex');
  v_storage_key:=encode(sha256(convert_to(v_actor_scope||'|'||trim(p_idempotency_key),'UTF8')),'hex');  perform pg_advisory_xact_lock(hashtextextended(v_actor_scope||'|withdraw',0));
  select * into v_previous from private.idempotency_records r
  where r.organization_id=v_app.organization_id and r.actor_scope=v_actor_scope
    and r.route='WithdrawRentalApplication' and r.idempotency_key=v_storage_key;
  if found then
    if v_previous.request_hash<>v_hash then raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT'; end if;
    if v_previous.state='completed' then return v_previous.response_body; end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;
  if v_app.status not in ('submitted','lease_preparation') then
    raise exception using errcode='23514',message='APPLICATION_NOT_WITHDRAWABLE';
  end if;
  insert into private.idempotency_records(
    organization_id,actor_scope,route,idempotency_key,request_hash,expires_at
  ) values (v_app.organization_id,v_actor_scope,'WithdrawRentalApplication',
    v_storage_key,v_hash,'infinity'::timestamptz);

  if v_app.status='lease_preparation' then
    delete from private.homeowner_lease_setups
      where source_rental_application_id=v_app.id and status='draft';
  end if;
  update public.rental_applications set status='withdrawn',withdrawn_at=now(),
    updated_at=now(),version=version+1 where id=v_app.id returning * into v_app;
  insert into audit.audit_events(
    organization_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data
  ) values (v_app.organization_id,'system','rental_application.withdrawn','rental_application',
    v_app.id,v_corr,jsonb_build_object('listingId',v_app.listing_id,'unitId',v_app.unit_id));  insert into private.outbox_events(
    organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload
  ) values (v_app.organization_id,'rental_application.withdrawn','rental_application',
    v_app.id,v_corr,jsonb_build_object('applicationId',v_app.id,'unitId',v_app.unit_id));
  v_response:=jsonb_build_object(
    'withdrawn',true,'applicationReference',v_app.public_reference,'status',v_app.status,'version',v_app.version
  );
  update private.idempotency_records r set state='completed',response_status=200,
    response_body=v_response,resource_type='rental_application',resource_id=v_app.id,completed_at=now()
  where r.organization_id=v_app.organization_id and r.actor_scope=v_actor_scope
    and r.route='WithdrawRentalApplication' and r.idempotency_key=v_storage_key;
  return v_response;
end; $$;
revoke all on function public.withdraw_public_rental_application(text,text) from public,anon,authenticated;
grant execute on function public.withdraw_public_rental_application(text,text) to service_role;
create or replace function public.prepare_rental_application_lease(
  p_organization_id uuid, p_application_id uuid, p_expected_version integer, p_operation_key uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid(); v_app public.rental_applications%rowtype;
  v_setup private.homeowner_lease_setups%rowtype; v_property_id uuid; v_unit_id uuid;
  v_actor_scope text; v_hash text; v_previous private.idempotency_records%rowtype;
  v_draft jsonb; v_rent_text text; v_setup_id uuid; v_corr uuid:=gen_random_uuid(); v_response jsonb;
begin
  if v_actor is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  if p_expected_version is null or p_expected_version<1 or p_operation_key is null then
    raise exception using errcode='22023',message='INVALID_APPLICATION_PREPARATION';
  end if;
  select unit_id into v_unit_id from public.rental_applications a
    where a.id=p_application_id and a.organization_id=p_organization_id;
  if not found then raise exception using errcode='P0002',message='APPLICATION_NOT_FOUND'; end if;
  perform 1 from public.units u where u.id=v_unit_id and u.organization_id=p_organization_id for update;
  select * into v_app from public.rental_applications a
    where a.id=p_application_id and a.organization_id=p_organization_id for update;
  v_property_id:=private.require_homeowner_lease_scope(p_organization_id,v_app.unit_id);
  if v_property_id<>v_app.property_id then raise exception using errcode='42501',message='APPLICATION_SCOPE_DENIED'; end if;

  v_actor_scope:='user:'||v_actor::text;
  v_hash:=encode(sha256(convert_to(jsonb_build_object(
    'applicationId',p_application_id,'expectedVersion',p_expected_version,'operationKey',p_operation_key
  )::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(
    '|',p_organization_id,v_actor_scope,'PrepareRentalApplicationLease',p_operation_key::text
  ),0));  select * into v_previous from private.idempotency_records r
  where r.organization_id=p_organization_id and r.actor_scope=v_actor_scope
    and r.route='PrepareRentalApplicationLease' and r.idempotency_key=p_operation_key::text;
  if found then
    if v_previous.request_hash<>v_hash then raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT'; end if;
    if v_previous.state='completed' then return v_previous.response_body; end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;
  if v_app.version<>p_expected_version then raise exception using errcode='40001',message='APPLICATION_VERSION_CONFLICT'; end if;
  if v_app.status='lease_preparation' then
    select * into v_setup from private.homeowner_lease_setups s
      where s.source_rental_application_id=v_app.id
        and s.actor_user_id=v_actor and s.status='draft';
    if found then
      return jsonb_build_object('applicationId',v_app.id,'applicationReference',v_app.public_reference,
        'status',v_app.status,'applicationVersion',v_app.version,'setupId',v_setup.id,
        'setupRevision',v_setup.revision,'unitId',v_app.unit_id);
    end if;
    raise exception using errcode='23505',message='APPLICATION_PREPARATION_OWNED_BY_ANOTHER_ACTOR';
  end if;
  if v_app.status<>'submitted' then
    raise exception using errcode='23514',message='APPLICATION_NOT_READY_FOR_LEASE';
  end if;
  if exists(select 1 from public.rental_applications x
      where x.organization_id=p_organization_id and x.unit_id=v_app.unit_id
        and x.status='lease_preparation' and x.id<>v_app.id) then
    raise exception using errcode='23505',message='ANOTHER_APPLICATION_IN_LEASE_PREPARATION';
  end if;  perform 1 from public.units u where u.id=v_app.unit_id and u.organization_id=p_organization_id for update;
  select * into v_setup from private.homeowner_lease_setups s
    where s.organization_id=p_organization_id and s.actor_user_id=v_actor and s.unit_id=v_app.unit_id for update;
  if found then
    raise exception using errcode='23505',message='LEASE_SETUP_ALREADY_IN_PROGRESS';
  end if;

  v_rent_text:=(v_app.listing_rent_amount_minor/100)::text||'.'||
    lpad((v_app.listing_rent_amount_minor%100)::text,2,'0');
  v_draft:=jsonb_build_object(
    'householdName',concat_ws(' ',v_app.first_name,v_app.last_name)||' household',
    'members',jsonb_build_array(jsonb_build_object(
      'firstName',v_app.first_name,'lastName',v_app.last_name,'email',v_app.email::text,
      'phoneE164','','primaryContact',true,'financiallyResponsible',true
    )),
    'startDate',case when v_app.desired_move_in_on>(
      select (now() at time zone p.time_zone)::date from public.properties p
      where p.id=v_app.property_id and p.organization_id=p_organization_id
    ) then v_app.desired_move_in_on::text else '' end,
    'endDate','','rentAmount',v_rent_text,'rentFrequency','monthly','openingBalance','0.00',
    'firstChargeDueDate',case when v_app.desired_move_in_on>(
      select (now() at time zone p.time_zone)::date from public.properties p
      where p.id=v_app.property_id and p.organization_id=p_organization_id
    ) then v_app.desired_move_in_on::text else '' end,
    'occupancy','future','documentVersionId','','upload',null
  );  insert into private.idempotency_records(
    organization_id,actor_user_id,actor_scope,route,idempotency_key,request_hash,expires_at
  ) values (p_organization_id,v_actor,v_actor_scope,'PrepareRentalApplicationLease',
    p_operation_key::text,v_hash,'infinity'::timestamptz);

  insert into private.homeowner_lease_setups(
    organization_id,unit_id,actor_user_id,revision,draft,last_save_key,last_save_hash,source_rental_application_id
  ) values (p_organization_id,v_app.unit_id,v_actor,1,v_draft,p_operation_key,
    encode(sha256(convert_to(jsonb_build_object('revision',0,'draft',v_draft)::text,'UTF8')),'hex'),v_app.id
  ) returning id into v_setup_id;

  update public.rental_applications set status='lease_preparation',lease_prepared_at=now(),
    updated_at=now(),version=version+1 where id=v_app.id returning * into v_app;
  insert into audit.audit_events(
    organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data
  ) values (p_organization_id,v_actor,'user','rental_application.lease_prepared','rental_application',
    v_app.id,v_corr,jsonb_build_object('unitId',v_app.unit_id,'setupId',v_setup_id));
  insert into private.outbox_events(
    organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload
  ) values (p_organization_id,'rental_application.lease_prepared','rental_application',v_app.id,v_corr,
    jsonb_build_object('applicationId',v_app.id,'unitId',v_app.unit_id,'setupId',v_setup_id));
  v_response:=jsonb_build_object('applicationId',v_app.id,'applicationReference',v_app.public_reference,
    'status',v_app.status,'applicationVersion',v_app.version,'setupId',v_setup_id,
    'setupRevision',1,'unitId',v_app.unit_id);  update private.idempotency_records r set state='completed',response_status=200,response_body=v_response,
    resource_type='rental_application',resource_id=v_app.id,completed_at=now()
  where r.organization_id=p_organization_id and r.actor_scope=v_actor_scope
    and r.route='PrepareRentalApplicationLease' and r.idempotency_key=p_operation_key::text;
  return v_response;
end; $$;
revoke all on function public.prepare_rental_application_lease(uuid,uuid,integer,uuid) from public,anon;
grant execute on function public.prepare_rental_application_lease(uuid,uuid,integer,uuid) to authenticated;
create or replace function public.close_rental_application(
  p_organization_id uuid,p_application_id uuid,p_expected_version integer,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid(); v_app public.rental_applications%rowtype; v_unit_id uuid;
  v_actor_scope text; v_hash text; v_previous private.idempotency_records%rowtype;
  v_corr uuid:=gen_random_uuid(); v_response jsonb;
begin
  if v_actor is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  if p_expected_version is null or p_expected_version<1 or p_idempotency_key is null
    or length(trim(p_idempotency_key)) not between 8 and 200 then
    raise exception using errcode='22023',message='INVALID_APPLICATION_CLOSE';
  end if;
  select unit_id into v_unit_id from public.rental_applications a
    where a.id=p_application_id and a.organization_id=p_organization_id;
  if not found then raise exception using errcode='P0002',message='APPLICATION_NOT_FOUND'; end if;
  perform 1 from public.units u where u.id=v_unit_id and u.organization_id=p_organization_id for update;
  select * into v_app from public.rental_applications a
    where a.id=p_application_id and a.organization_id=p_organization_id for update;
  if not (private.has_property_access(v_app.property_id,'lease.manage')
    or private.has_property_access(v_app.property_id,'property.manage')) then
    raise exception using errcode='42501',message='APPLICATION_SCOPE_DENIED';
  end if;
  v_actor_scope:='user:'||v_actor::text;
  v_hash:=encode(sha256(convert_to(jsonb_build_object(
    'applicationId',p_application_id,'expectedVersion',p_expected_version,'action','close'
  )::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(
    '|',p_organization_id,v_actor_scope,'CloseRentalApplication',trim(p_idempotency_key)
  ),0));  select * into v_previous from private.idempotency_records r
  where r.organization_id=p_organization_id and r.actor_scope=v_actor_scope
    and r.route='CloseRentalApplication' and r.idempotency_key=trim(p_idempotency_key);
  if found then
    if v_previous.request_hash<>v_hash then raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT'; end if;
    if v_previous.state='completed' then return v_previous.response_body; end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;
  if v_app.version<>p_expected_version then raise exception using errcode='40001',message='APPLICATION_VERSION_CONFLICT'; end if;
  if v_app.status not in ('submitted','lease_preparation') then
    raise exception using errcode='23514',message='APPLICATION_NOT_CLOSABLE';
  end if;
  insert into private.idempotency_records(
    organization_id,actor_user_id,actor_scope,route,idempotency_key,request_hash,expires_at
  ) values (p_organization_id,v_actor,v_actor_scope,'CloseRentalApplication',
    trim(p_idempotency_key),v_hash,'infinity'::timestamptz);
  if v_app.status='lease_preparation' then
    delete from private.homeowner_lease_setups
      where source_rental_application_id=v_app.id and status='draft';
  end if;
  update public.rental_applications set status='closed',closed_at=now(),updated_at=now(),version=version+1
    where id=v_app.id returning * into v_app;
  insert into audit.audit_events(
    organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data
  ) values (p_organization_id,v_actor,'user','rental_application.closed','rental_application',
    v_app.id,v_corr,jsonb_build_object('unitId',v_app.unit_id,'listingId',v_app.listing_id));  insert into private.outbox_events(
    organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload
  ) values (p_organization_id,'rental_application.closed','rental_application',v_app.id,v_corr,
    jsonb_build_object('applicationId',v_app.id,'unitId',v_app.unit_id));
  v_response:=jsonb_build_object('applicationId',v_app.id,'applicationReference',v_app.public_reference,
    'status',v_app.status,'version',v_app.version);
  update private.idempotency_records r set state='completed',response_status=200,response_body=v_response,
    resource_type='rental_application',resource_id=v_app.id,completed_at=now()
  where r.organization_id=p_organization_id and r.actor_scope=v_actor_scope
    and r.route='CloseRentalApplication' and r.idempotency_key=trim(p_idempotency_key);
  return v_response;
end; $$;
revoke all on function public.close_rental_application(uuid,uuid,integer,text) from public,anon;
grant execute on function public.close_rental_application(uuid,uuid,integer,text) to authenticated;
create or replace function private.convert_linked_rental_application_on_setup_activation()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_app public.rental_applications%rowtype;
  v_tenancy public.tenancies%rowtype; v_household public.households%rowtype;
  v_tenancy_id uuid; v_household_id uuid; v_actor uuid:=auth.uid(); v_corr uuid:=gen_random_uuid();
begin
  if new.status<>'activated' or old.status='activated' then return new; end if;
  -- A second manual lease setup may not bypass a renter already selected for this unit.
  if new.source_rental_application_id is null then
    if exists (
      select 1 from public.rental_applications a
      where a.organization_id=new.organization_id and a.unit_id=new.unit_id
        and a.status='lease_preparation'
    ) then
      raise exception using errcode='23514',message='APPLICATION_LEASE_PREPARATION_ACTIVE';
    end if;
    return new;
  end if;
  select * into v_app from public.rental_applications a
    where a.id=new.source_rental_application_id and a.organization_id=new.organization_id for update;
  if not found or v_app.unit_id<>new.unit_id or v_app.status<>'lease_preparation' then
    raise exception using errcode='23514',message='APPLICATION_NOT_READY_FOR_CONVERSION';
  end if;
  begin
    v_tenancy_id:=(new.result->>'tenancyId')::uuid;
    v_household_id:=(new.result->>'householdId')::uuid;
  exception when others then
    raise exception using errcode='23514',message='APPLICATION_CONVERSION_RESULT_INVALID';
  end;
  select * into v_tenancy from public.tenancies t
    where t.id=v_tenancy_id and t.organization_id=new.organization_id and t.unit_id=new.unit_id;
  select * into v_household from public.households h
    where h.id=v_household_id and h.organization_id=new.organization_id;
  if v_tenancy.id is null or v_household.id is null or v_tenancy.household_id<>v_household.id then
    raise exception using errcode='23514',message='APPLICATION_CONVERSION_RESULT_INVALID';
  end if;
  -- The selected renter must be the primary contact in the tenancy actually activated.
  -- Checking only the tenancy/household UUIDs would allow another person's signed lease.
  if not exists (
    select 1 from public.household_members hm
    join public.people p on p.id=hm.person_id and p.organization_id=hm.organization_id
    where hm.organization_id=new.organization_id and hm.household_id=v_household.id
      and hm.is_primary_contact and hm.ends_on is null
      and lower(trim(p.email::text))=lower(trim(v_app.email::text))
      and lower(trim(p.first_name))=lower(trim(v_app.first_name))
      and lower(trim(p.last_name))=lower(trim(v_app.last_name))
  ) then
    raise exception using errcode='23514',message='APPLICATION_PRIMARY_CONTACT_MISMATCH';
  end if;
  update public.rental_applications set status='converted',converted_at=now(),
    converted_household_id=v_household_id,converted_tenancy_id=v_tenancy_id,updated_at=now(),version=version+1
    where id=v_app.id;
  insert into audit.audit_events(
    organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data
  ) values (new.organization_id,v_actor,case when v_actor is null then 'system' else 'user' end,
    'rental_application.converted','rental_application',v_app.id,v_corr,
    jsonb_build_object('unitId',new.unit_id,'householdId',v_household_id,'tenancyId',v_tenancy_id));
  insert into private.outbox_events(
    organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload
  ) values (new.organization_id,'rental_application.converted','rental_application',v_app.id,v_corr,
    jsonb_build_object('applicationId',v_app.id,'unitId',new.unit_id,
      'householdId',v_household_id,'tenancyId',v_tenancy_id));
  return new;
end; $$;
revoke all on function private.convert_linked_rental_application_on_setup_activation()
  from public,anon,authenticated,service_role;
create trigger homeowner_lease_setup_application_conversion
before update of status,result on private.homeowner_lease_setups
for each row execute function private.convert_linked_rental_application_on_setup_activation();

-- Check the final transaction state, not the intermediate row state.
-- The normal signed-lease flow converts the linked application in the same transaction.
-- A direct tenancy activation must not leave a selected application in preparation.
create or replace function private.prevent_rental_application_tenancy_bypass()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  -- A previously scheduled (or closed) lease must not enter an occupying
  -- state while another applicant is selected. Existing occupied tenancies may
  -- still progress to notice/move-out without creating a new tenancy.
  if tg_op='UPDATE' then
    if old.status=new.status
      or new.status not in ('active','notice_given','move_out_in_progress')
      or (old.status in ('active','notice_given','move_out_in_progress') and new.status<>'active')
    then return new; end if;
  end if;
  if exists (
    select 1 from public.rental_applications a
    where a.organization_id=new.organization_id and a.unit_id=new.unit_id
      and a.status='lease_preparation'
  ) then
    raise exception using errcode='23514',message='APPLICATION_LEASE_PREPARATION_ACTIVE';
  end if;
  return new;
end; $$;
revoke all on function private.prevent_rental_application_tenancy_bypass()
  from public,anon,authenticated,service_role;
create constraint trigger rental_application_tenancy_activation_guard
after insert or update of status on public.tenancies deferrable initially deferred
for each row execute function private.prevent_rental_application_tenancy_bypass();

commit;
