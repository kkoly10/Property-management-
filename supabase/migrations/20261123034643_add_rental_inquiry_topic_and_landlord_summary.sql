begin;

alter table public.rental_inquiries add column topic text
  constraint rental_inquiry_topic_allowed check (
    topic in ('availability','rent_and_lease','utilities','parking','pets','access_and_amenities','other')
  );

create or replace function public.submit_public_rental_inquiry(
  p_public_id uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_question text,
  p_network_hash text,
  p_locale text,
  p_idempotency_key text,
  p_topic text
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
  if p_topic is not null and p_topic not in (
    'availability','rent_and_lease','utilities','parking','pets','access_and_amenities','other'
  ) then
    raise exception using errcode='22023',message='INVALID_INQUIRY_TOPIC';
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
    and l.visibility in ('unlisted','discoverable')
  for share;
  if not found then
    raise exception using errcode='P0002',message='LISTING_NOT_AVAILABLE';
  end if;

  v_email_hash := encode(sha256(convert_to(v_email,'UTF8')),'hex');
  v_actor_scope := 'public-inquiry:'||p_public_id::text||':'||substr(v_email_hash,1,32);
  v_request_hash := encode(sha256(convert_to((jsonb_build_object(
    'publicId',p_public_id,'firstName',v_first_name,'lastName',v_last_name,
    'email',v_email,'question',v_question,'locale',p_locale
  ) || jsonb_strip_nulls(jsonb_build_object('topic',p_topic)))::text,'UTF8')),'hex');
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
    values (v_listing.id,v_email_hash,p_network_hash);
    update private.idempotency_records r
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
  end if;

  insert into private.rental_inquiry_attempts(listing_id,email_hash,network_hash)
  values (v_listing.id,v_email_hash,p_network_hash);

  v_reference := 'INQ-'||upper(substr(replace(v_inquiry_id::text,'-',''),1,12));
  v_raw_token := encode(sha256(convert_to(
    gen_random_uuid()::text||gen_random_uuid()::text,'UTF8'
  )),'hex');
  v_token_hash := encode(sha256(convert_to(v_raw_token,'UTF8')),'hex');

  insert into public.rental_inquiries(
    id,public_reference,organization_id,listing_id,property_id,unit_id,
    first_name,last_name,email,question,topic,source,status
  ) values (
    v_inquiry_id,v_reference,v_listing.organization_id,v_listing.id,
    v_listing.property_id,v_listing.unit_id,
    v_first_name,v_last_name,v_email,v_question,p_topic,'shared_link','pending_verification'
  );

  insert into private.rental_inquiry_verifications(
    inquiry_id,organization_id,token_hash,expires_at
  ) values (
    v_inquiry_id,v_listing.organization_id,v_token_hash,v_expires_at
  );

  insert into private.notification_jobs(
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
  );

  insert into private.outbox_events(
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

revoke all on function public.submit_public_rental_inquiry(uuid,text,text,text,text,text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.submit_public_rental_inquiry(uuid,text,text,text,text,text,text,text,text)
  to service_role;

-- Existing clients use this signature. Null topic preserves the original request hash.
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
language sql
security invoker
set search_path = ''
as $$
  select public.submit_public_rental_inquiry(
    p_public_id,p_first_name,p_last_name,p_email,p_question,p_network_hash,p_locale,p_idempotency_key,null::text
  );
$$;

revoke all on function public.submit_public_rental_inquiry(uuid,text,text,text,text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.submit_public_rental_inquiry(uuid,text,text,text,text,text,text,text)
  to service_role;

create or replace function private.enqueue_verified_rental_inquiry_notification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into private.notification_jobs (
    organization_id,template_code,locale,channel,recipient_user_id,payload,idempotency_key
  )
  select new.organization_id,'message_rental_inquiry_received',
    case when p.locale in ('en-US','en-CA','es-MX','fr-CA') then p.locale else 'en-US' end,'email',m.user_id,
    jsonb_strip_nulls(jsonb_build_object(
      'unitId',new.unit_id,'inquiryReference',new.public_reference,'listingTitle',l.title,'topic',new.topic
    )),
    'rental-inquiry-landlord:'||new.id::text||':'||m.user_id::text
  from public.rental_listings l
  join public.organizations o on o.id=l.organization_id
  join public.organization_memberships m on m.organization_id=o.id and m.role_code='org_owner'
  join public.role_definitions rd on rd.code=m.role_code
  join public.profiles p on p.user_id=m.user_id and p.status='active'
  join auth.users u on u.id=m.user_id
  where l.id=new.listing_id and l.organization_id=new.organization_id
    and l.property_id=new.property_id and l.unit_id=new.unit_id
    and o.customer_path='self_managing' and o.status in ('trial','active')
    and m.status='active' and m.starts_at<=now() and (m.ends_at is null or m.ends_at>now())
    and u.email_confirmed_at is not null and nullif(btrim(u.email),'') is not null
    and exists (
      select 1 from public.role_permissions rp where rp.role_code=m.role_code
        and rp.permission_code in ('*','lease.manage','property.manage')
    )
    and (
      exists (
        select 1 from public.membership_property_scopes s
        where s.organization_id=m.organization_id and s.membership_id=m.id and s.property_id=new.property_id
      )
      or (
        rd.organization_wide_allowed and not exists (
          select 1 from public.membership_property_scopes s where s.membership_id=m.id
        )
      )
    )
  -- Prefer the listing's owner-publisher. Otherwise choose the earliest effective eligible owner.
  order by (m.user_id=l.created_by) desc nulls last,m.starts_at,m.created_at,m.id
  limit 1
  on conflict (channel,idempotency_key) do nothing;

  return new;
end;
$$;
revoke all on function private.enqueue_verified_rental_inquiry_notification() from public,anon,authenticated,service_role;

notify pgrst, 'reload schema';
commit;
