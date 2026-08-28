-- Phase 4: document delivery over email and secure_link.
--
-- deliver_document shipped portal-only because nothing drained private.notification_jobs. With the
-- worker in place (20260728100000) the other two channels in document_deliveries' own check constraint
-- become reachable:
--   * email       — the delivery is 'queued' and a 'document_delivered' notification job is enqueued.
--                   The worker advances the delivery to 'sent' (or 'failed' on a dead letter) through a
--                   trigger, so the delivery's status always reflects what actually happened.
--   * secure_link — same queueing, plus a one-time tokenized link the recipient can open without a
--                   portal account. document_deliveries stores only the token HASH, mirroring the
--                   invitation precedent (public.staff_invitations.token_hash), so the durable record
--                   can never mint a working link. The plaintext token exists in exactly two transient
--                   places: the command's own response (returned once to the operator, redacted from
--                   the stored idempotency body so replays cannot re-read it) and the notification job
--                   the worker needs in order to build the link — and a trigger scrubs it from that
--                   payload the moment the job reaches a terminal state.
--
-- Forward-only and additive: columns, functions, and one trigger. No table and no RLS policy is
-- created, so authority table/policy counts are unchanged.
begin;

-- ── Secure-link columns (additive) ────────────────────────────────────────────────────────────────
alter table public.document_deliveries add column if not exists secure_link_token_hash text;
alter table public.document_deliveries add column if not exists redeemed_at timestamptz;
alter table public.document_deliveries add column if not exists last_error text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='document_deliveries_secure_link_hash_format') then
    alter table public.document_deliveries
      add constraint document_deliveries_secure_link_hash_format
      check (secure_link_token_hash is null or secure_link_token_hash ~ '^[0-9a-f]{64}$');
  end if;
  -- A secure_link delivery is useless without a token and an expiry; other channels must carry neither.
  if not exists (select 1 from pg_constraint where conname='document_deliveries_secure_link_complete') then
    alter table public.document_deliveries
      add constraint document_deliveries_secure_link_complete
      check (
        (delivery_channel = 'secure_link' and secure_link_token_hash is not null and expires_at is not null)
        or (delivery_channel <> 'secure_link' and secure_link_token_hash is null)
      );
  end if;
end;
$$;

create unique index if not exists document_deliveries_secure_link_token_unique
  on public.document_deliveries(secure_link_token_hash) where secure_link_token_hash is not null;

-- ── deliver_document: all three channels ──────────────────────────────────────────────────────────
create or replace function public.deliver_document(
  p_organization_id uuid,
  p_document_version_id uuid,
  p_recipient_relationship_type text,
  p_recipient_relationship_id uuid,
  p_delivery_channel text,
  p_secure_link_ttl_hours integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_secure_token text;
  v_secure_token_hash text;
  v_stored_response jsonb;
  v_version public.document_versions%rowtype;
  v_document public.documents%rowtype;
  v_organization_name text;
  v_recipient_user_id uuid;
  v_recipient_email text;
  v_delivery_id uuid := gen_random_uuid();
  v_delivered_at timestamptz;
  v_expires_at timestamptz;
  v_status text;
  v_locale text;
  v_request_hash text;
  v_previous private.idempotency_records%rowtype;
  v_correlation_id uuid := gen_random_uuid();
  v_response jsonb;
begin
  if v_actor_id is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 200 then
    raise exception using errcode='23514',message='INVALID_IDEMPOTENCY_KEY';
  end if;
  if p_delivery_channel is null or p_delivery_channel not in ('portal','email','secure_link') then
    raise exception using errcode='23514',message='UNSUPPORTED_DELIVERY_CHANNEL';
  end if;
  if p_recipient_relationship_type is null or p_recipient_relationship_id is null then
    raise exception using errcode='23514',message='INVALID_DELIVERY_RECIPIENT';
  end if;
  if p_delivery_channel = 'secure_link' then
    if p_secure_link_ttl_hours is null or p_secure_link_ttl_hours not between 1 and 720 then
      raise exception using errcode='23514',message='INVALID_SECURE_LINK_TTL';
    end if;
  elsif p_secure_link_ttl_hours is not null then
    raise exception using errcode='23514',message='SECURE_LINK_TTL_NOT_APPLICABLE';
  end if;

  select * into v_version from public.document_versions dv
  where dv.id=p_document_version_id and dv.organization_id=p_organization_id;
  if not found then raise exception using errcode='P0002',message='DOCUMENT_VERSION_NOT_FOUND'; end if;
  select * into v_document from public.documents d where d.id=v_version.document_id and d.organization_id=p_organization_id;
  if not found then raise exception using errcode='P0002',message='DOCUMENT_NOT_FOUND'; end if;

  if v_document.property_id is not null then
    if not private.has_property_access(v_document.property_id,'documents.manage') then
      raise exception using errcode='42501',message='PROPERTY_SCOPE_DENIED';
    end if;
  elsif not private.has_unscoped_org_permission(p_organization_id,'documents.manage') then
    raise exception using errcode='42501',message='DOCUMENTS_SCOPE_DENIED';
  end if;

  if v_version.upload_status <> 'clean' then
    raise exception using errcode='23514',message='DOCUMENT_NOT_DELIVERABLE';
  end if;

  select ur.user_id into v_recipient_user_id from public.user_relationships ur
  where ur.organization_id=p_organization_id
    and ur.relationship_type=p_recipient_relationship_type
    and ur.relationship_id=p_recipient_relationship_id
    and ur.status='active'
  limit 1;
  if v_recipient_user_id is null then
    raise exception using errcode='P0002',message='DELIVERY_RECIPIENT_NOT_FOUND';
  end if;

  -- An off-portal channel needs somewhere to send to.
  if p_delivery_channel in ('email','secure_link') then
    select u.email into v_recipient_email from auth.users u where u.id=v_recipient_user_id;
    if v_recipient_email is null or length(trim(v_recipient_email))=0 then
      raise exception using errcode='23514',message='DELIVERY_RECIPIENT_EMAIL_UNAVAILABLE';
    end if;
  end if;

  v_request_hash := encode(sha256(convert_to(jsonb_build_object(
    'documentVersionId',p_document_version_id,'recipientRelationshipType',p_recipient_relationship_type,
    'recipientRelationshipId',p_recipient_relationship_id,'deliveryChannel',p_delivery_channel,
    'secureLinkTtlHours',p_secure_link_ttl_hours
  )::text,'UTF8')),'hex');
  select * into v_previous from private.idempotency_records r
  where r.organization_id=p_organization_id and r.actor_user_id=v_actor_id
    and r.route='DeliverDocument' and r.idempotency_key=p_idempotency_key;
  if found then
    if v_previous.request_hash<>v_request_hash then raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT'; end if;
    if v_previous.state='completed' then return v_previous.response_body; end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;

  insert into private.idempotency_records(organization_id,actor_user_id,route,idempotency_key,request_hash,expires_at)
  values (p_organization_id,v_actor_id,'DeliverDocument',p_idempotency_key,v_request_hash,now()+interval '24 hours');

  -- Portal delivery lands immediately; an off-portal channel is only 'queued' until the worker sends it.
  if p_delivery_channel = 'portal' then
    v_status := 'delivered';
    v_delivered_at := now();
  else
    v_status := 'queued';
    v_delivered_at := null;
  end if;
  -- Token entropy comes from two gen_random_uuid() draws (pg_strong_random, ~244 bits) folded through
  -- sha256 into 64 url-safe hex characters. Deliberately core-only: pgcrypto's gen_random_bytes cannot
  -- be resolved under `set search_path=''` without hard-coding the extension's schema, which differs
  -- between the embedded test database and Supabase. Only the HASH of this token is persisted.
  if p_delivery_channel = 'secure_link' then
    v_expires_at := now() + make_interval(hours => p_secure_link_ttl_hours);
    v_secure_token := encode(sha256(convert_to(
      gen_random_uuid()::text || gen_random_uuid()::text, 'UTF8')), 'hex');
    v_secure_token_hash := encode(sha256(convert_to(v_secure_token,'UTF8')),'hex');
  end if;

  insert into public.document_deliveries(
    id,organization_id,document_version_id,recipient_user_id,recipient_relationship_type,recipient_relationship_id,
    delivery_channel,status,delivered_at,expires_at,secure_link_token_hash
  ) values (
    v_delivery_id,p_organization_id,p_document_version_id,v_recipient_user_id,p_recipient_relationship_type,p_recipient_relationship_id,
    p_delivery_channel,v_status,v_delivered_at,v_expires_at,v_secure_token_hash
  );

  -- Queue the recipient's message. A secure_link job carries the plaintext token because the worker
  -- cannot otherwise build the link; sync_document_delivery_on_notification scrubs it as soon as the
  -- job terminates, so the secret's lifetime is bounded by the send, not by the row.
  if p_delivery_channel in ('email','secure_link') then
    select o.default_locale, o.display_name into v_locale, v_organization_name
    from public.organizations o where o.id=p_organization_id;
    insert into private.notification_jobs(
      organization_id,template_code,locale,channel,recipient_user_id,recipient_address,payload,idempotency_key
    ) values (
      p_organization_id,'document_delivered',coalesce(v_locale,'en-US'),'email',
      v_recipient_user_id,v_recipient_email,
      jsonb_build_object(
        'documentDeliveryId',v_delivery_id,
        'documentId',v_document.id,
        'documentTitle',v_document.title,
        'organizationName',v_organization_name,
        'deliveryChannel',p_delivery_channel,
        'expiresAt',v_expires_at,
        'secureLinkToken',v_secure_token
      ),
      'document-delivery:'||v_delivery_id::text
    );
  end if;

  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
  values (p_organization_id,v_actor_id,'user','document.delivered','document_delivery',v_delivery_id,v_correlation_id,
    jsonb_build_object('documentVersionId',p_document_version_id,'recipientUserId',v_recipient_user_id,'deliveryChannel',p_delivery_channel));
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
  values (p_organization_id,'document.delivered','document_delivery',v_delivery_id,v_correlation_id,
    jsonb_build_object('documentDeliveryId',v_delivery_id,'documentVersionId',p_document_version_id,'recipientUserId',v_recipient_user_id,'deliveryChannel',p_delivery_channel));

  v_response := jsonb_build_object(
    'documentDeliveryId',v_delivery_id,'documentVersionId',p_document_version_id,'recipientUserId',v_recipient_user_id,
    'deliveryChannel',p_delivery_channel,'status',v_status,'deliveredAt',v_delivered_at,'expiresAt',v_expires_at,
    'secureLinkToken',v_secure_token
  );
  -- The one-time token is returned to this caller only. The stored replay body omits it, so replaying
  -- the idempotency key cannot be used to re-read a secret that was issued once.
  v_stored_response := v_response - 'secureLinkToken';
  update private.idempotency_records r set state='completed',response_status=201,response_body=v_stored_response,
    resource_type='document_delivery',resource_id=v_delivery_id,completed_at=now()
  where r.organization_id=p_organization_id and r.actor_user_id=v_actor_id
    and r.route='DeliverDocument' and r.idempotency_key=p_idempotency_key;
  return v_response;
end;
$$;
revoke all on function public.deliver_document(uuid,uuid,text,uuid,text,integer,text) from public,anon;
grant execute on function public.deliver_document(uuid,uuid,text,uuid,text,integer,text) to authenticated;

-- The original 6-argument signature stays valid and portal-only, so existing callers are unaffected.
create or replace function public.deliver_document(
  p_organization_id uuid,
  p_document_version_id uuid,
  p_recipient_relationship_type text,
  p_recipient_relationship_id uuid,
  p_delivery_channel text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.deliver_document(
    p_organization_id,p_document_version_id,p_recipient_relationship_type,p_recipient_relationship_id,
    p_delivery_channel,null,p_idempotency_key
  );
end;
$$;
revoke all on function public.deliver_document(uuid,uuid,text,uuid,text,text) from public,anon;
grant execute on function public.deliver_document(uuid,uuid,text,uuid,text,text) to authenticated;

-- ── The worker's outcome drives the delivery's status ─────────────────────────────────────────────
-- Without this the delivery row would claim 'queued' forever even after the message was sent (or after
-- it was abandoned), so the operator's Documents screen would report a state that never happened.
create or replace function private.sync_document_delivery_on_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_delivery_id uuid;
begin
  begin
    v_delivery_id := (new.payload->>'documentDeliveryId')::uuid;
  exception when others then
    return new;
  end;
  if v_delivery_id is null then return new; end if;

  if new.status = 'sent' then
    update public.document_deliveries d
    set status='sent', last_error=null
    where d.id=v_delivery_id and d.status='queued';
  elsif new.status in ('dead_letter','canceled') then
    update public.document_deliveries d
    set status='failed', last_error=left(coalesce(new.last_error,new.status),500)
    where d.id=v_delivery_id and d.status='queued';
  end if;

  -- The plaintext secure-link token is only needed while the job is in flight. Once the job is
  -- terminal, strip it so a queue row is never a durable copy of a live credential. (A dead-lettered
  -- job keeps no token either: the link is dead to the worker, and the delivery is already 'failed'.)
  if new.payload ? 'secureLinkToken' then
    update private.notification_jobs j
    set payload = j.payload - 'secureLinkToken'
    where j.id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_document_delivery_on_notification on private.notification_jobs;
create trigger sync_document_delivery_on_notification
after update of status on private.notification_jobs
for each row
when (new.status is distinct from old.status and new.status in ('sent','dead_letter','canceled'))
execute function private.sync_document_delivery_on_notification();

-- ── redeem_document_secure_link: open a tokenized delivery without a portal account ───────────────
-- Anonymous by necessity — the recipient may have no account. The token hash is the entire credential,
-- so the lookup is exact-match on a unique index and every rejection returns the SAME sentinel: a
-- caller cannot distinguish "no such token" from "expired" from "already revoked" and probe the table.
create or replace function public.redeem_document_secure_link(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery public.document_deliveries%rowtype;
  v_version public.document_versions%rowtype;
  v_document public.documents%rowtype;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='P0002',message='SECURE_LINK_NOT_REDEEMABLE';
  end if;

  select * into v_delivery from public.document_deliveries d
  where d.secure_link_token_hash = p_token_hash
  for update;
  if not found
     or v_delivery.delivery_channel <> 'secure_link'
     or v_delivery.status not in ('queued','sent','delivered')
     or v_delivery.expires_at is null
     or v_delivery.expires_at <= now() then
    raise exception using errcode='P0002',message='SECURE_LINK_NOT_REDEEMABLE';
  end if;

  select * into v_version from public.document_versions dv where dv.id=v_delivery.document_version_id;
  if not found or v_version.upload_status <> 'clean' then
    raise exception using errcode='P0002',message='SECURE_LINK_NOT_REDEEMABLE';
  end if;
  select * into v_document from public.documents d where d.id=v_version.document_id;
  if not found or v_document.status <> 'active' then
    raise exception using errcode='P0002',message='SECURE_LINK_NOT_REDEEMABLE';
  end if;

  update public.document_deliveries
  set status='delivered', delivered_at=coalesce(delivered_at,now()), redeemed_at=coalesce(redeemed_at,now())
  where id=v_delivery.id;

  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
  values (v_delivery.organization_id,null,'system','document.secureLinkRedeemed','document_delivery',v_delivery.id,gen_random_uuid(),
    jsonb_build_object('documentDeliveryId',v_delivery.id,'documentVersionId',v_version.id));

  -- Storage coordinates only; the caller signs a short-lived URL. No token, no recipient identity.
  return jsonb_build_object(
    'documentDeliveryId',v_delivery.id,
    'organizationId',v_delivery.organization_id,
    'documentTitle',v_document.title,
    'fileName',v_version.original_filename,
    'mimeType',v_version.mime_type,
    'storageBucket',v_version.storage_bucket,
    'storagePath',v_version.storage_path,
    'expiresAt',v_delivery.expires_at
  );
end;
$$;
revoke all on function public.redeem_document_secure_link(text) from public;
grant execute on function public.redeem_document_secure_link(text) to anon,authenticated;

commit;
