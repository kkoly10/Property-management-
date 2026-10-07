-- FD-HR-002–005 / Batch B2: verified inquiry intake for already-published unlisted listings.
-- No screening, scoring, ranking, application decision or marketplace discovery is introduced here.
begin;

create table public.rental_inquiries (
  id uuid primary key default gen_random_uuid(),
  public_reference text not null unique,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  listing_id uuid not null,
  property_id uuid not null references public.properties(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  first_name text not null check (length(trim(first_name)) between 1 and 80),
  last_name text not null check (length(trim(last_name)) between 1 and 80),
  email citext not null check (length(trim(email::text)) between 3 and 320),
  question text not null check (length(trim(question)) between 10 and 2000),
  source text not null default 'shared_link' check (source='shared_link'),
  status text not null default 'pending_verification'
    check (status in ('pending_verification','open','closed','expired')),
  verified_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version>0),
  unique (organization_id,id),
  foreign key (organization_id,listing_id) references public.rental_listings(organization_id,id) on delete restrict,
  foreign key (organization_id,property_id) references public.properties(organization_id,id) on delete restrict,
  foreign key (organization_id,property_id,unit_id) references public.units(organization_id,property_id,id) on delete restrict,
  check (
    (status='pending_verification' and verified_at is null and closed_at is null)
    or (status='open' and verified_at is not null and closed_at is null)
    or (status='closed' and verified_at is not null and closed_at is not null)
    or (status='expired' and verified_at is null and closed_at is null)
  )
);
create index rental_inquiries_unit_status_idx on public.rental_inquiries(organization_id,unit_id,status,created_at desc);
create index rental_inquiries_listing_email_idx on public.rental_inquiries(listing_id,email,created_at desc);
create table private.rental_inquiry_verifications (
  inquiry_id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  notification_job_id uuid references private.notification_jobs(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (organization_id,inquiry_id) references public.rental_inquiries(organization_id,id) on delete cascade,
  check (expires_at>created_at),
  check (consumed_at is null or consumed_at>=created_at)
);
create index rental_inquiry_verifications_expiry_idx
  on private.rental_inquiry_verifications(expires_at) where consumed_at is null;

create table private.rental_inquiry_attempts (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.rental_listings(id) on delete cascade,
  email_hash text not null check (email_hash ~ '^[0-9a-f]{64}$'),
  network_hash text check (network_hash is null or network_hash ~ '^[0-9a-f]{64}$'),
  attempted_at timestamptz not null default now()
);
create index rental_inquiry_attempts_email_idx
  on private.rental_inquiry_attempts(listing_id,email_hash,attempted_at desc);
create index rental_inquiry_attempts_network_idx
  on private.rental_inquiry_attempts(network_hash,attempted_at desc) where network_hash is not null;

alter table public.rental_inquiries enable row level security;
create policy rental_inquiries_verified_operator_read on public.rental_inquiries
for select to authenticated using (
  status in ('open','closed') and (
    private.has_property_access(property_id,'lease.manage')
    or private.has_property_access(property_id,'property.manage')
  )
);
grant select on public.rental_inquiries to authenticated;
revoke insert,update,delete on public.rental_inquiries from anon,authenticated;
revoke all on public.rental_inquiries from anon;
revoke all on private.rental_inquiry_verifications,private.rental_inquiry_attempts
  from public,anon,authenticated,service_role;
create or replace function public.submit_public_rental_inquiry(
  p_public_id uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_question text,
  p_network_hash text,
  p_locale text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_listing public.rental_listings%rowtype;
  v_first_name text := trim(coalesce(p_first_name,''));
  v_last_name text := trim(coalesce(p_last_name,''));
  v_email text := lower(trim(coalesce(p_email,'')));
  v_question text := trim(coalesce(p_question,''));
  v_email_hash text;
  v_actor_scope text;
  v_request_hash text;
  v_storage_key text;
  v_previous private.idempotency_records%rowtype;
  v_inquiry_id uuid := gen_random_uuid();
  v_reference text;
  v_raw_token text;
  v_token_hash text;
  v_expires_at timestamptz := now()+interval '60 minutes';
  v_notification_job_id uuid;
  v_corr uuid := gen_random_uuid();
  v_response jsonb := jsonb_build_object('accepted',true);
begin
  if p_public_id is null then raise exception using errcode='22023',message='LISTING_REQUIRED'; end if;
  if length(v_first_name) not between 1 and 80 or length(v_last_name) not between 1 and 80 then
    raise exception using errcode='22023',message='INVALID_INQUIRER_NAME';
  end if;
  if length(v_email) not between 3 and 320
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception using errcode='22023',message='INVALID_INQUIRER_EMAIL';
  end if;
  if length(v_question) not between 10 and 2000 then
    raise exception using errcode='22023',message='INVALID_INQUIRY_QUESTION';
  end if;
  if p_network_hash is not null and p_network_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='22023',message='INVALID_NETWORK_HASH';
  end if;
  if p_locale not in ('en-US','en-CA','es-MX','fr-CA') then
    raise exception using errcode='22023',message='INVALID_INQUIRY_LOCALE';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 200 then
    raise exception using errcode='22023',message='INVALID_IDEMPOTENCY_KEY';
  end if;
  select * into v_listing
  from public.rental_listings l
  where l.public_id=p_public_id
    and l.status='published'
    and l.visibility='unlisted'
  for share;
  if not found then
    raise exception using errcode='P0002',message='LISTING_NOT_AVAILABLE';
  end if;

  v_email_hash := encode(sha256(convert_to(v_email,'UTF8')),'hex');
  v_actor_scope := 'public-inquiry:'||p_public_id::text||':'||substr(v_email_hash,1,32);
  v_request_hash := encode(sha256(convert_to(jsonb_build_object(
    'publicId',p_public_id,'firstName',v_first_name,'lastName',v_last_name,
    'email',v_email,'question',v_question,'locale',p_locale
  )::text,'UTF8')),'hex');
  -- The original v4.1 idempotency table also has a legacy uniqueness constraint whose actor_user_id
  -- is NULL for public calls. Namespace the durable key so unrelated public visitors cannot collide.
  v_storage_key := encode(sha256(convert_to(
    v_actor_scope||'|'||trim(p_idempotency_key),'UTF8'
  )),'hex');

  perform pg_advisory_xact_lock(hashtextextended('rental-inquiry|'||v_listing.id::text,0));
  select * into v_previous
  from private.idempotency_records r
  where r.organization_id=v_listing.organization_id
    and r.actor_scope=v_actor_scope
    and r.route='SubmitPublicRentalInquiry'
    and r.idempotency_key=v_storage_key;
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
    organization_id,actor_scope,route,idempotency_key,request_hash,expires_at
  ) values (
    v_listing.organization_id,v_actor_scope,'SubmitPublicRentalInquiry',
    v_storage_key,v_request_hash,now()+interval '24 hours'
  );

  if (
    select count(*) from private.rental_inquiry_attempts a
    where a.listing_id=v_listing.id
      and a.email_hash=v_email_hash
      and a.attempted_at>=now()-interval '24 hours'
  ) >= 5 then
    insert into private.rental_inquiry_attempts(listing_id,email_hash,network_hash)
    values (v_listing.id,v_email_hash,p_network_hash);    update private.idempotency_records r
    set state='completed',response_status=202,response_body=v_response,completed_at=now()
    where r.organization_id=v_listing.organization_id
      and r.actor_scope=v_actor_scope
      and r.route='SubmitPublicRentalInquiry'
      and r.idempotency_key=v_storage_key;
    return v_response;
  end if;

  if p_network_hash is not null and (
    select count(*) from private.rental_inquiry_attempts a
    where a.network_hash=p_network_hash
      and a.attempted_at>=now()-interval '1 hour'
  ) >= 20 then
    insert into private.rental_inquiry_attempts(listing_id,email_hash,network_hash)
    values (v_listing.id,v_email_hash,p_network_hash);
    update private.idempotency_records r
    set state='completed',response_status=202,response_body=v_response,completed_at=now()
    where r.organization_id=v_listing.organization_id
      and r.actor_scope=v_actor_scope
      and r.route='SubmitPublicRentalInquiry'
      and r.idempotency_key=v_storage_key;
    return v_response;
  end if;  insert into private.rental_inquiry_attempts(listing_id,email_hash,network_hash)
  values (v_listing.id,v_email_hash,p_network_hash);

  v_reference := 'INQ-'||upper(substr(replace(v_inquiry_id::text,'-',''),1,12));
  v_raw_token := encode(sha256(convert_to(
    gen_random_uuid()::text||gen_random_uuid()::text,'UTF8'
  )),'hex');
  v_token_hash := encode(sha256(convert_to(v_raw_token,'UTF8')),'hex');

  insert into public.rental_inquiries(
    id,public_reference,organization_id,listing_id,property_id,unit_id,
    first_name,last_name,email,question,source,status
  ) values (
    v_inquiry_id,v_reference,v_listing.organization_id,v_listing.id,
    v_listing.property_id,v_listing.unit_id,
    v_first_name,v_last_name,v_email,v_question,'shared_link','pending_verification'
  );

  insert into private.rental_inquiry_verifications(
    inquiry_id,organization_id,token_hash,expires_at
  ) values (
    v_inquiry_id,v_listing.organization_id,v_token_hash,v_expires_at
  );  insert into private.notification_jobs(
    organization_id,template_code,locale,channel,recipient_address,payload,idempotency_key
  ) values (
    v_listing.organization_id,'rental_inquiry_verification',p_locale,'email',v_email,
    jsonb_build_object(
      'inquiryReference',v_reference,
      'listingTitle',v_listing.title,
      'verificationToken',v_raw_token,
      'expiresAt',v_expires_at
    ),
    'rental-inquiry-verification:'||v_inquiry_id::text
  )
  returning id into v_notification_job_id;

  update private.rental_inquiry_verifications
  set notification_job_id=v_notification_job_id
  where inquiry_id=v_inquiry_id;

  insert into audit.audit_events(
    organization_id,actor_type,action_code,resource_type,resource_id,
    correlation_id,ip_hash,after_data
  ) values (
    v_listing.organization_id,'system','rental_inquiry.pending_verification',
    'rental_inquiry',v_inquiry_id,v_corr,p_network_hash,
    jsonb_build_object('listingId',v_listing.id,'unitId',v_listing.unit_id,'source','shared_link')
  );  insert into private.outbox_events(
    organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload
  ) values (
    v_listing.organization_id,'rental_inquiry.pending_verification',
    'rental_inquiry',v_inquiry_id,v_corr,
    jsonb_build_object('inquiryId',v_inquiry_id,'listingId',v_listing.id,'unitId',v_listing.unit_id)
  );

  update private.idempotency_records r
  set state='completed',response_status=202,response_body=v_response,
      resource_type='rental_inquiry',resource_id=v_inquiry_id,completed_at=now()
  where r.organization_id=v_listing.organization_id
    and r.actor_scope=v_actor_scope
    and r.route='SubmitPublicRentalInquiry'
    and r.idempotency_key=v_storage_key;
  return v_response;
end;
$$;
revoke all on function public.submit_public_rental_inquiry(
  uuid,text,text,text,text,text,text,text
) from public,anon,authenticated;
grant execute on function public.submit_public_rental_inquiry(
  uuid,text,text,text,text,text,text,text
) to service_role;
create or replace function private.scrub_rental_inquiry_verification_token()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.template_code='rental_inquiry_verification'
    and new.status in ('sent','dead_letter','canceled') then
    new.payload := new.payload - 'verificationToken';
  end if;
  return new;
end;
$$;
revoke all on function private.scrub_rental_inquiry_verification_token()
  from public,anon,authenticated,service_role;
create trigger scrub_rental_inquiry_verification_token
before insert or update of status on private.notification_jobs
for each row execute function private.scrub_rental_inquiry_verification_token();

create or replace function public.verify_public_rental_inquiry(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := lower(trim(coalesce(p_token,'')));
  v_token_hash text;
  v_verification private.rental_inquiry_verifications%rowtype;
  v_inquiry public.rental_inquiries%rowtype;
  v_corr uuid := gen_random_uuid();
begin
  if v_token !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('verified',false);
  end if;
  v_token_hash := encode(sha256(convert_to(v_token,'UTF8')),'hex');

  select * into v_verification
  from private.rental_inquiry_verifications v
  where v.token_hash=v_token_hash
  for update;
  if not found then
    return jsonb_build_object('verified',false);
  end if;

  select * into v_inquiry
  from public.rental_inquiries i
  where i.id=v_verification.inquiry_id
    and i.organization_id=v_verification.organization_id
  for update;
  if not found then
    return jsonb_build_object('verified',false);
  end if;  if v_verification.consumed_at is not null then
    if v_inquiry.status in ('open','closed') and v_inquiry.verified_at is not null then
      return jsonb_build_object(
        'verified',true,
        'inquiryReference',v_inquiry.public_reference,
        'status',v_inquiry.status
      );
    end if;
    return jsonb_build_object('verified',false);
  end if;

  if v_verification.expires_at<=now() then
    if v_inquiry.status='pending_verification' then
      update public.rental_inquiries
      set status='expired',updated_at=now(),version=version+1
      where id=v_inquiry.id;
    end if;
    update private.rental_inquiry_verifications
    set consumed_at=coalesce(consumed_at,now())
    where inquiry_id=v_inquiry.id;
    return jsonb_build_object('verified',false);
  end if;

  if v_inquiry.status<>'pending_verification' then
    return jsonb_build_object('verified',false);
  end if;

  update public.rental_inquiries
  set status='open',verified_at=now(),updated_at=now(),version=version+1
  where id=v_inquiry.id
  returning * into v_inquiry;  update private.rental_inquiry_verifications
  set consumed_at=now()
  where inquiry_id=v_inquiry.id;

  insert into audit.audit_events(
    organization_id,actor_type,action_code,resource_type,resource_id,
    correlation_id,after_data
  ) values (
    v_inquiry.organization_id,'system','rental_inquiry.verified',
    'rental_inquiry',v_inquiry.id,v_corr,
    jsonb_build_object('listingId',v_inquiry.listing_id,'unitId',v_inquiry.unit_id,'status','open')
  );
  insert into private.outbox_events(
    organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload
  ) values (
    v_inquiry.organization_id,'rental_inquiry.verified',
    'rental_inquiry',v_inquiry.id,v_corr,
    jsonb_build_object('inquiryId',v_inquiry.id,'listingId',v_inquiry.listing_id,'unitId',v_inquiry.unit_id)
  );

  return jsonb_build_object(
    'verified',true,
    'inquiryReference',v_inquiry.public_reference,
    'status',v_inquiry.status
  );
end;
$$;
revoke all on function public.verify_public_rental_inquiry(text)
  from public,anon,authenticated;
grant execute on function public.verify_public_rental_inquiry(text) to service_role;
create or replace function public.close_rental_inquiry(
  p_organization_id uuid,
  p_inquiry_id uuid,
  p_expected_version integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_scope text;
  v_inquiry public.rental_inquiries%rowtype;
  v_hash text;
  v_previous private.idempotency_records%rowtype;
  v_corr uuid := gen_random_uuid();
  v_response jsonb;
begin
  if v_actor is null then
    raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED';
  end if;
  if p_expected_version is null or p_expected_version<1 then
    raise exception using errcode='22023',message='INVALID_EXPECTED_VERSION';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 200 then
    raise exception using errcode='22023',message='INVALID_IDEMPOTENCY_KEY';
  end if;  select * into v_inquiry
  from public.rental_inquiries i
  where i.id=p_inquiry_id and i.organization_id=p_organization_id
  for update;
  if not found then
    raise exception using errcode='P0002',message='INQUIRY_NOT_FOUND';
  end if;
  if not (
    private.has_property_access(v_inquiry.property_id,'lease.manage')
    or private.has_property_access(v_inquiry.property_id,'property.manage')
  ) then
    raise exception using errcode='42501',message='INQUIRY_SCOPE_DENIED';
  end if;

  v_actor_scope := 'user:'||v_actor::text;
  v_hash := encode(sha256(convert_to(jsonb_build_object(
    'organizationId',p_organization_id,'inquiryId',p_inquiry_id,
    'expectedVersion',p_expected_version
  )::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(
    '|',p_organization_id,v_actor_scope,'CloseRentalInquiry',trim(p_idempotency_key)
  ),0));

  select * into v_previous
  from private.idempotency_records r
  where r.organization_id=p_organization_id
    and r.actor_scope=v_actor_scope
    and r.route='CloseRentalInquiry'
    and r.idempotency_key=trim(p_idempotency_key);  if found then
    if v_previous.request_hash<>v_hash then
      raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT';
    end if;
    if v_previous.state='completed' then
      return v_previous.response_body;
    end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;

  if v_inquiry.version<>p_expected_version then
    raise exception using errcode='40001',message='INQUIRY_VERSION_CONFLICT';
  end if;
  if v_inquiry.status<>'open' then
    raise exception using errcode='23514',message='INQUIRY_NOT_OPEN';
  end if;

  insert into private.idempotency_records(
    organization_id,actor_user_id,actor_scope,route,idempotency_key,request_hash,expires_at
  ) values (
    p_organization_id,v_actor,v_actor_scope,'CloseRentalInquiry',
    trim(p_idempotency_key),v_hash,'infinity'::timestamptz
  );

  update public.rental_inquiries
  set status='closed',closed_at=now(),updated_at=now(),version=version+1
  where id=v_inquiry.id
  returning * into v_inquiry;  insert into audit.audit_events(
    organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,
    correlation_id,after_data
  ) values (
    p_organization_id,v_actor,'user','rental_inquiry.closed',
    'rental_inquiry',v_inquiry.id,v_corr,
    jsonb_build_object('listingId',v_inquiry.listing_id,'unitId',v_inquiry.unit_id,'status','closed')
  );
  insert into private.outbox_events(
    organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload
  ) values (
    p_organization_id,'rental_inquiry.closed',
    'rental_inquiry',v_inquiry.id,v_corr,
    jsonb_build_object('inquiryId',v_inquiry.id,'listingId',v_inquiry.listing_id,'unitId',v_inquiry.unit_id)
  );

  v_response := jsonb_build_object(
    'inquiryId',v_inquiry.id,'publicReference',v_inquiry.public_reference,
    'status',v_inquiry.status,'version',v_inquiry.version
  );
  update private.idempotency_records r
  set state='completed',response_status=200,response_body=v_response,
      resource_type='rental_inquiry',resource_id=v_inquiry.id,completed_at=now()
  where r.organization_id=p_organization_id
    and r.actor_scope=v_actor_scope
    and r.route='CloseRentalInquiry'
    and r.idempotency_key=trim(p_idempotency_key);
  return v_response;
end;
$$;revoke all on function public.close_rental_inquiry(
  uuid,uuid,integer,text
) from public,anon;
grant execute on function public.close_rental_inquiry(
  uuid,uuid,integer,text
) to authenticated;

commit;
