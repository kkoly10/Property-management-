begin;

alter table private.rental_agreement_application_links
  add column approved_setup_revision integer check (approved_setup_revision>0),
  add column approved_terms_sha256 text check (approved_terms_sha256 ~ '^[a-f0-9]{64}$'),
  add column approved_currency text check (approved_currency in ('USD','CAD','MXN')),
  add constraint application_agreement_approved_terms_pair
    check ((approved_setup_revision is null)=(approved_terms_sha256 is null)
      and (approved_currency is null)=(approved_terms_sha256 is null));

create table private.rental_agreement_signer_claims (
  agreement_id uuid primary key references private.rental_agreement_application_links(agreement_id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  expected_email text not null,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  claimed_by uuid references auth.users(id) on delete restrict,
  claimed_at timestamptz,
  last_auth_requested_at timestamptz,
  notification_job_id uuid not null references private.notification_jobs(id) on delete restrict,
  check ((claimed_by is null)=(claimed_at is null))
);
alter table private.rental_agreement_signer_claims enable row level security;
revoke all on private.rental_agreement_signer_claims from public,anon,authenticated,service_role;

create function private.application_agreement_terms_digest(p_draft jsonb)
returns text language sql immutable set search_path='' as $$
  select encode(sha256(convert_to((p_draft-'documentVersionId'-'upload')::text,'UTF8')),'hex')
$$;
revoke all on function private.application_agreement_terms_digest(jsonb) from public,anon,authenticated,service_role;

-- Keep the exact terms immutable across signing and activation. Selecting
-- the filed PDF is permitted; editing terms requires voiding and reissuing.
create function private.guard_application_agreement_draft()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_link private.rental_agreement_application_links%rowtype;
  v_agreement private.rental_agreements%rowtype;
begin
  select l.* into v_link from private.rental_agreement_application_links l
    join private.rental_agreements a on a.id=l.agreement_id
  where l.setup_id=new.id and l.organization_id=new.organization_id and l.approved_terms_sha256 is not null
    and (a.status='executed' or (a.status='open' and a.expires_at>clock_timestamp()))
  order by a.issued_at desc limit 1;
  if not found then return new; end if;
  select * into strict v_agreement from private.rental_agreements where id=v_link.agreement_id;
  if private.application_agreement_terms_digest(new.draft) is distinct from v_link.approved_terms_sha256
    or (coalesce(new.draft->>'documentVersionId','') not in ('',v_agreement.source_version_id::text))
    or (exists(select 1 from private.rental_agreement_filings f where f.agreement_id=v_agreement.id)
      and new.draft->>'documentVersionId' is distinct from v_agreement.source_version_id::text)
    or (new.draft->'upload' is distinct from 'null'::jsonb) then
    raise exception using errcode='23514',message='APPLICATION_AGREEMENT_TERMS_LOCKED';
  end if;
  if new.status='activated' and old.status<>'activated' then
    perform private.assert_rental_application_evidence_ready(new.organization_id,new.source_rental_application_id);
    if new.result->>'currency' is distinct from v_link.approved_currency then
      raise exception using errcode='23514',message='APPLICATION_AGREEMENT_TERMS_LOCKED';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_application_agreement_draft() from public,anon,authenticated,service_role;
create trigger guard_application_agreement_draft before update of draft,status on private.homeowner_lease_setups
  for each row when (new.draft is distinct from old.draft or new.status is distinct from old.status)
  execute function private.guard_application_agreement_draft();

create function private.select_filed_application_agreement()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_link private.rental_agreement_application_links%rowtype;
  v_agreement private.rental_agreements%rowtype;
begin
  select * into v_link from private.rental_agreement_application_links l where l.agreement_id=new.agreement_id;
  if not found or v_link.approved_terms_sha256 is null then return new; end if;
  select * into strict v_agreement from private.rental_agreements a where a.id=new.agreement_id;
  update private.homeowner_lease_setups s
    set draft=jsonb_set(s.draft,'{documentVersionId}',to_jsonb(v_agreement.source_version_id::text)),
      revision=s.revision+1,updated_at=clock_timestamp()
  where s.id=v_link.setup_id and s.organization_id=new.organization_id
    and s.source_rental_application_id=v_link.application_id and s.status='draft'
    and private.application_agreement_terms_digest(s.draft)=v_link.approved_terms_sha256;
  if not found then raise exception using errcode='23514',message='APPLICATION_AGREEMENT_TERMS_LOCKED'; end if;
  return new;
end;
$$;
revoke all on function private.select_filed_application_agreement() from public,anon,authenticated,service_role;
create trigger select_filed_application_agreement after insert on private.rental_agreement_filings
  for each row execute function private.select_filed_application_agreement();

create function private.guard_application_agreement_pdf_replacement()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.documents d where d.organization_id=new.organization_id and d.id=new.document_id for no key update;
  if exists(select 1 from private.rental_agreement_application_links l
    join private.rental_agreements a on a.id=l.agreement_id
    join public.document_versions v on v.id=a.source_version_id and v.organization_id=a.organization_id
    where a.organization_id=new.organization_id and v.document_id=new.document_id and l.approved_terms_sha256 is not null
      and (a.status='executed' or (a.status='open' and a.expires_at>clock_timestamp()))) then
    raise exception using errcode='23514',message='APPLICATION_AGREEMENT_PDF_LOCKED';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_application_agreement_pdf_replacement() from public,anon,authenticated,service_role;
create trigger guard_application_agreement_pdf_replacement before insert on public.document_versions
  for each row when (new.version_number>1)
  execute function private.guard_application_agreement_pdf_replacement();

create function private.guard_linked_agreement_source_reuse()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from private.rental_agreements a
    join private.rental_agreement_application_links l on l.agreement_id=a.id and l.organization_id=a.organization_id
    where a.organization_id=new.organization_id and a.source_version_id=new.source_version_id
      and l.approved_terms_sha256 is not null
      and (a.status='executed' or (a.status='open' and a.expires_at>clock_timestamp()))) then
    raise exception using errcode='23514',message='AGREEMENT_SOURCE_UNAVAILABLE';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_linked_agreement_source_reuse() from public,anon,authenticated,service_role;
create trigger guard_linked_agreement_source_reuse before insert on private.rental_agreements
  for each row execute function private.guard_linked_agreement_source_reuse();

create function public.send_rental_application_agreement(
  p_organization_id uuid,p_application_id uuid,p_setup_id uuid,p_expected_application_version integer,
  p_expected_setup_revision integer,p_agreement_id uuid,p_document_version_id uuid,p_valid_days integer,
  p_landlord_authority_confirmed boolean,p_terms_confirmed boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid();
  v_app public.rental_applications%rowtype;
  v_setup private.homeowner_lease_setups%rowtype;
  v_unit public.units%rowtype;
  v_version public.document_versions%rowtype;
  v_document public.documents%rowtype;
  v_existing private.rental_agreement_application_links%rowtype;
  v_prior private.rental_agreements%rowtype;
  v_email text;
  v_recipient uuid;
  v_required jsonb;
  v_digest text;
  v_hash text;
  v_token text;
  v_expiry timestamptz;
  v_now timestamptz;
  v_job uuid;
  v_local date;
  v_start date;
  v_end date;
  v_due date;
  v_currency text;
  v_locale text;
  v_property_name text;
begin
  perform private.enter_organization_context(p_organization_id);
  if coalesce(auth.jwt()->>'aal','aal1')<>'aal2' then raise exception using errcode='42501',message='MFA_REQUIRED'; end if;
  if p_agreement_id is null or p_setup_id is null or p_document_version_id is null or p_valid_days is null
    or p_valid_days not between 1 and 30 or coalesce(p_expected_application_version,0)<1 or coalesce(p_expected_setup_revision,0)<1
    or p_landlord_authority_confirmed is distinct from true or p_terms_confirmed is distinct from true then
    raise exception using errcode='22023',message='INVALID_APPLICATION_SIGNING_SETUP';
  end if;
  v_setup:=private.require_application_signing_setup(p_organization_id,p_application_id);
  select * into strict v_unit from public.units u where u.id=v_setup.unit_id and u.organization_id=p_organization_id for update;
  select * into strict v_app from public.rental_applications a where a.id=p_application_id for update;
  v_setup:=private.require_application_signing_setup(p_organization_id,p_application_id);
  v_hash:=encode(sha256(convert_to(jsonb_build_array(p_application_id,p_setup_id,p_expected_application_version,
    p_expected_setup_revision,p_document_version_id,p_valid_days)::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended('rental-agreement-issue:'||p_agreement_id::text,0));
  select * into v_prior from private.rental_agreements a where a.id=p_agreement_id;
  if found then
    select * into v_existing from private.rental_agreement_application_links l where l.agreement_id=p_agreement_id;
    if v_prior.organization_id is distinct from p_organization_id or v_prior.created_by is distinct from v_actor
      or v_prior.issue_hash is distinct from v_hash or v_existing.application_id is distinct from p_application_id then
      raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object('agreementId',p_agreement_id,'status',v_prior.status,'replayed',true);
  end if;
  if v_setup.id<>p_setup_id or v_app.version<>p_expected_application_version or v_setup.revision<>p_expected_setup_revision then
    raise exception using errcode='40001',message='APPLICATION_SIGNING_SETUP_CHANGED';
  end if;
  perform private.assert_rental_application_evidence_ready(p_organization_id,p_application_id);
  if exists(select 1 from private.rental_agreement_application_links l join private.rental_agreements a on a.id=l.agreement_id
    where l.setup_id=p_setup_id and (a.status='executed' or (a.status='open' and a.expires_at>clock_timestamp()))) then
    raise exception using errcode='23505',message='APPLICATION_AGREEMENT_ALREADY_OPEN';
  end if;

  select (clock_timestamp() at time zone p.time_zone)::date,b.functional_currency_code,p.name,o.default_locale
  into strict v_local,v_currency,v_property_name,v_locale
  from public.properties p join public.accounting_books b on b.id=p.accounting_book_id and b.organization_id=p.organization_id
  join public.organizations o on o.id=p.organization_id
  where p.id=v_app.property_id and p.organization_id=p_organization_id and p.archived_at is null and p.status<>'archived' and b.status='open';
  begin
    v_start:=(v_setup.draft->>'startDate')::date;
    v_end:=nullif(v_setup.draft->>'endDate','')::date;
    v_due:=(v_setup.draft->>'firstChargeDueDate')::date;
  exception when data_exception then
    raise exception using errcode='22023',message='APPLICATION_AGREEMENT_TERMS_INVALID';
  end;
  v_email:=lower(trim(v_app.email::text));
  select coalesce(jsonb_agg(lower(trim(m->>'email'))),'[]'::jsonb) into v_required
    from jsonb_array_elements(v_setup.draft->'members') m where m->'financiallyResponsible'='true'::jsonb;
  if v_start is null or not isfinite(v_start) or v_due is null or not isfinite(v_due)
    or (v_end is not null and (not isfinite(v_end) or v_end<v_start or v_due>v_end))
    or v_due<greatest(v_start,v_local) or v_start<=v_local or v_setup.draft->>'occupancy'<>'future'
    or coalesce(v_setup.draft->>'rentAmount','') !~ '^[0-9]{1,14}([.][0-9]{1,2})?$'
    or coalesce(v_setup.draft->>'openingBalance','') !~ '^-?[0-9]{1,14}([.][0-9]{1,2})?$'
    or (v_setup.draft->>'rentAmount')::numeric*100>9007199254740991
    or abs((v_setup.draft->>'openingBalance')::numeric*100)>9007199254740991
    or (v_setup.draft->>'rentFrequency') not in ('weekly','biweekly','monthly','quarterly','semiannual','annual')
    or length(trim(coalesce(v_setup.draft->>'householdName',''))) not between 1 and 160
    or v_required is distinct from jsonb_build_array(v_email)
    or v_setup.draft->'upload' is distinct from 'null'::jsonb
    or coalesce(v_setup.draft->>'documentVersionId','')<>'' then
    raise exception using errcode='22023',message='APPLICATION_AGREEMENT_TERMS_INVALID';
  end if;
  if exists(select 1 from public.tenancies t where t.organization_id=p_organization_id and t.unit_id=v_unit.id
    and t.status in ('scheduled','active','notice_given','move_out_in_progress')
    and daterange(t.possession_start,t.possession_end,'[]')&&daterange(v_start,v_end,'[]')) then
    raise exception using errcode='23P01',message='APPLICATION_AGREEMENT_TERM_UNAVAILABLE';
  end if;

  select * into v_version from public.document_versions v where v.id=p_document_version_id and v.organization_id=p_organization_id;
  select * into v_document from public.documents d where d.id=v_version.document_id and d.organization_id=p_organization_id for no key update;
  select * into v_version from public.document_versions v where v.id=p_document_version_id
    and v.organization_id=p_organization_id and v.document_id=v_document.id for share;
  if not found or v_version.upload_status<>'clean' or v_version.storage_bucket<>'private-documents'
    or v_version.mime_type<>'application/pdf' or lower(v_version.sha256_hex) !~ '^[a-f0-9]{64}$'
    or v_document.status<>'active' or v_document.document_type<>'rental_agreement_source' or v_document.tenancy_id is not null
    or v_document.property_id is distinct from v_unit.property_id
    or (v_document.unit_id is not null and v_document.unit_id<>v_unit.id) or v_unit.operational_status<>'active'
    or exists(select 1 from public.document_versions v where v.document_id=v_document.id and v.version_number>v_version.version_number)
    or exists(select 1 from private.rental_agreements a
      where a.organization_id=p_organization_id and a.source_version_id=v_version.id
        and (a.status='executed' or (a.status='open' and a.expires_at>clock_timestamp()))) then
    raise exception using errcode='23514',message='AGREEMENT_SOURCE_UNAVAILABLE';
  end if;
  if exists(select 1 from auth.users u where u.id=v_actor and lower(trim(u.email))=v_email) then
    raise exception using errcode='22023',message='INVALID_AGREEMENT_PARTIES';
  end if;
  select u.id into v_recipient from auth.users u where lower(trim(u.email))=v_email and u.email_confirmed_at is not null
    and (select count(*) from auth.users x where lower(trim(x.email))=v_email)=1 for share;

  v_now:=clock_timestamp();
  v_expiry:=least(v_now+make_interval(days=>p_valid_days),((v_start::timestamp) at time zone
    (select p.time_zone from public.properties p where p.id=v_app.property_id)));
  if v_expiry<=v_now then raise exception using errcode='22023',message='APPLICATION_AGREEMENT_TERMS_INVALID'; end if;
  v_digest:=private.application_agreement_terms_digest(v_setup.draft);
  insert into private.rental_agreements(id,organization_id,property_id,unit_id,source_version_id,source_sha256,title,
    property_label,unit_label,created_by,issue_hash,issued_at,expires_at)
    values(p_agreement_id,p_organization_id,v_unit.property_id,v_unit.id,v_version.id,lower(v_version.sha256_hex),v_document.title,
      v_property_name,v_unit.unit_code,v_actor,v_hash,v_now,v_expiry);
  insert into private.rental_agreement_application_links(agreement_id,organization_id,application_id,setup_id,application_version,
    approved_setup_revision,approved_terms_sha256,approved_currency)
    values(p_agreement_id,p_organization_id,p_application_id,p_setup_id,p_expected_application_version,v_setup.revision,v_digest,v_currency);
  insert into private.rental_agreement_signers(agreement_id,user_id,capacity) values(p_agreement_id,v_actor,'landlord');
  if v_recipient is not null then
    insert into private.rental_agreement_signers(agreement_id,user_id,capacity) values(p_agreement_id,v_recipient,'lessee');
  end if;
  v_token:=encode(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')),'hex');
  insert into private.notification_jobs(organization_id,template_code,locale,channel,recipient_address,payload,idempotency_key)
    values(p_organization_id,'rental_agreement_signing_requested',v_locale,'email',v_email,
      jsonb_build_object('agreementId',p_agreement_id,'applicationReference',v_app.public_reference,
        'expiresAt',v_expiry,'signingInvitationToken',v_token),'rental-agreement-invite:'||p_agreement_id::text||':1')
    returning id into v_job;
  insert into private.rental_agreement_signer_claims(agreement_id,organization_id,expected_email,token_hash,expires_at,
    claimed_by,claimed_at,notification_job_id)
    values(p_agreement_id,p_organization_id,v_email,encode(sha256(convert_to(v_token,'UTF8')),'hex'),v_expiry,
      v_recipient,case when v_recipient is not null then v_now end,v_job);
  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
    values(p_organization_id,v_actor,'user','rental_agreement.issued','rental_agreement',p_agreement_id,p_agreement_id,
      jsonb_build_object('applicationId',p_application_id,'setupId',p_setup_id,'setupRevision',v_setup.revision,
        'sourceVersionId',v_version.id,'termsSha256',v_digest,'requiredCount',2,'currency',v_currency));
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
    values(p_organization_id,'rental_agreement.issued','rental_agreement',p_agreement_id,p_agreement_id,
      jsonb_build_object('agreementId',p_agreement_id,'unitId',v_unit.id,'applicationId',p_application_id));
  return jsonb_build_object('agreementId',p_agreement_id,'status','open','replayed',false);
end;
$$;
revoke all on function public.send_rental_application_agreement(uuid,uuid,uuid,integer,integer,uuid,uuid,integer,boolean,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.send_rental_application_agreement(uuid,uuid,uuid,integer,integer,uuid,uuid,integer,boolean,boolean)
  to authenticated;
-- Possession of the invitation cannot sign in to an existing account. This
-- service boundary only resolves the expected address for independent OTP.
create function public.begin_rental_application_signer_access(p_token_hash text,p_request_email boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_claim private.rental_agreement_signer_claims%rowtype;
begin
  if coalesce(p_token_hash,'') !~ '^[a-f0-9]{64}$' or p_request_email is null then return null; end if;
  select c.* into v_claim from private.rental_agreement_signer_claims c
    join private.rental_agreement_application_links l on l.agreement_id=c.agreement_id and l.organization_id=c.organization_id
    join private.rental_agreements a on a.id=c.agreement_id and a.organization_id=c.organization_id
    join public.rental_applications app on app.id=l.application_id and app.organization_id=l.organization_id
  where c.token_hash=p_token_hash and c.expires_at>clock_timestamp()
    and a.status in ('open','executed') and app.status in ('lease_preparation','converted')
    and app.verified_at is not null and lower(trim(app.email::text))=c.expected_email
    for update of c;
  if not found then return null; end if;
  if p_request_email then
    if v_claim.last_auth_requested_at>clock_timestamp()-interval '1 minute' then
      return jsonb_build_object('throttled',true);
    end if;
    update private.rental_agreement_signer_claims set last_auth_requested_at=clock_timestamp()
      where agreement_id=v_claim.agreement_id;
  end if;
  return jsonb_build_object('agreementId',v_claim.agreement_id,'expectedEmail',v_claim.expected_email,'throttled',false);
end;
$$;
revoke all on function public.begin_rental_application_signer_access(text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.begin_rental_application_signer_access(text,boolean) to service_role;

create function public.claim_rental_application_agreement(p_agreement_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid();
  v_link private.rental_agreement_application_links%rowtype;
  v_agreement private.rental_agreements%rowtype;
  v_app public.rental_applications%rowtype;
  v_claim private.rental_agreement_signer_claims%rowtype;
  v_email text;
  v_participant uuid;
begin
  select lower(trim(u.email)) into v_email from auth.users u where u.id=v_actor and u.email_confirmed_at is not null;
  if not found then raise exception using errcode='42501',message='AGREEMENT_CLAIM_UNAVAILABLE'; end if;
  select * into v_link from private.rental_agreement_application_links l where l.agreement_id=p_agreement_id;
  if not found then raise exception using errcode='42501',message='AGREEMENT_CLAIM_UNAVAILABLE'; end if;
  select * into strict v_agreement from private.rental_agreements a where a.id=p_agreement_id;
  perform 1 from public.units u where u.id=v_agreement.unit_id and u.organization_id=v_link.organization_id for update;
  select * into strict v_app from public.rental_applications app where app.id=v_link.application_id
    and app.organization_id=v_link.organization_id for update;
  select * into strict v_agreement from private.rental_agreements a where a.id=p_agreement_id for update;
  select * into v_claim from private.rental_agreement_signer_claims c where c.agreement_id=p_agreement_id for update;
  if not found or v_claim.expected_email is distinct from v_email or v_actor=v_agreement.created_by
    or v_app.verified_at is null or lower(trim(v_app.email::text)) is distinct from v_email
    or (select count(*) from auth.users u where lower(trim(u.email))=v_email)<>1 then
    raise exception using errcode='42501',message='AGREEMENT_CLAIM_UNAVAILABLE';
  end if;
  if v_claim.claimed_by=v_actor and v_agreement.status in ('open','executed')
    and (v_agreement.status='executed' or v_agreement.expires_at>clock_timestamp()) then
    return jsonb_build_object('agreementId',p_agreement_id,'claimed',true,'replayed',true);
  end if;
  if v_claim.claimed_by is not null or v_app.status<>'lease_preparation'
    or v_agreement.status<>'open' or v_claim.expires_at<=clock_timestamp()
    or not exists(select 1 from private.homeowner_lease_setups s where s.id=v_link.setup_id and s.status='draft'
      and s.source_rental_application_id=v_app.id
      and private.application_agreement_terms_digest(s.draft)=v_link.approved_terms_sha256) then
    raise exception using errcode='42501',message='AGREEMENT_CLAIM_UNAVAILABLE';
  end if;
  perform private.assert_rental_application_evidence_ready(v_link.organization_id,v_app.id);
  insert into private.rental_agreement_signers(agreement_id,user_id,capacity)
    values(p_agreement_id,v_actor,'lessee') returning participant_id into v_participant;
  update private.rental_agreement_signer_claims set claimed_by=v_actor,claimed_at=clock_timestamp()
    where agreement_id=p_agreement_id;
  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
    values(v_link.organization_id,v_actor,'user','rental_agreement.signer_access_claimed','rental_agreement',p_agreement_id,p_agreement_id,
      jsonb_build_object('participantId',v_participant,'applicationId',v_app.id));
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
    values(v_link.organization_id,'rental_agreement.signer_access_claimed','rental_agreement',p_agreement_id,p_agreement_id,
      jsonb_build_object('agreementId',p_agreement_id,'participantId',v_participant));
  return jsonb_build_object('agreementId',p_agreement_id,'claimed',true,'replayed',false);
end;
$$;
revoke all on function public.claim_rental_application_agreement(uuid) from public,anon,authenticated,service_role;
grant execute on function public.claim_rental_application_agreement(uuid) to authenticated;

create or replace function private.rental_agreement_summary(a private.rental_agreements)
returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'agreementId',a.id,'sourceVersionId',a.source_version_id,'sourceSha256',a.source_sha256,
    'title',a.title,'propertyLabel',a.property_label,'unitLabel',a.unit_label,'issuedAt',a.issued_at,'expiresAt',a.expires_at,
    'status',case when a.status='open' and a.expires_at<=statement_timestamp() then 'expired' else a.status end,
    'requiredCount',count(s.user_id)+case when exists (
      select 1 from private.rental_agreement_signer_claims c where c.agreement_id=a.id and c.claimed_by is null
    ) then 1 else 0 end,'signedCount',count(sig.user_id),
    'applicationLinked',exists(select 1 from private.rental_agreement_application_links l where l.agreement_id=a.id),
    'tenancyStatus',(select t.status from private.rental_agreement_filings f join public.tenancies t
      on t.id=f.tenancy_id and t.organization_id=f.organization_id where f.agreement_id=a.id),
    'myCapacity',max(s.capacity) filter (where s.user_id=auth.uid()),
    'iSigned',count(sig.user_id) filter (where sig.user_id=auth.uid())>0
  )
  from private.rental_agreement_signers s
  left join private.rental_agreement_signatures sig on sig.agreement_id=s.agreement_id and sig.user_id=s.user_id
  where s.agreement_id=a.id
$$;

create or replace function public.sign_rental_agreement(
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
  v_link private.rental_agreement_application_links%rowtype;
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
    return jsonb_build_object('agreementId',p_agreement_id,'status',v_agreement.status,'signedAt',v_existing.signed_at,
      'sourceVersionId',v_agreement.source_version_id,'capacity',v_signer.capacity,'actorId',p_verified_actor_id,'replayed',true);
  end if;
  if p_consent_version is distinct from private.agreement_disclosure_version() then
    raise exception using errcode='23514',message='AGREEMENT_DISCLOSURE_CHANGED';
  end if;
  if v_agreement.status<>'open' or v_agreement.expires_at<=clock_timestamp() then
    raise exception using errcode='23514',message='AGREEMENT_NOT_OPEN';
  end if;

  select * into v_link from private.rental_agreement_application_links l where l.agreement_id=p_agreement_id;
  if v_link.approved_terms_sha256 is not null and not exists (
    select 1 from public.rental_applications a join private.homeowner_lease_setups s
      on s.id=v_link.setup_id and s.source_rental_application_id=a.id and s.organization_id=a.organization_id
    where a.id=v_link.application_id and a.organization_id=v_link.organization_id and a.status='lease_preparation'
      and s.status='draft' and private.application_agreement_terms_digest(s.draft)=v_link.approved_terms_sha256
  ) then raise exception using errcode='23514',message='APPLICATION_AGREEMENT_TERMS_LOCKED'; end if;
  if v_link.approved_terms_sha256 is not null and v_signer.capacity='lessee' and not exists (
    select 1 from auth.users u where u.id=p_verified_actor_id and u.email_confirmed_at is not null
      and lower(trim(u.email))=v_signer.email_at_issue
  ) then raise exception using errcode='42501',message='AGREEMENT_FORBIDDEN'; end if;

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

  if not exists(select 1 from private.rental_agreement_signer_claims c
    where c.agreement_id=p_agreement_id and c.claimed_by is null) and not exists (
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
    if v_link.approved_terms_sha256 is not null then
      v_evidence:=v_evidence||jsonb_build_object('approvedTermsSha256',v_link.approved_terms_sha256,
        'approvedSetupRevision',v_link.approved_setup_revision,'approvedCurrency',v_link.approved_currency);
    end if;
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
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
    values(v_agreement.organization_id,'rental_agreement.signed','rental_agreement',p_agreement_id,p_agreement_id,
      jsonb_build_object('participantId',v_signer.participant_id,'status',v_agreement.status));
  return jsonb_build_object('agreementId',p_agreement_id,'status',v_agreement.status,'signedAt',v_now,
    'sourceVersionId',v_agreement.source_version_id,'capacity',v_signer.capacity,'actorId',p_verified_actor_id,'replayed',false);
end
$$;

create or replace function public.get_rental_application_signing_setup(p_organization_id uuid,p_application_id uuid)
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
    'setupId',v_setup.id,'setupRevision',v_setup.revision,'unitId',v_app.unit_id,'name',concat_ws(' ',v_app.first_name,v_app.last_name),
    'terms',jsonb_build_object('startDate',v_setup.draft->>'startDate','endDate',v_setup.draft->>'endDate',
      'rentAmount',v_setup.draft->>'rentAmount','rentFrequency',v_setup.draft->>'rentFrequency',
      'firstChargeDueDate',v_setup.draft->>'firstChargeDueDate','openingBalance',v_setup.draft->>'openingBalance',
      'currency',(select b.functional_currency_code from public.properties p join public.accounting_books b
        on b.id=p.accounting_book_id and b.organization_id=p.organization_id where p.id=v_app.property_id)),
    'email',v_app.email::text,'agreementId',(
      select a.id from private.rental_agreement_application_links l
      join private.rental_agreements a on a.id=l.agreement_id
      where l.setup_id=v_setup.id and (a.status='executed' or (a.status='open' and a.expires_at>now()))
      order by a.issued_at desc limit 1
    ));
end;
$$;

commit;
