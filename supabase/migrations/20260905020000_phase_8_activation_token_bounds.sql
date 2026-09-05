begin;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- Bound the activation token the way every other command input is bounded.
--
-- 20260905000000 added p_activation_token so the invitation email could carry the token that makes
-- its link work, but it validated the value only as "not blank" before writing it into a queued
-- notification payload. Both overloads are granted to `authenticated`, and PostgREST will hand any
-- signed-in caller straight to them — so the only thing standing between a hostile caller and an
-- arbitrarily large string inside private.notification_jobs was the good manners of our own two API
-- routes, which mint the token as a base64url HMAC-SHA256 digest: 43 characters, [A-Za-z0-9_-].
--
-- Validated here rather than in zod because zod only guards the route; this guards the command, which
-- is the surface actually exposed. The token stays optional — null means "no token", exactly as
-- before — but a value that is present must look like the credential it claims to be.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────

create or replace function public.invite_relationship_user(
  p_organization_id uuid,
  p_invited_user_id uuid,
  p_relationship_type text,
  p_relationship_id uuid,
  p_email text,
  p_locale text,
  p_redirect_surface text,
  p_token_hash text,
  p_token_prefix text,
  p_idempotency_key text,
  p_activation_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_invitation_id text;
begin
  if p_activation_token is not null
     and (length(p_activation_token) not between 16 and 200 or p_activation_token !~ '^[A-Za-z0-9_-]+$') then
    raise exception using errcode='23514',message='INVALID_ACTIVATION_TOKEN';
  end if;

  v_result := public.invite_relationship_user(
    p_organization_id, p_invited_user_id, p_relationship_type, p_relationship_id,
    p_email, p_locale, p_redirect_surface, p_token_hash, p_token_prefix, p_idempotency_key
  );

  v_invitation_id := v_result->>'invitationId';
  if p_activation_token is not null and v_invitation_id is not null then
    -- Only a job still waiting to be sent is stamped. On an idempotent replay the invitation already
    -- exists and its job may be long gone; re-adding a token to a sent job would resurrect a
    -- credential in a row the scrub has already cleaned.
    update private.notification_jobs j
    set payload = j.payload || jsonb_build_object('invitationToken', p_activation_token)
    where j.organization_id = p_organization_id
      and j.idempotency_key = 'relationship-invitation:' || v_invitation_id
      and j.status = 'queued';
  end if;

  return v_result;
end;
$$;
revoke all on function public.invite_relationship_user(uuid,uuid,text,uuid,text,text,text,text,text,text,text) from public,anon;
grant execute on function public.invite_relationship_user(uuid,uuid,text,uuid,text,text,text,text,text,text,text) to authenticated;

create or replace function public.invite_staff_member(
  p_organization_id uuid,
  p_invited_user_id uuid,
  p_email text,
  p_role_code text,
  p_property_ids uuid[],
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_mfa_required boolean,
  p_locale text,
  p_token_hash text,
  p_token_prefix text,
  p_audit_reason text,
  p_idempotency_key text,
  p_activation_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_invitation_id text;
begin
  if p_activation_token is not null
     and (length(p_activation_token) not between 16 and 200 or p_activation_token !~ '^[A-Za-z0-9_-]+$') then
    raise exception using errcode='23514',message='INVALID_ACTIVATION_TOKEN';
  end if;

  v_result := public.invite_staff_member(
    p_organization_id, p_invited_user_id, p_email, p_role_code, p_property_ids,
    p_starts_at, p_ends_at, p_mfa_required, p_locale, p_token_hash, p_token_prefix,
    p_audit_reason, p_idempotency_key
  );

  v_invitation_id := v_result->>'invitationId';
  if p_activation_token is not null and v_invitation_id is not null then
    update private.notification_jobs j
    set payload = j.payload || jsonb_build_object('invitationToken', p_activation_token)
    where j.organization_id = p_organization_id
      and j.idempotency_key = 'staff-invitation:' || v_invitation_id
      and j.status = 'queued';
  end if;

  return v_result;
end;
$$;
revoke all on function public.invite_staff_member(uuid,uuid,text,text,uuid[],timestamptz,timestamptz,boolean,text,text,text,text,text,text) from public,anon;
grant execute on function public.invite_staff_member(uuid,uuid,text,text,uuid[],timestamptz,timestamptz,boolean,text,text,text,text,text,text) to authenticated;

commit;
