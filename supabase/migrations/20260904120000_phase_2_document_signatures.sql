begin;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- Court-defensible electronic signatures (ESIGN Act / UETA).
--
-- Until now, "signing" a delivered document was an acknowledgement row of type 'accepted' whose only
-- evidence was the delivered file's own content hash, supplied by the client and stored unverified. That
-- binds *which file* but proves nothing about *who* signed it, *when*, from *where*, with what *intent*,
-- or under what *consent* — the four things ESIGN (15 U.S.C. §7001) and UETA require an electronic
-- signature to demonstrate to be enforceable, and the things a DocuSign Certificate of Completion records.
--
-- `sign_document` captures all four, server-side:
--   * Intent      — an explicit, deliberate signing act carrying the exact affirmation text shown.
--   * Consent     — an ESIGN electronic-records consent, versioned, written to consent_records.
--   * Attribution — bound to auth.uid() = the addressed recipient, to the exact document VERSION and its
--                   server-authoritative sha256 (never a client-supplied hash), with IP, user agent and
--                   auth-assurance level captured by the API route.
--   * Retention   — an append-only signature row plus a tamper-evident seal (a hash over every evidence
--                   field), surfaced as a retrievable, printable Certificate of Completion.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────

-- Parse the first address out of an X-Forwarded-For header into inet, never throwing: a malformed proxy
-- header must yield a null IP, not a failed signature. `set search_path=''` keeps it schema-qualified.
create or replace function private.safe_inet(p_value text)
returns inet
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_first text;
  v_result inet;
begin
  if p_value is null then return null; end if;
  v_first := trim(split_part(p_value, ',', 1));
  if v_first = '' then return null; end if;
  begin
    v_result := v_first::inet;
  exception when others then
    return null;
  end;
  return v_result;
end;
$$;
revoke all on function private.safe_inet(text) from public, anon;
grant execute on function private.safe_inet(text) to authenticated;

-- The signature record. Append-only, exactly like document_acknowledgements: SELECT-only from the
-- browser, and no command ever updates or deletes a row — a mistaken signature is superseded by a fresh
-- signing request, never edited, so the evidence a court would examine is immutable. The seal is the
-- tamper-evidence: any later change to an evidence column would no longer reproduce signature_seal.
create table if not exists public.document_signatures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  document_delivery_id uuid not null references public.document_deliveries(id) on delete restrict,
  document_version_id uuid not null references public.document_versions(id) on delete restrict,
  signer_user_id uuid not null references auth.users(id) on delete restrict,
  signer_name text not null,
  signer_email text,
  document_sha256 text not null check (document_sha256 ~ '^[0-9a-f]{64}$'),
  intent_statement text not null,
  esign_consent_version text not null,
  consent_record_id uuid references public.consent_records(id) on delete restrict,
  ip_address inet,
  user_agent text,
  auth_assurance_level text,
  delivered_at timestamptz,
  first_viewed_at timestamptz,
  signed_at timestamptz not null default now(),
  signature_seal text not null check (signature_seal ~ '^[0-9a-f]{64}$'),
  verification_code text not null,
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  unique (document_delivery_id, signer_user_id)
);

create index if not exists document_signatures_delivery_idx on public.document_signatures (document_delivery_id);
create index if not exists document_signatures_version_idx on public.document_signatures (document_version_id);

alter table public.document_signatures enable row level security;
grant select on public.document_signatures to authenticated;
revoke insert, update, delete on public.document_signatures from anon, authenticated;

-- The signer reads their own signature (their receipt); a document manager for the version reads any
-- signature on it (to see who signed and to open the certificate). Mirrors document_ack_self_or_manager.
create policy document_signatures_self_or_manager_read on public.document_signatures
  for select to authenticated
  using (
    signer_user_id = (select auth.uid())
    or private.can_manage_document_version(document_version_id)
  );

-- ── the command ─────────────────────────────────────────────────────────────────────────────────────
create or replace function public.sign_document(
  p_organization_id uuid,
  p_document_delivery_id uuid,
  p_signer_name text,
  p_esign_consent_agreed boolean,
  p_esign_consent_version text,
  p_intent_affirmed boolean,
  p_intent_statement text,
  p_ip_address text,
  p_user_agent text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_delivery public.document_deliveries%rowtype;
  v_version public.document_versions%rowtype;
  v_already_signed boolean;
  v_signer_name text := nullif(trim(coalesce(p_signer_name,'')),'');
  v_consent_version text := nullif(trim(coalesce(p_esign_consent_version,'')),'');
  v_intent text := nullif(trim(coalesce(p_intent_statement,'')),'');
  v_user_agent text := nullif(left(trim(coalesce(p_user_agent,'')),1000),'');
  v_ip inet := private.safe_inet(p_ip_address);
  v_signer_email text;
  v_aal text := nullif(auth.jwt()->>'aal','');
  v_signature_id uuid := gen_random_uuid();
  v_consent_id uuid := gen_random_uuid();
  v_ack_id uuid := gen_random_uuid();
  v_signed_at timestamptz := now();
  v_delivered_at timestamptz;
  v_first_viewed_at timestamptz;
  v_document_sha text;
  v_seal text;
  v_verification text;
  v_locale text;
  v_request_hash text;
  v_previous private.idempotency_records%rowtype;
  v_correlation_id uuid := gen_random_uuid();
  v_response jsonb;
begin
  -- 1. auth
  if v_actor_id is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;

  -- 2. validate every input
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 200 then
    raise exception using errcode='23514',message='INVALID_IDEMPOTENCY_KEY';
  end if;
  if v_signer_name is null or length(v_signer_name) not between 2 and 160 then
    raise exception using errcode='23514',message='SIGNER_NAME_REQUIRED';
  end if;
  -- ESIGN consent is not optional: without an affirmative, versioned consent the signature is not valid
  -- for a consumer, so a false/absent flag stops here rather than recording an unenforceable signature.
  if coalesce(p_esign_consent_agreed,false) is distinct from true then
    raise exception using errcode='23514',message='ESIGN_CONSENT_REQUIRED';
  end if;
  if v_consent_version is null or length(v_consent_version) not between 1 and 200 then
    raise exception using errcode='23514',message='ESIGN_CONSENT_VERSION_REQUIRED';
  end if;
  if coalesce(p_intent_affirmed,false) is distinct from true then
    raise exception using errcode='23514',message='SIGNING_INTENT_REQUIRED';
  end if;
  if v_intent is null or length(v_intent) not between 1 and 2000 then
    raise exception using errcode='23514',message='SIGNING_INTENT_REQUIRED';
  end if;

  -- 3. load anchor scoped by organization; authorize the addressed recipient only
  select * into v_delivery from public.document_deliveries d
    where d.id=p_document_delivery_id and d.organization_id=p_organization_id;
  if not found then raise exception using errcode='P0002',message='DOCUMENT_DELIVERY_NOT_FOUND'; end if;
  if v_delivery.recipient_user_id is null or v_delivery.recipient_user_id <> v_actor_id then
    raise exception using errcode='42501',message='DOCUMENT_DELIVERY_FORBIDDEN';
  end if;

  select * into v_version from public.document_versions v where v.id=v_delivery.document_version_id;
  if not found then raise exception using errcode='P0002',message='DOCUMENT_VERSION_NOT_FOUND'; end if;
  -- Only a scanned-clean version can be signed; a quarantined/rejected file must never be bound to a
  -- signature.
  if v_version.upload_status <> 'clean' then
    raise exception using errcode='23514',message='DOCUMENT_NOT_SIGNABLE';
  end if;
  v_document_sha := lower(v_version.sha256_hex);
  v_delivered_at := v_delivery.delivered_at;

  -- Chain of custody: the earliest recorded view of this delivery by this signer, if any.
  select min(a.acknowledged_at) into v_first_viewed_at from public.document_acknowledgements a
    where a.document_delivery_id=p_document_delivery_id and a.user_id=v_actor_id
      and a.acknowledgement_type in ('viewed','received');

  -- Capture existence BEFORE any insert; the already-signed guard depends on this command's own prior
  -- side effect, so it is enforced AFTER the idempotency short-circuit below.
  select exists (
    select 1 from public.document_signatures s
    where s.document_delivery_id=p_document_delivery_id and s.signer_user_id=v_actor_id
  ) into v_already_signed;

  -- 4. request hash over canonical camelCase inputs
  v_request_hash := encode(sha256(convert_to(jsonb_build_object(
    'documentDeliveryId',p_document_delivery_id,'signerName',v_signer_name,
    'esignConsentVersion',v_consent_version,'intentStatement',v_intent
  )::text,'UTF8')),'hex');

  -- 5. idempotency
  select * into v_previous from private.idempotency_records r
    where r.organization_id=p_organization_id and r.actor_user_id=v_actor_id
      and r.route='SignDocument' and r.idempotency_key=p_idempotency_key;
  if found then
    if v_previous.request_hash<>v_request_hash then raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT'; end if;
    if v_previous.state='completed' then return v_previous.response_body; end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;

  if v_already_signed then
    raise exception using errcode='23505',message='DOCUMENT_ALREADY_SIGNED';
  end if;

  insert into private.idempotency_records(organization_id,actor_user_id,route,idempotency_key,request_hash,expires_at)
    values (p_organization_id,v_actor_id,'SignDocument',p_idempotency_key,v_request_hash,now()+interval '24 hours');

  -- 6. mutate
  select u.email into v_signer_email from auth.users u where u.id=v_actor_id;
  select o.default_locale into v_locale from public.organizations o where o.id=p_organization_id;

  -- The ESIGN electronic-records consent, recorded as its own consent_records row so a withdrawal or an
  -- audit can find it exactly like any other consent.
  insert into public.consent_records(id,user_id,organization_id,consent_type,purpose_code,legal_document_version,status,granted_at,locale,source_surface,evidence_hash)
    values (v_consent_id,v_actor_id,p_organization_id,'electronic_signature','document_signature',v_consent_version,'granted',v_signed_at,coalesce(v_locale,'en-US'),'documents.sign',
      encode(sha256(convert_to(concat(v_actor_id,v_consent_version,v_correlation_id),'UTF8')),'hex'));

  -- Tamper-evident seal: a hash over every evidence field, timestamp normalized to UTC so it reproduces
  -- regardless of session time zone. Recomputing this from the stored row proves the row is unaltered.
  v_seal := encode(sha256(convert_to(concat_ws('|',
    v_signature_id, p_organization_id, p_document_delivery_id, v_delivery.document_version_id, v_document_sha,
    v_actor_id, v_signer_name, coalesce(v_signer_email,''), v_intent, v_consent_version, v_consent_id,
    coalesce(host(v_ip),''), coalesce(v_user_agent,''), coalesce(v_aal,''),
    to_char(v_signed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), v_correlation_id
  ),'UTF8')),'hex');
  v_verification := upper(substr(v_seal,1,12));

  insert into public.document_signatures(
    id,organization_id,document_delivery_id,document_version_id,signer_user_id,signer_name,signer_email,
    document_sha256,intent_statement,esign_consent_version,consent_record_id,ip_address,user_agent,auth_assurance_level,
    delivered_at,first_viewed_at,signed_at,signature_seal,verification_code,correlation_id
  ) values (
    v_signature_id,p_organization_id,p_document_delivery_id,v_delivery.document_version_id,v_actor_id,v_signer_name,v_signer_email,
    v_document_sha,v_intent,v_consent_version,v_consent_id,v_ip,v_user_agent,v_aal,
    v_delivered_at,v_first_viewed_at,v_signed_at,v_seal,v_verification,v_correlation_id
  );

  -- Backward-compatible: a signature is also the strongest 'accepted' acknowledgement, so record one so
  -- every existing "Signed" state (resident, owner and operator surfaces) keeps working unchanged. If the
  -- recipient had already recorded a lightweight 'accepted', keep it — the signature is the authority.
  insert into public.document_acknowledgements(id,organization_id,document_delivery_id,user_id,acknowledgement_type,legal_document_version,evidence_hash,acknowledged_at)
    values (v_ack_id,p_organization_id,p_document_delivery_id,v_actor_id,'accepted',v_consent_version,v_document_sha,v_signed_at)
    on conflict (document_delivery_id,user_id,acknowledgement_type) do nothing;

  -- 7. audit + outbox, finally populating ip_hash (the column has existed unused since phase 1)
  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,ip_hash,after_data)
    values (p_organization_id,v_actor_id,'user','document.signed','document_signature',v_signature_id,v_correlation_id,
      case when v_ip is null then null else encode(sha256(convert_to(host(v_ip),'UTF8')),'hex') end,
      jsonb_build_object('documentDeliveryId',p_document_delivery_id,'documentVersionId',v_delivery.document_version_id,'verificationCode',v_verification));
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
    values (p_organization_id,'document.signed','document_signature',v_signature_id,v_correlation_id,
      jsonb_build_object('documentDeliveryId',p_document_delivery_id,'signatureId',v_signature_id,'signerUserId',v_actor_id));

  -- 8. response + complete
  v_response := jsonb_build_object(
    'signatureId',v_signature_id,'documentDeliveryId',p_document_delivery_id,'documentVersionId',v_delivery.document_version_id,
    'signerName',v_signer_name,'signedAt',v_signed_at,'documentSha256',v_document_sha,
    'verificationCode',v_verification,'esignConsentVersion',v_consent_version
  );
  update private.idempotency_records r set state='completed',response_status=201,response_body=v_response,
    resource_type='document_signature',resource_id=v_signature_id,completed_at=now()
  where r.organization_id=p_organization_id and r.actor_user_id=v_actor_id
    and r.route='SignDocument' and r.idempotency_key=p_idempotency_key;

  return v_response;
end;
$$;
revoke all on function public.sign_document(uuid,uuid,text,boolean,text,boolean,text,text,text,text) from public,anon;
grant execute on function public.sign_document(uuid,uuid,text,boolean,text,boolean,text,text,text,text) to authenticated;

commit;
