-- Multi-party agreements grant access to named signers independently of occupancy.
begin;

create table private.rental_agreements (
  id uuid primary key,
  organization_id uuid not null,
  property_id uuid not null,
  unit_id uuid not null,
  source_version_id uuid not null,
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  title text not null,
  property_label text not null,
  unit_label text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  issue_hash text not null,
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  status text not null default 'open' check (status in ('open','executed','declined','void')),
  closed_at timestamptz,
  closed_by uuid references auth.users(id) on delete restrict,
  evidence jsonb,
  evidence_sha256 text,
  foreign key (organization_id,property_id,unit_id) references public.units(organization_id,property_id,id) on delete restrict,
  foreign key (organization_id,source_version_id) references public.document_versions(organization_id,id) on delete restrict,
  check (expires_at>issued_at),
  check ((status='open')=(closed_at is null)),
  check ((status='executed')=(evidence is not null and evidence_sha256 is not null))
);

create index rental_agreements_org_issued_idx on private.rental_agreements(organization_id,issued_at desc,id);

create table private.rental_agreement_signers (
  agreement_id uuid not null references private.rental_agreements(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  participant_id uuid not null default gen_random_uuid() unique,
  capacity text not null check (capacity in ('landlord','lessee')),
  primary key (agreement_id,user_id)
);
create unique index rental_agreement_one_landlord on private.rental_agreement_signers(agreement_id) where capacity='landlord';
create index rental_agreement_signer_inbox on private.rental_agreement_signers(user_id,agreement_id);

create table private.rental_agreement_signatures (
  agreement_id uuid not null,
  user_id uuid not null,
  signed_name text not null check (length(signed_name) between 2 and 160),
  consent_version text not null,
  signed_at timestamptz not null,
  primary key (agreement_id,user_id),
  foreign key (agreement_id,user_id) references private.rental_agreement_signers(agreement_id,user_id) on delete restrict
);
revoke all on table private.rental_agreements,private.rental_agreement_signers,private.rental_agreement_signatures
  from public,anon,authenticated,service_role;

create function private.can_manage_rental_agreement(p_organization_id uuid,p_property_id uuid)
returns boolean
language sql stable
set search_path = ''
as $$
  select private.has_active_organization_membership(p_organization_id)
    and private.has_property_access(p_property_id,'documents.manage')
    and private.has_property_access(p_property_id,'lease.manage')
$$;
revoke all on function private.can_manage_rental_agreement(uuid,uuid) from public,anon,authenticated,service_role;

create function private.agreement_disclosure_version()
returns text language sql immutable set search_path = ''
as $$ select 'esign_consent@1.0.0#260463bcf84a7827'::text $$;
revoke all on function private.agreement_disclosure_version() from public,anon,authenticated,service_role;

create function private.is_agreement_actor_verified(p_actor_id uuid)
returns boolean language sql stable set search_path = ''
as $$
  select exists(select 1 from auth.users u where u.id=p_actor_id and u.email_confirmed_at is not null)
$$;
revoke all on function private.is_agreement_actor_verified(uuid) from public,anon,authenticated,service_role;

create function public.issue_rental_agreement(
  p_organization_id uuid,
  p_agreement_id uuid,
  p_unit_id uuid,
  p_document_version_id uuid,
  p_lessee_emails text[],
  p_valid_days integer,
  p_landlord_authority_confirmed boolean
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_unit public.units%rowtype;
  v_version public.document_versions%rowtype;
  v_document public.documents%rowtype;
  v_emails text[];
  v_signers uuid[];
  v_previous private.rental_agreements%rowtype;
  v_hash text;
  v_now timestamptz := clock_timestamp();
  v_label text;
begin
  perform private.enter_organization_context(p_organization_id);
  if p_agreement_id is null or p_unit_id is null or p_document_version_id is null
    or p_valid_days is null or p_valid_days not between 1 and 30
    or p_landlord_authority_confirmed is distinct from true
    or p_lessee_emails is null or cardinality(p_lessee_emails) not between 1 and 8 then
    raise exception using errcode='22023',message='INVALID_AGREEMENT_PARTIES';
  end if;
  if coalesce(auth.jwt()->>'aal','aal1')<>'aal2' then
    raise exception using errcode='42501',message='MFA_REQUIRED';
  end if;

  select array_agg(distinct lower(trim(email)) order by lower(trim(email))) into v_emails
  from unnest(p_lessee_emails) p(email)
  where email is not null and length(trim(email)) between 3 and 254 and position('@' in email)>1;
  if cardinality(p_lessee_emails) is distinct from cardinality(v_emails) then
    raise exception using errcode='22023',message='INVALID_AGREEMENT_PARTIES';
  end if;

  select * into v_unit from public.units u
    where u.id=p_unit_id and u.organization_id=p_organization_id for share;
  if not found or not private.can_manage_rental_agreement(p_organization_id,v_unit.property_id)
    or not private.is_agreement_actor_verified(v_actor)
    or not exists (
      select 1 from public.organization_memberships m
      where m.organization_id=p_organization_id and m.user_id=v_actor and m.status='active'
        and m.role_code='org_owner' and m.starts_at<=v_now and (m.ends_at is null or m.ends_at>v_now)
    ) then
    raise exception using errcode='42501',message='AGREEMENT_ISSUE_FORBIDDEN';
  end if;

  v_hash := encode(sha256(convert_to(jsonb_build_object(
    'unitId',p_unit_id,'versionId',p_document_version_id,'lessees',v_emails,'validDays',p_valid_days
  )::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended('rental-agreement-issue:'||p_agreement_id::text,0));
  select * into v_previous from private.rental_agreements a where a.id=p_agreement_id;
  if found then
    if v_previous.organization_id is distinct from p_organization_id or v_previous.created_by is distinct from v_actor
      or v_previous.issue_hash is distinct from v_hash then
      raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object('agreementId',p_agreement_id,'status',v_previous.status,'replayed',true);
  end if;

  select * into v_version from public.document_versions v
    where v.id=p_document_version_id and v.organization_id=p_organization_id for share;
  if not found or v_version.upload_status<>'clean' or v_version.storage_bucket<>'private-documents'
    or v_version.mime_type<>'application/pdf' then
    raise exception using errcode='23514',message='AGREEMENT_SOURCE_UNAVAILABLE';
  end if;
  select * into v_document from public.documents d where d.id=v_version.document_id for share;
  if not found or v_document.status<>'active' or v_document.document_type<>'rental_agreement_source'
    or v_document.tenancy_id is not null or v_document.property_id is distinct from v_unit.property_id
    or (v_document.unit_id is not null and v_document.unit_id<>v_unit.id) or v_unit.operational_status<>'active' then
    raise exception using errcode='23514',message='AGREEMENT_SOURCE_UNAVAILABLE';
  end if;
  select p.name into strict v_label from public.properties p
    where p.id=v_unit.property_id and p.organization_id=p_organization_id;

  select array_agg(candidate.id order by candidate.id) into v_signers
  from (
    select u.id from auth.users u
    where lower(u.email)=any(v_emails) and u.email_confirmed_at is not null and u.id<>v_actor
    order by u.id for share
  ) candidate;
  if cardinality(v_signers) is distinct from cardinality(v_emails) or exists (
    select 1 from unnest(v_emails) p(email) where
      (select count(*) from auth.users u where lower(u.email)=p.email and u.email_confirmed_at is not null and u.id<>v_actor)<>1
  ) then
    raise exception using errcode='23514',message='AGREEMENT_SIGNERS_UNAVAILABLE';
  end if;

  insert into private.rental_agreements(
    id,organization_id,property_id,unit_id,source_version_id,source_sha256,title,property_label,unit_label,
    created_by,issue_hash,issued_at,expires_at
  ) values (
    p_agreement_id,p_organization_id,v_unit.property_id,v_unit.id,v_version.id,lower(v_version.sha256_hex),
    v_document.title,v_label,v_unit.unit_code,v_actor,v_hash,v_now,v_now+make_interval(days=>p_valid_days)
  );
  insert into private.rental_agreement_signers(agreement_id,user_id,capacity)
    values (p_agreement_id,v_actor,'landlord');
  insert into private.rental_agreement_signers(agreement_id,user_id,capacity)
    select p_agreement_id,lessee,'lessee' from unnest(v_signers) s(lessee);
  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
    values (p_organization_id,v_actor,'user','rental_agreement.issued','rental_agreement',p_agreement_id,p_agreement_id,
      jsonb_build_object('sourceVersionId',v_version.id,'unitId',v_unit.id,'requiredCount',cardinality(v_signers)+1,'landlordAuthorityConfirmed',true));
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
    values (p_organization_id,'rental_agreement.issued','rental_agreement',p_agreement_id,p_agreement_id,
      jsonb_build_object('agreementId',p_agreement_id,'unitId',v_unit.id));
  return jsonb_build_object('agreementId',p_agreement_id,'status','open','replayed',false);
end
$$;
revoke all on function public.issue_rental_agreement(uuid,uuid,uuid,uuid,text[],integer,boolean) from public,anon,service_role;
grant execute on function public.issue_rental_agreement(uuid,uuid,uuid,uuid,text[],integer,boolean) to authenticated;

create function private.agreement_visible_to_actor(p_agreement_id uuid,p_organization_id uuid)
returns private.rental_agreements
language plpgsql
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_agreement private.rental_agreements%rowtype;
begin
  if not private.is_agreement_actor_verified(v_actor) then
    raise exception using errcode='42501',message='AGREEMENT_FORBIDDEN';
  end if;
  if p_organization_id is not null then perform private.enter_organization_context(p_organization_id); end if;
  select * into v_agreement from private.rental_agreements a
  where a.id=p_agreement_id and (
    (p_organization_id is not null and a.organization_id=p_organization_id
      and private.can_manage_rental_agreement(a.organization_id,a.property_id))
    or (p_organization_id is null and exists (
      select 1 from private.rental_agreement_signers s where s.agreement_id=a.id and s.user_id=v_actor
    ))
  );
  if not found then raise exception using errcode='42501',message='AGREEMENT_FORBIDDEN'; end if;
  return v_agreement;
end
$$;
revoke all on function private.agreement_visible_to_actor(uuid,uuid) from public,anon,authenticated,service_role;

create function private.rental_agreement_summary(a private.rental_agreements)
returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'agreementId',a.id,'sourceVersionId',a.source_version_id,'sourceSha256',a.source_sha256,
    'title',a.title,'propertyLabel',a.property_label,'unitLabel',a.unit_label,'issuedAt',a.issued_at,'expiresAt',a.expires_at,
    'status',case when a.status='open' and a.expires_at<=statement_timestamp() then 'expired' else a.status end,
    'requiredCount',count(s.user_id),'signedCount',count(sig.user_id),
    'myCapacity',max(s.capacity) filter (where s.user_id=auth.uid()),
    'iSigned',count(sig.user_id) filter (where sig.user_id=auth.uid())>0
  )
  from private.rental_agreement_signers s
  left join private.rental_agreement_signatures sig on sig.agreement_id=s.agreement_id and sig.user_id=s.user_id
  where s.agreement_id=a.id
$$;
revoke all on function private.rental_agreement_summary(private.rental_agreements) from public,anon,authenticated,service_role;

create function public.list_rental_agreements(p_organization_id uuid default null)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare v_actor uuid := auth.uid();
begin
  if not private.is_agreement_actor_verified(v_actor) then
    raise exception using errcode='42501',message='AGREEMENT_FORBIDDEN';
  end if;
  if p_organization_id is not null then perform private.enter_organization_context(p_organization_id); end if;
  return (
    select coalesce(jsonb_agg(private.rental_agreement_summary(a.envelope) order by a.issued_at desc,a.id),'[]'::jsonb)
    from (
      select a as envelope,a.issued_at,a.id from private.rental_agreements a
      where
        (p_organization_id is not null and a.organization_id=p_organization_id
          and private.can_manage_rental_agreement(a.organization_id,a.property_id))
        or (p_organization_id is null and exists (
          select 1 from private.rental_agreement_signers s where s.agreement_id=a.id and s.user_id=v_actor
        ))
      order by a.issued_at desc,a.id
      limit 100
    ) a
  );
end
$$;
revoke all on function public.list_rental_agreements(uuid) from public,anon,service_role;
grant execute on function public.list_rental_agreements(uuid) to authenticated;

create function public.get_rental_agreement(p_agreement_id uuid,p_organization_id uuid default null)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare v_agreement private.rental_agreements%rowtype;
begin
  v_agreement := private.agreement_visible_to_actor(p_agreement_id,p_organization_id);
  return private.rental_agreement_summary(v_agreement);
end
$$;
revoke all on function public.get_rental_agreement(uuid,uuid) from public,anon,service_role;
grant execute on function public.get_rental_agreement(uuid,uuid) to authenticated;

create function public.get_rental_agreement_artifacts(p_agreement_id uuid,p_organization_id uuid default null)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_agreement private.rental_agreements%rowtype;
  v_source jsonb;
begin
  v_agreement := private.agreement_visible_to_actor(p_agreement_id,p_organization_id);
  select jsonb_build_object('bucket',v.storage_bucket,'path',v.storage_path,'filename',v.original_filename,
    'versionId',v.id,'sha256',lower(v.sha256_hex))
  into v_source from public.document_versions v join public.documents d on d.id=v.document_id and d.organization_id=v.organization_id
  where v.id=v_agreement.source_version_id and v.organization_id=v_agreement.organization_id
    and v.storage_bucket='private-documents' and v.upload_status='clean' and lower(v.sha256_hex)=v_agreement.source_sha256
    and (
      v_agreement.status='executed'
      or (v_agreement.status='open' and v_agreement.expires_at>clock_timestamp() and d.status='active')
    );
  return jsonb_build_object('source',v_source,'evidenceText',v_agreement.evidence::text,'evidenceSha256',v_agreement.evidence_sha256);
end
$$;
revoke all on function public.get_rental_agreement_artifacts(uuid,uuid) from public,anon,service_role;
grant execute on function public.get_rental_agreement_artifacts(uuid,uuid) to authenticated;

create function public.sign_rental_agreement(
  p_verified_actor_id uuid,p_agreement_id uuid,p_source_version_id uuid,p_source_sha256 text,
  p_signed_name text,p_consent_version text,p_agreed boolean,p_intent_confirmed boolean
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_agreement private.rental_agreements%rowtype;
  v_signer private.rental_agreement_signers%rowtype;
  v_existing private.rental_agreement_signatures%rowtype;
  v_now timestamptz;
  v_evidence jsonb;
  v_digest text;
begin
  if not private.is_agreement_actor_verified(p_verified_actor_id) then
    raise exception using errcode='42501',message='AGREEMENT_FORBIDDEN';
  end if;
  select * into v_signer from private.rental_agreement_signers s
  where s.agreement_id=p_agreement_id and s.user_id=p_verified_actor_id;
  if not found then raise exception using errcode='42501',message='AGREEMENT_FORBIDDEN'; end if;
  if p_agreed is distinct from true or p_intent_confirmed is distinct from true
    or p_signed_name is null or length(trim(p_signed_name)) not between 2 and 160 then
    raise exception using errcode='22023',message='AGREEMENT_SIGNATURE_INVALID';
  end if;

  select * into strict v_agreement from private.rental_agreements a where a.id=p_agreement_id for update;
  if v_agreement.source_version_id is distinct from p_source_version_id
    or v_agreement.source_sha256 is distinct from p_source_sha256 then
    raise exception using errcode='23514',message='AGREEMENT_SOURCE_CHANGED';
  end if;
  select * into v_existing from private.rental_agreement_signatures sig
    where sig.agreement_id=p_agreement_id and sig.user_id=p_verified_actor_id;
  if found then
    if v_existing.signed_name is distinct from trim(p_signed_name) or v_existing.consent_version is distinct from p_consent_version then
      raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object('agreementId',p_agreement_id,'status',v_agreement.status,'signedAt',v_existing.signed_at,'replayed',true);
  end if;
  if p_consent_version is distinct from private.agreement_disclosure_version() then
    raise exception using errcode='23514',message='AGREEMENT_DISCLOSURE_CHANGED';
  end if;
  if v_agreement.status<>'open' or v_agreement.expires_at<=clock_timestamp() then
    raise exception using errcode='23514',message='AGREEMENT_NOT_OPEN';
  end if;

  -- An issued pre-tenancy agreement carries no apartment or finance access. The current active
  -- landlord retains authority until the package closes. Signers bind only the exact clean source.
  perform 1 from public.organization_memberships m
  where m.organization_id=v_agreement.organization_id and m.user_id=v_agreement.created_by
    and m.status='active' and m.role_code='org_owner' and m.starts_at<=clock_timestamp()
    and (m.ends_at is null or m.ends_at>clock_timestamp())
  for share;
  if not found then raise exception using errcode='23514',message='AGREEMENT_LANDLORD_UNAVAILABLE'; end if;
  perform 1 from public.document_versions v join public.documents d on d.id=v.document_id and d.organization_id=v.organization_id
  where v.id=v_agreement.source_version_id and v.organization_id=v_agreement.organization_id
    and d.status='active' and v.storage_bucket='private-documents' and v.upload_status='clean'
    and lower(v.sha256_hex)=v_agreement.source_sha256
  for share of v,d;
  if not found then raise exception using errcode='23514',message='AGREEMENT_SOURCE_UNAVAILABLE'; end if;
  v_now := clock_timestamp();
  if v_agreement.expires_at<=v_now then raise exception using errcode='23514',message='AGREEMENT_NOT_OPEN'; end if;

  insert into private.rental_agreement_signatures(agreement_id,user_id,signed_name,consent_version,signed_at)
    values (p_agreement_id,p_verified_actor_id,trim(p_signed_name),p_consent_version,v_now);
  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
    values (v_agreement.organization_id,p_verified_actor_id,'user','rental_agreement.signed','rental_agreement',p_agreement_id,p_agreement_id,
      jsonb_build_object('participantId',v_signer.participant_id,'capacity',v_signer.capacity,'sourceVersionId',v_agreement.source_version_id));

  if not exists (
    select 1 from private.rental_agreement_signers s where s.agreement_id=p_agreement_id and not exists (
      select 1 from private.rental_agreement_signatures sig where sig.agreement_id=s.agreement_id and sig.user_id=s.user_id
    )
  ) then
    select jsonb_build_object(
      'schemaVersion',1,'agreementId',p_agreement_id,'unitId',v_agreement.unit_id,
      'title',v_agreement.title,'propertyLabel',v_agreement.property_label,'unitLabel',v_agreement.unit_label,
      'sourceVersionId',v_agreement.source_version_id,'sourceSha256',v_agreement.source_sha256,
      'issuedAt',v_agreement.issued_at,'executedAt',v_now,
      'intent','I have read and agree to this document, and I intend my electronic signature to bind me to it.',
      'signatures',jsonb_agg(jsonb_build_object(
        'participantId',s.participant_id,'capacity',s.capacity,'name',sig.signed_name,
        'consentVersion',sig.consent_version,'signedAt',sig.signed_at
      ) order by sig.signed_at,s.participant_id)
    ) into v_evidence
    from private.rental_agreement_signers s
    join private.rental_agreement_signatures sig on sig.agreement_id=s.agreement_id and sig.user_id=s.user_id
    where s.agreement_id=p_agreement_id;
    v_digest := encode(sha256(convert_to(v_evidence::text,'UTF8')),'hex');
    update private.rental_agreements set status='executed',closed_at=v_now,closed_by=p_verified_actor_id,
      evidence=v_evidence,evidence_sha256=v_digest where id=p_agreement_id
      returning * into v_agreement;
    insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
      values (v_agreement.organization_id,p_verified_actor_id,'user','rental_agreement.executed','rental_agreement',p_agreement_id,p_agreement_id,
        jsonb_build_object('sourceVersionId',v_agreement.source_version_id,'evidenceSha256',v_digest));
    insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
      values (v_agreement.organization_id,'rental_agreement.executed','rental_agreement',p_agreement_id,p_agreement_id,
        jsonb_build_object('agreementId',p_agreement_id,'unitId',v_agreement.unit_id,'evidenceSha256',v_digest));
  end if;
  return jsonb_build_object('agreementId',p_agreement_id,'status',v_agreement.status,'signedAt',v_now,'replayed',false);
end
$$;
revoke all on function public.sign_rental_agreement(uuid,uuid,uuid,text,text,text,boolean,boolean) from public,anon,authenticated;
grant execute on function public.sign_rental_agreement(uuid,uuid,uuid,text,text,text,boolean,boolean) to service_role;

create function public.close_pending_rental_agreement(p_agreement_id uuid,p_action text,p_organization_id uuid default null)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_agreement private.rental_agreements%rowtype;
  v_event text;
begin
  if p_action is null or p_action not in ('void','declined')
    or (p_action='void' and p_organization_id is null)
    or (p_action='declined' and p_organization_id is not null) then
    raise exception using errcode='22023',message='AGREEMENT_ACTION_INVALID';
  end if;
  if p_action='void' and coalesce(auth.jwt()->>'aal','aal1')<>'aal2' then
    raise exception using errcode='42501',message='MFA_REQUIRED';
  end if;
  v_agreement := private.agreement_visible_to_actor(p_agreement_id,p_organization_id);
  if p_action='declined' and not exists (
    select 1 from private.rental_agreement_signers s
    where s.agreement_id=p_agreement_id and s.user_id=v_actor and s.capacity='lessee'
  ) then raise exception using errcode='42501',message='AGREEMENT_FORBIDDEN'; end if;
  select * into strict v_agreement from private.rental_agreements a where a.id=v_agreement.id for update;
  if v_agreement.status=p_action and v_agreement.closed_by=v_actor then
    return jsonb_build_object('agreementId',p_agreement_id,'status',p_action,'replayed',true);
  end if;
  if v_agreement.status<>'open' or (p_action='declined' and (
    v_agreement.expires_at<=clock_timestamp() or exists (
      select 1 from private.rental_agreement_signatures sig where sig.agreement_id=p_agreement_id and sig.user_id=v_actor
    )
  )) then raise exception using errcode='23514',message='AGREEMENT_NOT_OPEN'; end if;
  update private.rental_agreements set status=p_action,closed_by=v_actor,closed_at=clock_timestamp() where id=p_agreement_id;
  v_event := 'rental_agreement.'||p_action;
  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
    values (v_agreement.organization_id,v_actor,'user',v_event,'rental_agreement',p_agreement_id,p_agreement_id,jsonb_build_object('status',p_action));
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
    values (v_agreement.organization_id,v_event,'rental_agreement',p_agreement_id,p_agreement_id,jsonb_build_object('agreementId',p_agreement_id));
  return jsonb_build_object('agreementId',p_agreement_id,'status',p_action,'replayed',false);
end
$$;
revoke all on function public.close_pending_rental_agreement(uuid,text,uuid) from public,anon,service_role;
grant execute on function public.close_pending_rental_agreement(uuid,text,uuid) to authenticated;

commit;
