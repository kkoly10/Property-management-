begin;

-- Existing deliveries remain valid read and acknowledgment records. Only a deliberately
-- requested delivery can create a new electronic signature after the contract release.
alter table public.document_deliveries
  add column signature_requested_at timestamptz;

create or replace function public.deliver_document_with_purpose(
  p_organization_id uuid,
  p_document_version_id uuid,
  p_recipient_relationship_type text,
  p_recipient_relationship_id uuid,
  p_delivery_channel text,
  p_secure_link_ttl_hours integer,
  p_idempotency_key text,
  p_signature_requested boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_had_receipt boolean;
  v_response jsonb;
  v_delivery_id uuid;
  v_requested boolean;
begin
  if v_actor_id is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  if p_signature_requested is null then raise exception using errcode='23514',message='INVALID_DELIVERY_PURPOSE'; end if;

  perform pg_advisory_xact_lock(hashtextextended(concat_ws('|', 'DeliverDocument',p_organization_id,v_actor_id,p_idempotency_key),0));
  select exists (
    select 1 from private.idempotency_records r
    where r.organization_id=p_organization_id and r.actor_user_id=v_actor_id
      and r.route='DeliverDocument' and r.idempotency_key=p_idempotency_key
  ) into v_had_receipt;

  -- Reuse the current delivery command's authority, notification and receipt.
  v_response := public.deliver_document(
    p_organization_id,p_document_version_id,p_recipient_relationship_type,
    p_recipient_relationship_id,p_delivery_channel,p_secure_link_ttl_hours,p_idempotency_key
  );
  v_delivery_id := (v_response->>'documentDeliveryId')::uuid;
  select d.signature_requested_at is not null into strict v_requested
    from public.document_deliveries d
    where d.id=v_delivery_id and d.organization_id=p_organization_id for update;
  if v_had_receipt and v_requested is distinct from p_signature_requested then
    raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT';
  end if;
  if p_signature_requested and not v_requested then
    update public.document_deliveries set signature_requested_at=now() where id=v_delivery_id;
  end if;
  return v_response || jsonb_build_object('signatureRequested',p_signature_requested);
end;
$$;
revoke all on function public.deliver_document_with_purpose(uuid,uuid,text,uuid,text,integer,text,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.deliver_document_with_purpose(uuid,uuid,text,uuid,text,integer,text,boolean)
  to authenticated;

-- Used by the final version RLS policy. Keep existing scoped operator and tenancy
-- reads available, and limit an ordinary delivery-only grant to its addressed version.
create or replace function private.can_read_document_version(p_version_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.document_versions dv
    join public.documents doc on doc.id=dv.document_id and doc.organization_id=dv.organization_id
    where dv.id=p_version_id and (
      (doc.property_id is not null and (
        private.has_property_access(doc.property_id,'documents.read')
        or private.has_property_access(doc.property_id,'documents.manage')
      ))
      or (doc.property_id is null and (
        private.has_unscoped_org_permission(doc.organization_id,'documents.read')
        or private.has_unscoped_org_permission(doc.organization_id,'documents.manage')
      ))
      or (doc.tenancy_id is not null and private.is_resident_for_tenancy(doc.tenancy_id))
      or (dv.upload_status='clean' and exists (
        select 1 from public.document_deliveries delivery
        where delivery.document_version_id=dv.id and delivery.organization_id=dv.organization_id
          and delivery.recipient_user_id=(select auth.uid())
          and (
            (delivery.status in ('sent','delivered') and (delivery.expires_at is null or delivery.expires_at>now()))
            or exists (
              select 1 from public.document_signatures signature
              where signature.document_delivery_id=delivery.id and signature.document_version_id=dv.id
                and signature.signer_user_id=(select auth.uid())
            )
          )
      ))
    )
  )
$$;
revoke all on function private.can_read_document_version(uuid) from public,anon,authenticated,service_role;
grant execute on function private.can_read_document_version(uuid) to authenticated;

-- Consent identifiers generated from src/lib/legal/registry.ts for the published
-- en-US disclosure. A new disclosure requires a coordinated registry/SQL revision.
-- The authenticated HTTP server supplies the verified user ID and the same canonical
-- binding the signing page displayed. Neither client headers nor user agent are evidence.
create or replace function public.sign_reviewed_document(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_document_delivery_id uuid,
  p_reviewed_version_id uuid,
  p_reviewed_sha256 text,
  p_signer_name text,
  p_esign_consent_version text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allowed_consent constant text := 'esign_consent@1.0.0#260463bcf84a7827';
  v_intent constant text := 'I have read and agree to this document, and I intend my electronic signature to bind me to it.';
  v_delivery public.document_deliveries%rowtype;
  v_version public.document_versions%rowtype;
  v_document public.documents%rowtype;
  v_previous private.idempotency_records%rowtype;
  v_request_hash text;
  v_previous_claims text;
  v_previous_subject text;
  v_previous_aal text;
  v_response jsonb;
begin
  if p_actor_user_id is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 200 then
    raise exception using errcode='23514',message='INVALID_IDEMPOTENCY_KEY';
  end if;
  if p_signer_name is null or length(trim(p_signer_name)) not between 2 and 160 then
    raise exception using errcode='23514',message='SIGNER_NAME_REQUIRED';
  end if;
  if p_esign_consent_version is distinct from v_allowed_consent then
    raise exception using errcode='23514',message='ESIGN_CONSENT_VERSION_CHANGED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(concat_ws('|','SignDocument',p_organization_id,p_actor_user_id,p_idempotency_key),0));
  select * into v_delivery from public.document_deliveries d
    where d.id=p_document_delivery_id and d.organization_id=p_organization_id for update;
  if not found then raise exception using errcode='P0002',message='DOCUMENT_DELIVERY_NOT_FOUND'; end if;
  if v_delivery.recipient_user_id is distinct from p_actor_user_id then
    raise exception using errcode='42501',message='DOCUMENT_DELIVERY_FORBIDDEN';
  end if;
  if v_delivery.document_version_id is distinct from p_reviewed_version_id then
    raise exception using errcode='23514',message='DOCUMENT_REVIEW_CHANGED';
  end if;

  v_request_hash := encode(sha256(convert_to(jsonb_build_object(
    'documentDeliveryId',p_document_delivery_id,'signerName',trim(p_signer_name),
    'esignConsentVersion',v_allowed_consent,'intentStatement',v_intent
  )::text,'UTF8')),'hex');

  select * into v_previous from private.idempotency_records r
    where r.organization_id=p_organization_id and r.actor_user_id=p_actor_user_id
      and r.route='SignDocument' and r.idempotency_key=p_idempotency_key;
  if found then
    if v_previous.request_hash<>v_request_hash then
      raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT';
    end if;
    if v_previous.state<>'completed' then
      raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
    end if;
    if lower(v_previous.response_body->>'documentSha256') is distinct from p_reviewed_sha256 then
      raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT';
    end if;
    return v_previous.response_body;
  end if;

  if v_delivery.signature_requested_at is null or v_delivery.status not in ('sent','delivered') then
    raise exception using errcode='23514',message='DOCUMENT_NOT_SIGNABLE';
  end if;

  select * into v_version from public.document_versions v
    where v.id=v_delivery.document_version_id and v.organization_id=p_organization_id for share;
  if not found then raise exception using errcode='P0002',message='DOCUMENT_VERSION_NOT_FOUND'; end if;
  if lower(v_version.sha256_hex) is distinct from p_reviewed_sha256 then
    raise exception using errcode='23514',message='DOCUMENT_REVIEW_CHANGED';
  end if;
  select * into v_document from public.documents d
    where d.id=v_version.document_id and d.organization_id=p_organization_id for share;
  if not found or v_version.upload_status<>'clean' or v_document.status<>'active' then
    raise exception using errcode='23514',message='DOCUMENT_NOT_SIGNABLE';
  end if;

  perform 1 from public.user_relationships relationship
    where relationship.organization_id=p_organization_id and relationship.user_id=p_actor_user_id
      and relationship.relationship_type=v_delivery.recipient_relationship_type
      and relationship.relationship_type in ('resident_person','owner_entity')
      and relationship.relationship_id=v_delivery.recipient_relationship_id
      and relationship.status='active' for share;
  if not found then raise exception using errcode='42501',message='DOCUMENT_DELIVERY_FORBIDDEN'; end if;
  if v_delivery.expires_at is not null and v_delivery.expires_at<=clock_timestamp() then
    raise exception using errcode='23514',message='DOCUMENT_NOT_SIGNABLE';
  end if;
  if exists (
    select 1 from public.document_acknowledgements acknowledgement
    where acknowledgement.organization_id=p_organization_id
      and acknowledgement.document_delivery_id=p_document_delivery_id
      and acknowledgement.user_id=p_actor_user_id and acknowledgement.acknowledgement_type='declined'
  ) then
    raise exception using errcode='23514',message='DOCUMENT_NOT_SIGNABLE';
  end if;

  -- Preserve the proven writer's receipt, audit, outbox and seal. It resolves the
  -- actor from auth.uid(); temporarily pass only the server-verified subject.
  v_previous_claims := current_setting('request.jwt.claims',true);
  v_previous_subject := current_setting('request.jwt.claim.sub',true);
  v_previous_aal := current_setting('request.jwt.claim.aal',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',p_actor_user_id)::text,true);
  perform set_config('request.jwt.claim.sub',p_actor_user_id::text,true);
  perform set_config('request.jwt.claim.aal','',true);
  v_response := public.sign_document(
    p_organization_id,p_document_delivery_id,p_signer_name,true,
    v_allowed_consent,true,v_intent,null,null,p_idempotency_key
  );
  perform set_config('request.jwt.claims',coalesce(v_previous_claims,''),true);
  perform set_config('request.jwt.claim.sub',coalesce(v_previous_subject,''),true);
  perform set_config('request.jwt.claim.aal',coalesce(v_previous_aal,''),true);
  return v_response;
end;
$$;
revoke all on function public.sign_reviewed_document(uuid,uuid,uuid,uuid,text,text,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.sign_reviewed_document(uuid,uuid,uuid,uuid,text,text,text,text)
  to service_role;

-- The contract release enables this trigger so decline and signing serialize on
-- the same delivery. A historic completed signature cannot subsequently be declined.
create or replace function private.serialize_document_decline()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform 1 from public.document_deliveries d where d.id=new.document_delivery_id for update;
  if exists (
    select 1 from public.document_signatures signature
    where signature.document_delivery_id=new.document_delivery_id and signature.signer_user_id=new.user_id
  ) then
    raise exception using errcode='23505',message='DOCUMENT_ALREADY_SIGNED';
  end if;
  return new;
end;
$$;
revoke all on function private.serialize_document_decline() from public,anon,authenticated,service_role;

commit;
