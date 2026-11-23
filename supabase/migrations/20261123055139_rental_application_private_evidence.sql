begin;

-- Operator approval is provisioned explicitly for an exact property. No enabled policies ship.
create table private.rental_application_evidence_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  property_id uuid not null,
  reviewer_user_id uuid not null references auth.users(id),
  notice_version text not null check (length(notice_version) between 1 and 80),
  notice_text text not null check (length(trim(notice_text)) between 1 and 8000),
  allowed_document_types text[] not null check (cardinality(allowed_document_types) between 1 and 3
    and allowed_document_types <@ array['identity','income_evidence','credit_evidence']::text[]),
  allow_self_reported_score boolean not null default false,
  terminal_retention_days integer not null check (terminal_retention_days between 1 and 90),
  approved_at timestamptz not null,
  approval_reference text not null check (length(trim(approval_reference)) between 1 and 120),
  enabled boolean not null default false,
  unique(organization_id,property_id,id),
  foreign key(organization_id,property_id) references public.properties(organization_id,id)
);
create unique index rental_evidence_one_enabled_policy_per_property
  on private.rental_application_evidence_policies(property_id) where enabled;

create function private.keep_rental_evidence_policy_version_immutable() returns trigger
language plpgsql set search_path='' as $$
begin
  if (to_jsonb(new)-'enabled') is distinct from (to_jsonb(old)-'enabled') then
    raise exception using errcode='23514',message='EVIDENCE_POLICY_REVISION_REQUIRED';
  end if;
  return new;
end; $$;
revoke all on function private.keep_rental_evidence_policy_version_immutable() from public,anon,authenticated,service_role;
create trigger keep_rental_evidence_policy_version_immutable before update on private.rental_application_evidence_policies
  for each row execute function private.keep_rental_evidence_policy_version_immutable();

create table private.rental_application_requirement_snapshots (
  application_id uuid primary key,
  organization_id uuid not null,
  requirements_version uuid not null,
  requirements jsonb not null,
  foreign key(organization_id,application_id) references public.rental_applications(organization_id,id) on delete cascade
);

create table private.rental_application_evidence_packets (
  application_id uuid primary key,
  organization_id uuid not null,
  property_id uuid not null,
  policy_id uuid not null,
  reviewer_user_id uuid not null references auth.users(id),
  applicant_user_id uuid references auth.users(id),
  requirements jsonb not null,
  status text not null default 'draft' check (status in ('draft','submitted','changes_requested','selected','declined','closed')),
  version integer not null default 1 check (version>0),
  reviewed_version integer,
  reviewed_document_types text[] not null default '{}' check (reviewed_document_types <@ array['identity','income_evidence','credit_evidence']::text[]),
  self_reported_credit_score smallint check (self_reported_credit_score between 1 and 999),
  self_reported_score_source text check (self_reported_score_source in ('credit_bureau','bank_or_credit_app','other')),
  self_reported_score_observed_on date,
  acknowledged_current_requirements_version uuid,
  requirements_change_acknowledged_at timestamptz,
  alternative_document_types text[] not null default '{}' check (alternative_document_types <@ array['identity','income_evidence','credit_evidence']::text[]),
  requested_document_types text[] not null default '{}' check (requested_document_types <@ array['identity','income_evidence','credit_evidence']::text[]),
  purge_after timestamptz,
  legal_hold_at timestamptz,
  consent_version text,
  consent_sha256 text check (consent_sha256 ~ '^[a-f0-9]{64}$'),
  consent_at timestamptz,
  updated_at timestamptz not null default now(),
  check (self_reported_credit_score is not null or (self_reported_score_source is null and self_reported_score_observed_on is null)),
  unique (organization_id,application_id),
  foreign key(organization_id,application_id) references public.rental_applications(organization_id,id) on delete cascade,
  foreign key(organization_id,property_id,policy_id)
    references private.rental_application_evidence_policies(organization_id,property_id,id)
);
create index rental_evidence_packets_purge_idx on private.rental_application_evidence_packets(purge_after)
  where purge_after is not null and legal_hold_at is null;

create table private.rental_application_evidence_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  application_id uuid not null,
  uploader_user_id uuid not null references auth.users(id),
  document_type text not null check (document_type in ('identity','income_evidence','credit_evidence')),
  object_key text not null unique,
  content_type text not null check(content_type in ('application/pdf','image/jpeg','image/png')),
  size_bytes integer not null check(size_bytes between 1 and 8388608),
  sha256 text check (sha256 ~ '^[a-f0-9]{64}$'),
  status text not null default 'awaiting_upload' check (status in ('awaiting_upload','quarantined','scanning','clean','rejected','removed','purged')),
  upload_expires_at timestamptz not null default (now()+interval '15 minutes'),
  remove_after timestamptz,
  attempts integer not null default 0,
  claim_id uuid,
  claim_until timestamptz,
  next_scan_at timestamptz not null default now(),
  check (status='purged' or sha256 is not null),
  foreign key(organization_id,application_id)
    references private.rental_application_evidence_packets(organization_id,application_id) on delete restrict
);
create index rental_evidence_files_case_idx on private.rental_application_evidence_files(application_id);
create index rental_evidence_files_queue_idx on private.rental_application_evidence_files(next_scan_at)
  where status in ('quarantined','scanning');

alter table private.rental_application_evidence_policies enable row level security;
alter table private.rental_application_requirement_snapshots enable row level security;
alter table private.rental_application_evidence_packets enable row level security;
alter table private.rental_application_evidence_files enable row level security;
revoke all on private.rental_application_evidence_policies,private.rental_application_requirement_snapshots,
  private.rental_application_evidence_packets,private.rental_application_evidence_files
  from public,anon,authenticated,service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('private-rental-evidence','private-rental-evidence',false,8388608,
    array['application/pdf','image/jpeg','image/png']);

create function private.capture_rental_application_requirements()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_requirements jsonb:=private.get_rental_listing_application_requirements(new.listing_id);
  v_policy private.rental_application_evidence_policies%rowtype;
begin
  if v_requirements is null or v_requirements='null'::jsonb then return new; end if;
  if v_requirements->>'requirementsVersion' is distinct from nullif(current_setting('crecy.application_requirements_version',true),'') then
    raise exception using errcode='40001',message='APPLICATION_REQUIREMENTS_CHANGED';
  end if;
  insert into private.rental_application_requirement_snapshots(application_id,organization_id,requirements_version,requirements)
    values(new.id,new.organization_id,(v_requirements->>'requirementsVersion')::uuid,v_requirements);
  select p.* into v_policy from private.rental_application_evidence_policies p
    join public.organizations o on o.id=p.organization_id and o.status in ('trial','active')
    where p.organization_id=new.organization_id and p.property_id=new.property_id and p.enabled
      and p.approved_at<=now()
      and array(select jsonb_array_elements_text(v_requirements->'requiredDocumentTypes')) <@ p.allowed_document_types;
  if found then
    insert into private.rental_application_evidence_packets(application_id,organization_id,property_id,policy_id,reviewer_user_id,requirements)
      values(new.id,new.organization_id,new.property_id,v_policy.id,v_policy.reviewer_user_id,v_requirements);
  end if;
  return new;
end; $$;
revoke all on function private.capture_rental_application_requirements() from public,anon,authenticated,service_role;
create trigger capture_rental_application_requirements after insert on public.rental_applications
  for each row execute function private.capture_rental_application_requirements();

create function public.submit_rental_application_with_requirements(
  p_public_id uuid,p_first_name text,p_last_name text,p_email text,p_desired_move_in_on date,
  p_lease_term_text text,p_applicant_note text,p_network_hash text,p_locale text,p_idempotency_key text,p_requirements_version uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_listing_id uuid;
  v_current uuid;
  v_previous_setting text:=coalesce(current_setting('crecy.application_requirements_version',true),'');
  v_result jsonb;
begin
  -- Held across the existing submit command and snapshot trigger, including concurrent publication.
  select l.id into v_listing_id from public.rental_listings l
    where l.public_id=p_public_id and l.status='published' and l.visibility in ('unlisted','discoverable') for share;
  if not found then raise exception using errcode='P0002',message='LISTING_NOT_AVAILABLE'; end if;
  v_current:=(private.get_rental_listing_application_requirements(v_listing_id)->>'requirementsVersion')::uuid;
  if v_current is distinct from p_requirements_version then
    raise exception using errcode='40001',message='APPLICATION_REQUIREMENTS_CHANGED';
  end if;
  perform set_config('crecy.application_requirements_version',coalesce(v_current::text,''),true);
  v_result:=public.submit_public_rental_application(p_public_id,p_first_name,p_last_name,p_email,
    p_desired_move_in_on,p_lease_term_text,p_applicant_note,p_network_hash,p_locale,p_idempotency_key);
  perform set_config('crecy.application_requirements_version',v_previous_setting,true);
  return v_result;
end; $$;
revoke all on function public.submit_rental_application_with_requirements(uuid,text,text,text,date,text,text,text,text,text,uuid)
  from public,anon,authenticated;
grant execute on function public.submit_rental_application_with_requirements(uuid,text,text,text,date,text,text,text,text,text,uuid)
  to service_role;

create function private.require_recent_rental_evidence_mfa() returns uuid
language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_jwt jsonb:=auth.jwt();
begin
  if v_actor is null or coalesce(v_jwt->>'aal','aal1')<>'aal2' or not exists(
    select 1 from jsonb_array_elements(
      case when jsonb_typeof(v_jwt->'amr')='array' then v_jwt->'amr' else '[]'::jsonb end
    ) method where method->>'method'='totp'
      and case when method->>'timestamp' ~ '^[0-9]{1,12}$' then
        (method->>'timestamp')::bigint between extract(epoch from now()-interval '15 minutes')
          and extract(epoch from now()+interval '1 minute') else false end
  ) then raise exception using errcode='42501',message='EVIDENCE_RECENT_MFA_REQUIRED'; end if;
  return v_actor;
end; $$;
revoke all on function private.require_recent_rental_evidence_mfa() from public,anon,authenticated,service_role;

create function private.lock_rental_evidence_packet(p_reference text,p_require_actor boolean)
returns private.rental_application_evidence_packets
language plpgsql security definer set search_path='' as $$
declare v_case private.rental_application_evidence_packets%rowtype; v_actor uuid:=private.require_recent_rental_evidence_mfa();
begin
  -- Lock the application before the packet, the same order as terminal transitions.
  perform 1 from public.rental_applications a join auth.users u on u.id=v_actor
    and u.email_confirmed_at is not null and lower(trim(u.email))=lower(trim(a.email::text))
    where a.public_reference=p_reference and a.status in ('submitted','lease_preparation') for update of a;
  if not found then raise exception using errcode='42501',message='EVIDENCE_UNAVAILABLE'; end if;
  select e.* into v_case from private.rental_application_evidence_packets e
    join public.rental_applications a on a.id=e.application_id and a.organization_id=e.organization_id
    join public.organizations o on o.id=e.organization_id and o.status in ('trial','active')
    join private.rental_application_evidence_policies p on p.id=e.policy_id and p.enabled and p.approved_at<=now()
    join auth.users u on u.id=v_actor and u.email_confirmed_at is not null and lower(trim(u.email))=lower(trim(a.email::text))
    where a.public_reference=p_reference and a.status in ('submitted','lease_preparation') and a.verified_at is not null
      and e.status not in ('closed','declined')
      and (e.applicant_user_id=v_actor or (not p_require_actor and e.applicant_user_id is null))
    for update of e;
  if not found then raise exception using errcode='42501',message='EVIDENCE_UNAVAILABLE'; end if;
  return v_case;
end; $$;
revoke all on function private.lock_rental_evidence_packet(text,boolean) from public,anon,authenticated,service_role;

create function private.assert_rental_application_evidence_ready(p_organization_id uuid,p_application_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_packet private.rental_application_evidence_packets%rowtype;
begin
  select * into v_packet from private.rental_application_evidence_packets e
    where e.organization_id=p_organization_id and e.application_id=p_application_id for update;
  if not found then return; end if;
  if v_packet.status<>'selected' or v_packet.reviewed_version is distinct from v_packet.version or not exists (
    select 1 from private.rental_application_evidence_policies p where p.id=v_packet.policy_id and p.enabled and p.approved_at<=now()
  ) then
    raise exception using errcode='23514',message='APPLICANT_EVIDENCE_REVIEW_REQUIRED';
  end if;
end; $$;
revoke all on function private.assert_rental_application_evidence_ready(uuid,uuid) from public,anon,authenticated,service_role;

create function private.guard_rental_application_evidence_transition()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='lease_preparation' then
    perform private.assert_rental_application_evidence_ready(new.organization_id,new.id);
  elsif new.status in ('withdrawn','closed','expired','converted') then
    if new.status='closed' and exists(select 1 from private.rental_application_evidence_packets e
      where e.application_id=new.id and e.organization_id=new.organization_id
        and e.status in ('submitted','changes_requested','selected')
        and (e.self_reported_credit_score is not null
          or exists(select 1 from private.rental_application_evidence_files f where f.application_id=e.application_id
            and f.document_type='credit_evidence' and f.status in ('clean','removed','purged')))) then
      raise exception using errcode='23514',message='EVIDENCE_CREDIT_DECISION_REQUIRES_APPROVED_NOTICE_WORKFLOW';
    end if;
    update private.rental_application_evidence_packets e set status='closed',updated_at=now(),version=e.version+1,
      purge_after=least(e.purge_after,now()+make_interval(days=>p.terminal_retention_days))
    from private.rental_application_evidence_policies p
    where e.application_id=new.id and e.organization_id=new.organization_id and p.id=e.policy_id;
  end if;
  return new;
end; $$;
revoke all on function private.guard_rental_application_evidence_transition() from public,anon,authenticated,service_role;
create trigger guard_rental_application_evidence_transition before update of status on public.rental_applications
  for each row when (old.status is distinct from new.status) execute function private.guard_rental_application_evidence_transition();

create function private.rental_evidence_packet_dto(p_packet private.rental_application_evidence_packets)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('status',p_packet.status,'version',p_packet.version,
    'bound',p_packet.applicant_user_id is not null,'requirements',p_packet.requirements,
    'currentRequirementsVersion',current_listing.application_requirements->>'requirementsVersion',
    'noticeVersion',p.notice_version,'noticeText',p.notice_text,
    'noticeSha256',encode(sha256(convert_to(p.notice_text,'UTF8')),'hex'),
    'consented',p_packet.consent_sha256=encode(sha256(convert_to(p.notice_text,'UTF8')),'hex')
      and p_packet.consent_version=p.notice_version and p_packet.consent_at is not null,
    'allowedDocumentTypes',to_jsonb(p.allowed_document_types),'allowScore',p.allow_self_reported_score,
    'score',p_packet.self_reported_credit_score,'alternativeDocumentTypes',to_jsonb(p_packet.alternative_document_types),
    'scoreSource',p_packet.self_reported_score_source,'scoreObservedOn',p_packet.self_reported_score_observed_on,
    'requestedDocumentTypes',to_jsonb(p_packet.requested_document_types),
    'files',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'documentType',d.document_type,'status',d.status,
          'sizeBytes',d.size_bytes) order by d.id)
      from private.rental_application_evidence_files d
      where d.organization_id=p_packet.organization_id and d.application_id=p_packet.application_id
        and d.status not in ('removed','purged') and (d.status<>'awaiting_upload' or d.upload_expires_at>now())), '[]'::jsonb))
  from private.rental_application_evidence_policies p
  join public.rental_applications a on a.id=p_packet.application_id and a.organization_id=p_packet.organization_id
  join public.rental_listings current_listing on current_listing.id=a.listing_id and current_listing.organization_id=a.organization_id
  where p.id=p_packet.policy_id
$$;
revoke all on function private.rental_evidence_packet_dto(private.rental_application_evidence_packets) from public,anon,authenticated,service_role;

create function private.record_rental_evidence_event(p_packet private.rental_application_evidence_packets,p_action text,p_notify boolean)
returns void language plpgsql security definer set search_path='' as $$
declare v_correlation uuid:=gen_random_uuid();
begin
  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
    values(p_packet.organization_id,auth.uid(),'user',p_action,'rental_application',p_packet.application_id,v_correlation,
      jsonb_build_object('status',p_packet.status,'version',p_packet.version));
  if p_notify then
    insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
      values(p_packet.organization_id,p_action,'rental_application',p_packet.application_id,v_correlation,
        jsonb_build_object('status',p_packet.status,'version',p_packet.version));
  end if;
end; $$;
revoke all on function private.record_rental_evidence_event(private.rental_application_evidence_packets,text,boolean) from public,anon,authenticated,service_role;

create function public.get_my_rental_application_evidence(p_reference text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  return private.rental_evidence_packet_dto(private.lock_rental_evidence_packet(p_reference,false));
end; $$;

create function public.bind_rental_application_evidence(p_reference text,p_access_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_packet private.rental_application_evidence_packets%rowtype; v_actor uuid:=auth.uid();
begin
  -- The public withdrawal/cookie-rotation path locks the access row first.
  perform 1 from private.rental_application_access a
    where a.token_hash=encode(sha256(convert_to(coalesce(p_access_token,''),'UTF8')),'hex')
      and a.expires_at>now() for update;
  if not found then raise exception using errcode='42501',message='EVIDENCE_APPLICATION_CLAIM_REQUIRED'; end if;
  v_packet:=private.lock_rental_evidence_packet(p_reference,false);
  if not exists(select 1 from private.rental_application_access a
      where a.application_id=v_packet.application_id and a.organization_id=v_packet.organization_id
        and a.token_hash=encode(sha256(convert_to(coalesce(p_access_token,''),'UTF8')),'hex') and a.expires_at>now()) then
    raise exception using errcode='42501',message='EVIDENCE_APPLICATION_CLAIM_REQUIRED';
  end if;
  if v_packet.applicant_user_id is null then
    update private.rental_application_evidence_packets e set applicant_user_id=v_actor,version=e.version+1,updated_at=now()
      where e.application_id=v_packet.application_id returning * into v_packet;
    perform private.record_rental_evidence_event(v_packet,'rental_application.evidence_claimed',false);
  end if;
  return private.rental_evidence_packet_dto(v_packet);
end; $$;

create function private.require_rental_evidence_editable(p_packet private.rental_application_evidence_packets,p_version integer)
returns void language plpgsql stable security definer set search_path='' as $$
begin
  if p_packet.status not in ('draft','changes_requested') then
    raise exception using errcode='23514',message='EVIDENCE_PACKET_READ_ONLY';
  end if;
  if p_packet.version is distinct from p_version then
    raise exception using errcode='40001',message='EVIDENCE_PACKET_CHANGED';
  end if;
end; $$;
revoke all on function private.require_rental_evidence_editable(private.rental_application_evidence_packets,integer) from public,anon,authenticated,service_role;

create function public.save_rental_application_evidence_draft(
  p_reference text,p_version integer,p_score integer,p_score_source text,p_score_observed_on date,
  p_alternative_document_types text[],p_notice_version text,p_notice_sha256 text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_packet private.rental_application_evidence_packets%rowtype; v_policy private.rental_application_evidence_policies%rowtype;
begin
  v_packet:=private.lock_rental_evidence_packet(p_reference,true);
  perform private.require_rental_evidence_editable(v_packet,p_version);
  select * into strict v_policy from private.rental_application_evidence_policies where id=v_packet.policy_id;
  if p_notice_version is distinct from v_policy.notice_version
     or p_notice_sha256 is distinct from encode(sha256(convert_to(v_policy.notice_text,'UTF8')),'hex') then
    raise exception using errcode='40001',message='EVIDENCE_NOTICE_CHANGED';
  end if;
  if (p_score is not null and (not v_policy.allow_self_reported_score or p_score not between 1 and 999))
    or (p_score is null and (p_score_source is not null or p_score_observed_on is not null))
    or (p_score_source is not null and p_score_source not in ('credit_bureau','bank_or_credit_app','other'))
    or (p_score_observed_on is not null and (not isfinite(p_score_observed_on) or p_score_observed_on>current_date))
    or p_alternative_document_types is null or cardinality(p_alternative_document_types)>3
    or not p_alternative_document_types <@ v_policy.allowed_document_types
    or (cardinality(p_alternative_document_types)>0 and coalesce(v_packet.requirements->>'acceptedAlternatives','')='') then
    raise exception using errcode='22023',message='EVIDENCE_DRAFT_INVALID';
  end if;
  update private.rental_application_evidence_packets e set self_reported_credit_score=p_score,
    self_reported_score_source=p_score_source,self_reported_score_observed_on=p_score_observed_on,
    alternative_document_types=p_alternative_document_types,consent_version=p_notice_version,consent_sha256=p_notice_sha256,
    consent_at=case when e.consent_sha256 is distinct from p_notice_sha256 or e.consent_version is distinct from p_notice_version
      then now() else coalesce(e.consent_at,now()) end,updated_at=now(),version=e.version+1
    where e.application_id=v_packet.application_id returning * into v_packet;
  perform private.record_rental_evidence_event(v_packet,'rental_application.evidence_draft_saved',false);
  return private.rental_evidence_packet_dto(v_packet);
end; $$;

create function public.start_rental_application_evidence_upload(
  p_reference text,p_version integer,p_file_id uuid,p_document_type text,p_content_type text,p_size_bytes integer,p_sha256 text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_packet private.rental_application_evidence_packets%rowtype; v_file private.rental_application_evidence_files%rowtype;
begin
  v_packet:=private.lock_rental_evidence_packet(p_reference,true);
  perform private.require_rental_evidence_editable(v_packet,p_version);
  if not exists(select 1 from private.rental_application_evidence_policies p where p.id=v_packet.policy_id
      and p_document_type=any(p.allowed_document_types) and v_packet.consent_at is not null
      and v_packet.consent_version=p.notice_version and v_packet.consent_sha256=encode(sha256(convert_to(p.notice_text,'UTF8')),'hex')) then
    raise exception using errcode='42501',message='EVIDENCE_CATEGORY_OR_CONSENT_REQUIRED';
  end if;
  select f.* into v_file from private.rental_application_evidence_files f where f.id=p_file_id and f.application_id=v_packet.application_id;
  if found then
    if v_file.document_type is distinct from p_document_type or v_file.content_type is distinct from p_content_type
      or v_file.size_bytes is distinct from p_size_bytes or v_file.sha256 is distinct from p_sha256
      or v_file.status<>'awaiting_upload' or v_file.upload_expires_at<=now() then
      raise exception using errcode='40001',message='EVIDENCE_UPLOAD_CHANGED';
    end if;
  else
    if (select count(*) from private.rental_application_evidence_files f
      where f.application_id=v_packet.application_id and f.status not in ('purged','removed')
        and (f.status<>'awaiting_upload' or f.upload_expires_at>now()))>=9 then
      raise exception using errcode='23514',message='EVIDENCE_UPLOAD_LIMIT';
    end if;
    insert into private.rental_application_evidence_files(id,organization_id,application_id,uploader_user_id,
      document_type,object_key,content_type,size_bytes,sha256)
    values(p_file_id,v_packet.organization_id,v_packet.application_id,auth.uid(),p_document_type,
      format('%s/%s/%s',v_packet.organization_id,v_packet.application_id,p_file_id),p_content_type,p_size_bytes,p_sha256)
    returning * into v_file;
  end if;
  return jsonb_build_object('id',v_file.id,'objectKey',v_file.object_key,'expiresAt',v_file.upload_expires_at);
end; $$;

create function private.can_write_rental_evidence_object(p_object_key text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from private.rental_application_evidence_files f
    join private.rental_application_evidence_packets e on e.application_id=f.application_id and e.organization_id=f.organization_id
    join public.rental_applications a on a.id=e.application_id and a.organization_id=e.organization_id and a.status='submitted'
    join public.organizations o on o.id=e.organization_id and o.status in ('trial','active')
    join private.rental_application_evidence_policies p on p.id=e.policy_id and p.enabled
    join auth.users u on u.id=(select auth.uid()) and u.email_confirmed_at is not null and lower(trim(u.email))=lower(trim(a.email::text))
    where f.object_key=p_object_key and f.status='awaiting_upload' and f.upload_expires_at>now()
      and f.uploader_user_id=u.id and e.applicant_user_id=u.id and e.status in ('draft','changes_requested')
      and coalesce(auth.jwt()->>'aal','aal1')='aal2' and e.consent_at is not null
      and e.consent_version=p.notice_version and e.consent_sha256=encode(sha256(convert_to(p.notice_text,'UTF8')),'hex'))
$$;
revoke all on function private.can_write_rental_evidence_object(text) from public,anon,authenticated,service_role;
grant execute on function private.can_write_rental_evidence_object(text) to authenticated;
create policy rental_evidence_exact_upload on storage.objects for insert to authenticated
  with check (bucket_id='private-rental-evidence' and private.can_write_rental_evidence_object(name));

create function public.inspect_rental_application_evidence_upload(p_reference text,p_file_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_packet private.rental_application_evidence_packets%rowtype; v_file private.rental_application_evidence_files%rowtype;
begin
  v_packet:=private.lock_rental_evidence_packet(p_reference,true);
  select f.* into v_file from private.rental_application_evidence_files f where f.id=p_file_id
    and f.application_id=v_packet.application_id and f.uploader_user_id=auth.uid()
    and ((f.status='awaiting_upload' and f.upload_expires_at>now() and v_packet.status in ('draft','changes_requested'))
      or f.status in ('quarantined','scanning','clean','rejected'));
  if not found then raise exception using errcode='42501',message='EVIDENCE_UPLOAD_UNAVAILABLE'; end if;
  return jsonb_build_object('id',v_file.id,'objectKey',v_file.object_key,'contentType',v_file.content_type,
    'sizeBytes',v_file.size_bytes,'status',v_file.status,'sha256',v_file.sha256);
end; $$;

create function public.finish_rental_application_evidence_upload(p_actor_id uuid,p_file_id uuid,p_size_bytes integer,p_sha256 text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_file private.rental_application_evidence_files%rowtype;
begin
  select * into v_file from private.rental_application_evidence_files where id=p_file_id and uploader_user_id=p_actor_id;
  if not found or v_file.size_bytes is distinct from p_size_bytes or v_file.sha256 is distinct from p_sha256 then
    raise exception using errcode='42501',message='EVIDENCE_UPLOAD_INVALID';
  end if;
  perform 1 from public.rental_applications a join auth.users u on u.id=p_actor_id and u.email_confirmed_at is not null
    and lower(trim(u.email))=lower(trim(a.email::text)) where a.id=v_file.application_id and a.organization_id=v_file.organization_id
    and a.status='submitted' for update of a;
  if not found then raise exception using errcode='42501',message='EVIDENCE_UPLOAD_INVALID'; end if;
  perform 1 from private.rental_application_evidence_packets e
    join public.organizations o on o.id=e.organization_id and o.status in ('trial','active')
    join private.rental_application_evidence_policies p on p.id=e.policy_id and p.enabled
    where e.application_id=v_file.application_id and e.organization_id=v_file.organization_id
      and e.applicant_user_id=p_actor_id and e.status in ('draft','changes_requested') and e.consent_at is not null
      and e.consent_version=p.notice_version and e.consent_sha256=encode(sha256(convert_to(p.notice_text,'UTF8')),'hex')
    for update of e;
  if not found then raise exception using errcode='42501',message='EVIDENCE_UPLOAD_INVALID'; end if;
  update private.rental_application_evidence_files f set status='quarantined',next_scan_at=now()
    where f.id=p_file_id and f.status='awaiting_upload' and f.upload_expires_at>now() returning * into v_file;
  if not found then
    select * into v_file from private.rental_application_evidence_files where id=p_file_id
      and uploader_user_id=p_actor_id and status in ('quarantined','scanning','clean','rejected');
    if not found then raise exception using errcode='40001',message='EVIDENCE_UPLOAD_UNAVAILABLE'; end if;
  end if;
  return jsonb_build_object('id',v_file.id,'status',v_file.status);
end; $$;
revoke all on function public.finish_rental_application_evidence_upload(uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.finish_rental_application_evidence_upload(uuid,uuid,integer,text) to service_role;

create function public.remove_rental_application_evidence_upload(p_reference text,p_version integer,p_file_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_packet private.rental_application_evidence_packets%rowtype;
begin
  v_packet:=private.lock_rental_evidence_packet(p_reference,true);
  perform private.require_rental_evidence_editable(v_packet,p_version);
  update private.rental_application_evidence_files f set status='removed',remove_after=now(),claim_id=null,claim_until=null
    where f.id=p_file_id and f.application_id=v_packet.application_id and f.uploader_user_id=auth.uid()
      and f.status not in ('removed','purged');
  if found then
    update private.rental_application_evidence_packets set version=version+1,updated_at=now()
      where application_id=v_packet.application_id returning * into v_packet;
  end if;
  return private.rental_evidence_packet_dto(v_packet);
end; $$;

create function public.submit_rental_application_evidence(p_reference text,p_version integer,
  p_acknowledge_requirements_change boolean,p_current_requirements_version uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_packet private.rental_application_evidence_packets%rowtype; v_policy private.rental_application_evidence_policies%rowtype;
  v_current uuid; v_changed boolean; v_actor uuid:=private.require_recent_rental_evidence_mfa();
begin
  -- As with the initial application, hold the published listing version through confirmation.
  select (l.application_requirements->>'requirementsVersion')::uuid into v_current
  from public.rental_listings l join public.rental_applications a on a.listing_id=l.id and a.organization_id=l.organization_id
    join private.rental_application_evidence_packets e on e.application_id=a.id and e.applicant_user_id=v_actor
    where a.public_reference=p_reference for share of l;
  v_packet:=private.lock_rental_evidence_packet(p_reference,true);
  if v_packet.status='submitted' and v_packet.version=p_version+1 then return private.rental_evidence_packet_dto(v_packet); end if;
  perform private.require_rental_evidence_editable(v_packet,p_version);
  select * into strict v_policy from private.rental_application_evidence_policies where id=v_packet.policy_id;
  if v_packet.consent_version is distinct from v_policy.notice_version or v_packet.consent_at is null
    or v_packet.consent_sha256 is distinct from encode(sha256(convert_to(v_policy.notice_text,'UTF8')),'hex') then
    raise exception using errcode='42501',message='EVIDENCE_CONSENT_REQUIRED';
  end if;
  if exists(select 1 from private.rental_application_evidence_files f where f.application_id=v_packet.application_id
      and (f.status in ('quarantined','scanning','rejected') or (f.status='awaiting_upload' and f.upload_expires_at>now()))) then
    raise exception using errcode='23514',message='EVIDENCE_FILES_NOT_READY';
  end if;
  if exists(select 1 from (
      select jsonb_array_elements_text(v_packet.requirements->'requiredDocumentTypes') as kind
      union select unnest(v_packet.requested_document_types)
    ) r
      where not r.kind=any(v_packet.alternative_document_types)
        and not exists(select 1 from private.rental_application_evidence_files f where f.application_id=v_packet.application_id
          and f.document_type=r.kind and f.status='clean')) then
    raise exception using errcode='23514',message='EVIDENCE_REQUIREMENTS_INCOMPLETE';
  end if;
  v_changed:=v_current is distinct from (v_packet.requirements->>'requirementsVersion')::uuid;
  if v_changed and (p_acknowledge_requirements_change is distinct from true or p_current_requirements_version is distinct from v_current) then
    raise exception using errcode='40001',message='EVIDENCE_REQUIREMENTS_ACKNOWLEDGMENT_REQUIRED';
  end if;
  update private.rental_application_evidence_packets e set status='submitted',version=e.version+1,requested_document_types='{}',
    reviewed_version=null,updated_at=now(),acknowledged_current_requirements_version=case when v_changed then v_current end,
    requirements_change_acknowledged_at=case when v_changed then now() end
    where e.application_id=v_packet.application_id returning * into v_packet;
  perform private.record_rental_evidence_event(v_packet,'rental_application.evidence_submitted',true);
  return private.rental_evidence_packet_dto(v_packet);
end; $$;

create function private.lock_reviewed_rental_evidence(p_organization_id uuid,p_application_id uuid,p_unit_id uuid)
returns private.rental_application_evidence_packets
language plpgsql security definer set search_path='' as $$
declare v_packet private.rental_application_evidence_packets%rowtype; v_actor uuid:=private.require_recent_rental_evidence_mfa();
begin
  perform private.enter_organization_context(p_organization_id);
  perform 1 from public.rental_applications a where a.id=p_application_id and a.organization_id=p_organization_id
    and a.unit_id=p_unit_id and a.status in ('submitted','lease_preparation') for update;
  if not found then raise exception using errcode='42501',message='EVIDENCE_UNAVAILABLE'; end if;
  select e.* into v_packet from private.rental_application_evidence_packets e
    join public.rental_applications a on a.id=e.application_id and a.organization_id=e.organization_id
    join public.organizations o on o.id=e.organization_id and o.status in ('trial','active')
    join private.rental_application_evidence_policies p on p.id=e.policy_id and p.enabled and p.approved_at<=now()
    where e.application_id=p_application_id and e.organization_id=p_organization_id and a.unit_id=p_unit_id
      and a.status in ('submitted','lease_preparation') and a.verified_at is not null
      and e.reviewer_user_id=v_actor and e.applicant_user_id is distinct from v_actor
      and private.has_property_access(e.property_id,'lease.manage') and e.status in ('submitted','changes_requested','selected','declined')
    for update of e;
  if not found then raise exception using errcode='42501',message='EVIDENCE_UNAVAILABLE'; end if;
  return v_packet;
end; $$;
revoke all on function private.lock_reviewed_rental_evidence(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function public.get_rental_application_evidence_review(p_organization_id uuid,p_application_id uuid,p_unit_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_packet private.rental_application_evidence_packets%rowtype; v_app public.rental_applications%rowtype;
begin
  v_packet:=private.lock_reviewed_rental_evidence(p_organization_id,p_application_id,p_unit_id);
  select * into strict v_app from public.rental_applications where id=v_packet.application_id;
  if v_packet.status in ('declined','changes_requested') then
    return jsonb_build_object('status',v_packet.status,'version',v_packet.version);
  end if;
  perform private.record_rental_evidence_event(v_packet,'rental_application.evidence_review_opened',false);
  return private.rental_evidence_packet_dto(v_packet)||jsonb_build_object('reference',v_app.public_reference);
end; $$;

create function public.get_rental_application_evidence_worklist(p_organization_id uuid,p_unit_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform private.enter_organization_context(p_organization_id);
  return (select coalesce(jsonb_agg(jsonb_build_object('applicationId',e.application_id,'status',e.status,
        'reviewer',e.reviewer_user_id=(select auth.uid()))), '[]'::jsonb)
    from private.rental_application_evidence_packets e
    join public.rental_applications a on a.id=e.application_id and a.organization_id=e.organization_id
    where a.organization_id=p_organization_id and a.unit_id=p_unit_id and a.verified_at is not null
      and a.status in ('submitted','lease_preparation') and private.has_property_access(e.property_id,'lease.manage'));
end; $$;

create function public.review_rental_application_evidence(p_organization_id uuid,p_application_id uuid,p_unit_id uuid,
  p_version integer,p_action text,p_document_types text[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_packet private.rental_application_evidence_packets%rowtype; v_policy private.rental_application_evidence_policies%rowtype;
  v_required_types text[]; v_event text; v_next text;
begin
  v_packet:=private.lock_reviewed_rental_evidence(p_organization_id,p_application_id,p_unit_id);
  v_next:=case p_action when 'request_changes' then 'changes_requested' when 'select' then 'selected' when 'decline' then 'declined' end;
  if v_next is null or p_document_types is null or cardinality(p_document_types)>3 then
    raise exception using errcode='22023',message='EVIDENCE_REVIEW_INVALID';
  end if;
  if v_packet.status=v_next and v_packet.version=p_version+1 then
    if (v_next='changes_requested' and not (p_document_types <@ v_packet.requested_document_types and v_packet.requested_document_types <@ p_document_types))
      or (v_next='selected' and not (p_document_types <@ v_packet.reviewed_document_types and v_packet.reviewed_document_types <@ p_document_types)) then
      raise exception using errcode='40001',message='EVIDENCE_PACKET_CHANGED';
    end if;
    return jsonb_build_object('status',v_packet.status,'version',v_packet.version);
  end if;
  if v_packet.status<>'submitted' or v_packet.version is distinct from p_version then
    raise exception using errcode='40001',message='EVIDENCE_PACKET_CHANGED';
  end if;
  select * into strict v_policy from private.rental_application_evidence_policies where id=v_packet.policy_id;
  if not p_document_types <@ v_policy.allowed_document_types then
    raise exception using errcode='22023',message='EVIDENCE_REVIEW_INVALID';
  end if;
  v_required_types:=array(select jsonb_array_elements_text(v_packet.requirements->'requiredDocumentTypes'));
  if (p_action='select' and not v_required_types <@ p_document_types)
    or (p_action='request_changes' and cardinality(p_document_types)=0) then
    raise exception using errcode='23514',message='EVIDENCE_REVIEW_CHECKLIST_INCOMPLETE';
  end if;
  if p_action='decline' and ('credit_evidence'=any(v_required_types)
      or v_packet.self_reported_credit_score is not null
      or exists(select 1 from private.rental_application_evidence_files f where f.application_id=v_packet.application_id
        and f.document_type='credit_evidence' and f.status='clean')) then
    raise exception using errcode='23514',message='EVIDENCE_CREDIT_DECISION_REQUIRES_APPROVED_NOTICE_WORKFLOW';
  end if;
  if v_next='changes_requested' then
    update private.rental_application_evidence_files f
    set status='removed',remove_after=now(),claim_id=null,claim_until=null
    where f.organization_id=v_packet.organization_id and f.application_id=v_packet.application_id
      and f.document_type=any(p_document_types) and f.status not in ('removed','purged');
  end if;
  update private.rental_application_evidence_packets e set status=v_next,version=e.version+1,updated_at=now(),
    reviewed_version=case when v_next='selected' then e.version+1 end,
    reviewed_document_types=case when v_next='selected' then p_document_types else '{}'::text[] end,
    requested_document_types=case when v_next='changes_requested' then p_document_types else '{}'::text[] end,
    alternative_document_types=case when v_next='changes_requested'
      then array(select unnest(e.alternative_document_types) except select unnest(p_document_types))
      else e.alternative_document_types end,
    purge_after=case when v_next='declined' then now()+make_interval(days=>v_policy.terminal_retention_days) else e.purge_after end
  where e.application_id=v_packet.application_id returning * into v_packet;
  v_event:=case when v_next='changes_requested' then 'rental_application.evidence_changes_requested'
    else 'rental_application.evidence_review_completed' end;
  perform private.record_rental_evidence_event(v_packet,v_event,true);
  return jsonb_build_object('status',v_packet.status,'version',v_packet.version);
end; $$;

create function public.authorize_rental_evidence_file(p_reference text,p_organization_id uuid,p_application_id uuid,p_unit_id uuid,p_file_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_packet private.rental_application_evidence_packets%rowtype; v_file private.rental_application_evidence_files%rowtype;
begin
  if p_reference is not null and p_organization_id is null and p_application_id is null and p_unit_id is null then
    v_packet:=private.lock_rental_evidence_packet(p_reference,true);
  elsif p_reference is null and p_organization_id is not null and p_application_id is not null and p_unit_id is not null then
    v_packet:=private.lock_reviewed_rental_evidence(p_organization_id,p_application_id,p_unit_id);
  else raise exception using errcode='42501',message='EVIDENCE_UNAVAILABLE'; end if;
  if v_packet.status='declined' or (p_reference is null and v_packet.status='changes_requested') then
    raise exception using errcode='42501',message='EVIDENCE_UNAVAILABLE';
  end if;
  select * into v_file from private.rental_application_evidence_files f where f.id=p_file_id and f.status='clean'
    and f.application_id=v_packet.application_id and f.organization_id=v_packet.organization_id;
  if not found then raise exception using errcode='42501',message='EVIDENCE_UNAVAILABLE'; end if;
  perform private.record_rental_evidence_event(v_packet,'rental_application.evidence_file_access_authorized',false);
  return jsonb_build_object('objectKey',v_file.object_key,'contentType',v_file.content_type,'sizeBytes',v_file.size_bytes,'sha256',v_file.sha256);
end; $$;

do $$
declare v_signature text;
begin
  foreach v_signature in array array[
    'get_my_rental_application_evidence(text)',
    'bind_rental_application_evidence(text,text)',
    'save_rental_application_evidence_draft(text,integer,integer,text,date,text[],text,text)',
    'start_rental_application_evidence_upload(text,integer,uuid,text,text,integer,text)',
    'inspect_rental_application_evidence_upload(text,uuid)',
    'remove_rental_application_evidence_upload(text,integer,uuid)',
    'submit_rental_application_evidence(text,integer,boolean,uuid)',
    'get_rental_application_evidence_review(uuid,uuid,uuid)',
    'get_rental_application_evidence_worklist(uuid,uuid)',
    'review_rental_application_evidence(uuid,uuid,uuid,integer,text,text[])',
    'authorize_rental_evidence_file(text,uuid,uuid,uuid,uuid)'
  ] loop
    execute 'revoke all on function public.'||v_signature||' from public,anon,authenticated,service_role';
    execute 'grant execute on function public.'||v_signature||' to authenticated';
  end loop;
end; $$;

create function public.claim_rental_evidence_scan(p_claim_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_file private.rental_application_evidence_files%rowtype;
begin
  select f.* into v_file from private.rental_application_evidence_files f
    join private.rental_application_evidence_packets e on e.application_id=f.application_id and e.organization_id=f.organization_id
    join private.rental_application_evidence_policies p on p.id=e.policy_id and p.enabled
    join public.organizations o on o.id=e.organization_id and o.status in ('trial','active')
    where ((f.status='quarantined' and f.next_scan_at<=now()) or (f.status='scanning' and f.claim_until<=now()))
      and e.status in ('draft','changes_requested') order by f.next_scan_at,f.id limit 1 for update of f skip locked;
  if not found then return null; end if;
  if v_file.attempts>=4 then
    update private.rental_application_evidence_files set status='rejected',claim_id=null,claim_until=null where id=v_file.id;
    return null;
  end if;
  update private.rental_application_evidence_files set status='scanning',claim_id=p_claim_id,claim_until=now()+interval '3 minutes',
    attempts=attempts+1 where id=v_file.id;
  return jsonb_build_object('id',v_file.id,'objectKey',v_file.object_key,'sha256',v_file.sha256,'sizeBytes',v_file.size_bytes);
end; $$;

create function public.settle_rental_evidence_scan(p_claim_id uuid,p_file_id uuid,p_verdict text,p_observed_sha256 text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if p_verdict not in ('clean','infected','retry','invalid') or p_verdict is null then return false; end if;
  update private.rental_application_evidence_files f set claim_id=null,claim_until=null,next_scan_at=now()+interval '10 minutes',
    status=case when p_verdict='clean' and p_observed_sha256=f.sha256 then 'clean'
      when p_verdict='retry' and f.attempts<4 then 'quarantined' else 'rejected' end
    where f.id=p_file_id and f.status='scanning' and f.claim_id=p_claim_id and f.claim_until>now()
      and exists(select 1 from private.rental_application_evidence_packets e
        join private.rental_application_evidence_policies p on p.id=e.policy_id and p.enabled
        join public.organizations o on o.id=e.organization_id and o.status in ('trial','active')
        where e.application_id=f.application_id and e.organization_id=f.organization_id and e.status in ('draft','changes_requested'));
  return found;
end; $$;

revoke all on function public.claim_rental_evidence_scan(uuid),public.settle_rental_evidence_scan(uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.claim_rental_evidence_scan(uuid),public.settle_rental_evidence_scan(uuid,uuid,text,text)
  to service_role;

create function public.rental_evidence_available_for_access(p_access_token text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from private.rental_application_access x
    join public.rental_applications a on a.id=x.application_id and a.organization_id=x.organization_id
    join private.rental_application_evidence_packets e on e.application_id=a.id and e.organization_id=a.organization_id
    join private.rental_application_evidence_policies p on p.id=e.policy_id and p.enabled
    join public.organizations o on o.id=e.organization_id and o.status in ('trial','active')
    where x.token_hash=encode(sha256(convert_to(coalesce(p_access_token,''),'UTF8')),'hex')
      and x.expires_at>now() and a.status in ('submitted','lease_preparation') and e.status not in ('closed','declined'))
$$;
revoke all on function public.rental_evidence_available_for_access(text) from public,anon,authenticated;
grant execute on function public.rental_evidence_available_for_access(text) to service_role;

create function public.claim_rental_evidence_purge(p_claim_id uuid,p_limit integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_claims jsonb;
begin
  if p_claim_id is null or p_limit is null or p_limit not between 1 and 25 then
    raise exception using errcode='22023',message='INVALID_EVIDENCE_PURGE_LIMIT';
  end if;
  with expired as (
    select e.application_id from private.rental_application_evidence_packets e
      where e.legal_hold_at is null and e.purge_after<=now() and e.status in ('closed','declined')
        and (e.self_reported_credit_score is not null or cardinality(e.alternative_document_types)>0
          or cardinality(e.requested_document_types)>0)
      order by e.purge_after,e.application_id limit p_limit for update skip locked
  ) update private.rental_application_evidence_packets e set self_reported_credit_score=null,
    self_reported_score_source=null,self_reported_score_observed_on=null,
    alternative_document_types='{}',requested_document_types='{}',updated_at=now()
    from expired where e.application_id=expired.application_id;
  -- Never mark the metadata purged until the object deletion succeeds. Grace after expiry avoids
  -- fetching an object while a near-expiry upload is still finishing.
  with eligible as (
    select f.id from private.rental_application_evidence_files f
    join private.rental_application_evidence_packets e on e.application_id=f.application_id and e.organization_id=f.organization_id
    where e.legal_hold_at is null and f.status<>'purged' and (f.claim_until is null or f.claim_until<=now())
      and ((e.purge_after is not null and e.purge_after<=now() and e.status in ('closed','declined'))
        or (f.status='awaiting_upload' and f.upload_expires_at<=now()-interval '30 minutes')
        or (f.status='removed' and f.remove_after<=now()))
    order by f.id limit p_limit for update of f skip locked
  ), claimed as (
    update private.rental_application_evidence_files f set status='removed',claim_id=p_claim_id,claim_until=now()+interval '5 minutes',
      remove_after=coalesce(f.remove_after,now())
    from eligible where f.id=eligible.id returning f.id,f.object_key
  ) select coalesce(jsonb_agg(jsonb_build_object('id',id,'objectKey',object_key)), '[]'::jsonb) into v_claims from claimed;
  return v_claims;
end; $$;

create function public.complete_rental_evidence_purge(p_claim_id uuid,p_file_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare v_application_id uuid;
begin
  update private.rental_application_evidence_files f set status='purged',claim_id=null,claim_until=null,sha256=null
    where f.id=p_file_id and f.status='removed' and f.claim_id=p_claim_id and f.claim_until>now()
    returning f.application_id into v_application_id;
  if not found then return false; end if;
  update private.rental_application_evidence_packets e set self_reported_credit_score=null,
    self_reported_score_source=null,self_reported_score_observed_on=null,
    alternative_document_types='{}',requested_document_types='{}',updated_at=now()
    where e.application_id=v_application_id and e.legal_hold_at is null and e.purge_after<=now()
      and e.status in ('closed','declined')
      and not exists(select 1 from private.rental_application_evidence_files f where f.application_id=e.application_id and f.status<>'purged');
  return true;
end; $$;
revoke all on function public.claim_rental_evidence_purge(uuid,integer),public.complete_rental_evidence_purge(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.claim_rental_evidence_purge(uuid,integer),public.complete_rental_evidence_purge(uuid,uuid)
  to service_role;

commit;
