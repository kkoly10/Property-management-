begin;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- Put the activation token in the invitation email.
--
-- Every invitation notification linked to a bare /invitations/accept with no token, and that page
-- requires one — so the branded invitation email in a recipient's inbox was a dead end reading
-- "The invitation link is incomplete." The real activation rode a separate Supabase Auth magic link,
-- which is single-use and expires in at most 24 hours while the invitation itself is valid for 72.
--
-- The command cannot mint the link itself: it receives only p_token_hash, never the raw token, which
-- is the right design — public.invitations stores a hash and nothing else. So the caller, which does
-- hold the raw token, passes it in and the command stamps it onto the queued job for the worker to
-- build the URL from. That is exactly how deliver_document already handles a secure-link token, down
-- to scrubbing it once the job is terminal so a queue row is never a durable copy of a live
-- credential.
--
-- Both original signatures are kept and delegated to, mirroring deliver_document's 6-arg/7-arg pair:
-- PostgREST resolves an overload by the exact set of argument names, so a caller that sends the token
-- gets this function and one that does not keeps the old behaviour.
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
  v_result := public.invite_relationship_user(
    p_organization_id, p_invited_user_id, p_relationship_type, p_relationship_id,
    p_email, p_locale, p_redirect_surface, p_token_hash, p_token_prefix, p_idempotency_key
  );

  v_invitation_id := v_result->>'invitationId';
  if p_activation_token is not null and length(trim(p_activation_token)) > 0 and v_invitation_id is not null then
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
  v_result := public.invite_staff_member(
    p_organization_id, p_invited_user_id, p_email, p_role_code, p_property_ids,
    p_starts_at, p_ends_at, p_mfa_required, p_locale, p_token_hash, p_token_prefix,
    p_audit_reason, p_idempotency_key
  );

  v_invitation_id := v_result->>'invitationId';
  if p_activation_token is not null and length(trim(p_activation_token)) > 0 and v_invitation_id is not null then
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

-- The plaintext activation token is only needed while the job is in flight. Once the job reaches a
-- terminal state, strip it — the same rule sync_document_delivery_on_notification applies to a
-- secure-link token, and for the same reason: a queue row must never outlive its usefulness as a copy
-- of a live credential.
create or replace function private.scrub_invitation_token_on_terminal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.payload ? 'invitationToken' then
    update private.notification_jobs j
    set payload = j.payload - 'invitationToken'
    where j.id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists scrub_invitation_token_on_terminal on private.notification_jobs;
create trigger scrub_invitation_token_on_terminal
after update of status on private.notification_jobs
for each row
when (new.status is distinct from old.status and new.status in ('sent','dead_letter','canceled'))
execute function private.scrub_invitation_token_on_terminal();

commit;
