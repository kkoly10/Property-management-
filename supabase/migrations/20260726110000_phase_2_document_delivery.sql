-- Phase 2: document delivery & acknowledgement — the required Crecy OS
-- "document storage/version/delivery/acknowledgement" surface (doc 10 §2).
--
-- The persistence, the private.can_manage_document_version() gate, and the two SELECT policies are
-- already authoritative in docs 12 (tables public.document_deliveries / public.document_acknowledgements)
-- and 13 (the helper + document_deliveries_self_or_manager_read + document_ack_self_or_manager_read),
-- and are therefore already counted in the authority table/policy totals. No migration had ever created
-- them, so this brings the runtime chain into line with the authority and adds the two commands:
--   * public.deliver_document          — operator posts a finalized (clean) document version to a
--                                         portal recipient identified by their active user_relationship.
--   * public.acknowledge_document_delivery (doc 14 §4.26) — the recipient records an append-only
--                                         acknowledgement (viewed/received/accepted/declined/signed_external).
--
-- Base tables stay SELECT-only from the browser (writes flow through these definer commands); the RLS
-- SELECT policies let a recipient read their own deliveries/acks and a documents.manage operator read
-- the ones they manage. Acknowledgements are append-only structurally: no update/delete grant exists
-- and there is no correction command — a mistaken ack is superseded by a later ack of the right type.
begin;

-- The document-scoped manage gate doc 13 wires into the delivery/ack read policies. Mirrored here in
-- runtime style (search_path='' + fully-qualified refs), semantically identical to the authority copy.
create or replace function private.can_manage_document_version(p_document_version_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.document_versions dv
    join public.documents d on d.id = dv.document_id
    where dv.id = p_document_version_id
      and (
        (d.property_id is not null and private.has_property_access(d.property_id,'documents.manage'))
        or (d.property_id is null and private.has_unscoped_org_permission(d.organization_id,'documents.manage'))
      )
  );
$$;
revoke all on function private.can_manage_document_version(uuid) from public;
grant execute on function private.can_manage_document_version(uuid) to authenticated;

create table if not exists public.document_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  document_version_id uuid not null references public.document_versions(id) on delete restrict,
  recipient_user_id uuid references auth.users(id) on delete restrict,
  recipient_relationship_type text,
  recipient_relationship_id uuid,
  delivery_channel text not null check (delivery_channel in ('portal','email','secure_link')),
  status text not null default 'queued' check (status in ('queued','sent','delivered','failed','revoked')),
  delivered_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, id)
);
create index if not exists document_deliveries_recipient_idx
  on public.document_deliveries (recipient_user_id, created_at desc);
create index if not exists document_deliveries_version_idx
  on public.document_deliveries (document_version_id);

create table if not exists public.document_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  document_delivery_id uuid not null references public.document_deliveries(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  acknowledgement_type text not null check (acknowledgement_type in ('viewed','received','accepted','declined','signed_external')),
  legal_document_version text,
  evidence_hash text not null,
  acknowledged_at timestamptz not null default now(),
  unique (document_delivery_id, user_id, acknowledgement_type)
);

alter table public.document_deliveries enable row level security;
alter table public.document_acknowledgements enable row level security;
grant select on public.document_deliveries, public.document_acknowledgements to authenticated;
revoke insert, update, delete on public.document_deliveries, public.document_acknowledgements from anon, authenticated;

create policy document_deliveries_self_or_manager_read on public.document_deliveries for select to authenticated using (
  recipient_user_id = (select auth.uid())
  or (select private.can_manage_document_version(document_version_id))
);
create policy document_ack_self_or_manager_read on public.document_acknowledgements for select to authenticated using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.document_deliveries dd
    where dd.id = document_delivery_id
      and (select private.can_manage_document_version(dd.document_version_id))
  )
);

-- Operator delivers a finalized, clean document version to a portal recipient. The recipient is
-- identified by their active user_relationship (mirrors portal-access provisioning); email/secure_link
-- channels are reserved for a later delivery worker, so only 'portal' is accepted here.
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
declare
  v_actor_id uuid := auth.uid();
  v_version public.document_versions%rowtype;
  v_document public.documents%rowtype;
  v_recipient_user_id uuid;
  v_delivery_id uuid := gen_random_uuid();
  v_delivered_at timestamptz := now();
  v_request_hash text;
  v_previous private.idempotency_records%rowtype;
  v_correlation_id uuid := gen_random_uuid();
  v_response jsonb;
begin
  if v_actor_id is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 200 then
    raise exception using errcode='23514',message='INVALID_IDEMPOTENCY_KEY';
  end if;
  if p_delivery_channel is null or p_delivery_channel <> 'portal' then
    raise exception using errcode='23514',message='UNSUPPORTED_DELIVERY_CHANNEL';
  end if;
  if p_recipient_relationship_type is null or p_recipient_relationship_id is null then
    raise exception using errcode='23514',message='INVALID_DELIVERY_RECIPIENT';
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

  v_request_hash := encode(sha256(convert_to(jsonb_build_object(
    'documentVersionId',p_document_version_id,'recipientRelationshipType',p_recipient_relationship_type,
    'recipientRelationshipId',p_recipient_relationship_id,'deliveryChannel',p_delivery_channel
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

  insert into public.document_deliveries(
    id,organization_id,document_version_id,recipient_user_id,recipient_relationship_type,recipient_relationship_id,
    delivery_channel,status,delivered_at
  ) values (
    v_delivery_id,p_organization_id,p_document_version_id,v_recipient_user_id,p_recipient_relationship_type,p_recipient_relationship_id,
    'portal','delivered',v_delivered_at
  );

  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
  values (p_organization_id,v_actor_id,'user','document.delivered','document_delivery',v_delivery_id,v_correlation_id,
    jsonb_build_object('documentVersionId',p_document_version_id,'recipientUserId',v_recipient_user_id,'deliveryChannel','portal'));
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
  values (p_organization_id,'document.delivered','document_delivery',v_delivery_id,v_correlation_id,
    jsonb_build_object('documentDeliveryId',v_delivery_id,'documentVersionId',p_document_version_id,'recipientUserId',v_recipient_user_id));

  v_response := jsonb_build_object(
    'documentDeliveryId',v_delivery_id,'documentVersionId',p_document_version_id,'recipientUserId',v_recipient_user_id,
    'deliveryChannel','portal','status','delivered','deliveredAt',v_delivered_at
  );
  update private.idempotency_records r set state='completed',response_status=201,response_body=v_response,
    resource_type='document_delivery',resource_id=v_delivery_id,completed_at=now()
  where r.organization_id=p_organization_id and r.actor_user_id=v_actor_id
    and r.route='DeliverDocument' and r.idempotency_key=p_idempotency_key;
  return v_response;
end;
$$;
revoke all on function public.deliver_document(uuid,uuid,text,uuid,text,text) from public,anon;
grant execute on function public.deliver_document(uuid,uuid,text,uuid,text,text) to authenticated;

-- The recipient records an append-only acknowledgement against a delivery addressed to them (§4.26).
create or replace function public.acknowledge_document_delivery(
  p_organization_id uuid,
  p_document_delivery_id uuid,
  p_acknowledgement_type text,
  p_evidence_hash text,
  p_legal_document_version text,
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
  v_already_acknowledged boolean;
  v_evidence_hash text := nullif(trim(coalesce(p_evidence_hash,'')),'');
  v_legal_version text := nullif(trim(coalesce(p_legal_document_version,'')),'');
  v_acknowledgement_id uuid := gen_random_uuid();
  v_acknowledged_at timestamptz := now();
  v_request_hash text;
  v_previous private.idempotency_records%rowtype;
  v_correlation_id uuid := gen_random_uuid();
  v_response jsonb;
begin
  if v_actor_id is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 200 then
    raise exception using errcode='23514',message='INVALID_IDEMPOTENCY_KEY';
  end if;
  if p_acknowledgement_type not in ('viewed','received','accepted','declined','signed_external') then
    raise exception using errcode='23514',message='INVALID_ACKNOWLEDGEMENT_TYPE';
  end if;
  if v_evidence_hash is null or length(v_evidence_hash) not between 8 and 200 then
    raise exception using errcode='23514',message='INVALID_EVIDENCE_HASH';
  end if;

  select * into v_delivery from public.document_deliveries dd
  where dd.id=p_document_delivery_id and dd.organization_id=p_organization_id;
  if not found then raise exception using errcode='P0002',message='DOCUMENT_DELIVERY_NOT_FOUND'; end if;
  if v_delivery.recipient_user_id is null or v_delivery.recipient_user_id <> v_actor_id then
    raise exception using errcode='42501',message='DOCUMENT_DELIVERY_FORBIDDEN';
  end if;

  -- Capture existence BEFORE the insert; the duplicate-type guard depends on this command's own
  -- prior side effect, so it is enforced AFTER the idempotency short-circuit below.
  select exists (
    select 1 from public.document_acknowledgements a
    where a.document_delivery_id=p_document_delivery_id and a.user_id=v_actor_id
      and a.acknowledgement_type=p_acknowledgement_type
  ) into v_already_acknowledged;

  v_request_hash := encode(sha256(convert_to(jsonb_build_object(
    'documentDeliveryId',p_document_delivery_id,'acknowledgementType',p_acknowledgement_type,
    'evidenceHash',v_evidence_hash,'legalDocumentVersion',v_legal_version
  )::text,'UTF8')),'hex');
  select * into v_previous from private.idempotency_records r
  where r.organization_id=p_organization_id and r.actor_user_id=v_actor_id
    and r.route='AcknowledgeDocumentDelivery' and r.idempotency_key=p_idempotency_key;
  if found then
    if v_previous.request_hash<>v_request_hash then raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT'; end if;
    if v_previous.state='completed' then return v_previous.response_body; end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;

  if v_already_acknowledged then
    raise exception using errcode='23505',message='DOCUMENT_DELIVERY_ALREADY_ACKNOWLEDGED';
  end if;

  insert into private.idempotency_records(organization_id,actor_user_id,route,idempotency_key,request_hash,expires_at)
  values (p_organization_id,v_actor_id,'AcknowledgeDocumentDelivery',p_idempotency_key,v_request_hash,now()+interval '24 hours');

  insert into public.document_acknowledgements(
    id,organization_id,document_delivery_id,user_id,acknowledgement_type,legal_document_version,evidence_hash,acknowledged_at
  ) values (
    v_acknowledgement_id,p_organization_id,p_document_delivery_id,v_actor_id,p_acknowledgement_type,v_legal_version,v_evidence_hash,v_acknowledged_at
  );

  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
  values (p_organization_id,v_actor_id,'user','document.acknowledged','document_acknowledgement',v_acknowledgement_id,v_correlation_id,
    jsonb_build_object('documentDeliveryId',p_document_delivery_id,'acknowledgementType',p_acknowledgement_type));
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
  values (p_organization_id,'document.acknowledged','document_acknowledgement',v_acknowledgement_id,v_correlation_id,
    jsonb_build_object('documentDeliveryId',p_document_delivery_id,'acknowledgementId',v_acknowledgement_id,'type',p_acknowledgement_type));

  v_response := jsonb_build_object(
    'acknowledgementId',v_acknowledgement_id,'documentDeliveryId',p_document_delivery_id,
    'acknowledgementType',p_acknowledgement_type,'acknowledgedAt',v_acknowledged_at
  );
  update private.idempotency_records r set state='completed',response_status=201,response_body=v_response,
    resource_type='document_acknowledgement',resource_id=v_acknowledgement_id,completed_at=now()
  where r.organization_id=p_organization_id and r.actor_user_id=v_actor_id
    and r.route='AcknowledgeDocumentDelivery' and r.idempotency_key=p_idempotency_key;
  return v_response;
end;
$$;
revoke all on function public.acknowledge_document_delivery(uuid,uuid,text,text,text,text) from public,anon;
grant execute on function public.acknowledge_document_delivery(uuid,uuid,text,text,text,text) to authenticated;

commit;
