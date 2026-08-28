-- Phase 4 hardening: redeem a secure link with the TOKEN, not with its stored hash.
--
-- redeem_document_secure_link shipped taking p_token_hash, mirroring accept_staff_invitation. Those
-- invitation commands are `authenticated`-only; this one is granted to **anon** by necessity (the
-- recipient may have no account), and that difference matters: while the function accepts a hash, the
-- value stored in public.document_deliveries.secure_link_token_hash IS itself a bearer credential.
--
-- Today that is not exploitable — the delivery's RLS policy admits only the recipient themselves or
-- someone who can already manage the document version, and both already have the document. But it
-- makes an anon-reachable credential out of a column, so any future projection, export, log, or backup
-- that surfaces the hash silently becomes a way in. Taking the plaintext token and hashing it inside
-- the function removes that property entirely, at no cost.
--
-- Forward-only. The parameter is renamed, which `create or replace` cannot do, so the old signature is
-- dropped first. Nothing referenced it but the redemption route, which is updated in the same change.
begin;

drop function if exists public.redeem_document_secure_link(text);

create function public.redeem_document_secure_link(p_secure_link_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token_hash text;
  v_delivery public.document_deliveries%rowtype;
  v_version public.document_versions%rowtype;
  v_document public.documents%rowtype;
begin
  -- Shape-check before hashing so a hostile payload cannot become an expensive digest.
  if p_secure_link_token is null or length(p_secure_link_token) not between 16 and 512 then
    raise exception using errcode='P0002',message='SECURE_LINK_NOT_REDEEMABLE';
  end if;
  v_token_hash := encode(sha256(convert_to(p_secure_link_token,'UTF8')),'hex');

  select * into v_delivery from public.document_deliveries d
  where d.secure_link_token_hash = v_token_hash
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
