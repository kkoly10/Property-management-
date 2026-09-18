begin;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- One invitation, one email, one honest delivery state.
--
-- THE DEFECT THIS CLOSES. An invitation queued a Crecy `staff_invitation` / `resident_invitation` /
-- `owner_invitation` notification job, and then the route separately called `auth.signInWithOtp()`,
-- which made Supabase Auth send its OWN magic-link email. The route then called
-- `mark_staff_invitation_email_sent` / `mark_relationship_invitation_email_sent`, which flipped the
-- queued Crecy job to `sent`.
--
-- So the recipient got a plain Supabase email, the branded Crecy invitation was never sent by
-- anybody, and the queue recorded `sent` for a message no transport had ever accepted. A job status
-- that does not mean "a transport accepted this" is worse than no status at all: it is the one field
-- an operator reads to answer "did it arrive?".
--
-- After this migration the auth credential travels INSIDE the Crecy job, the Crecy worker sends the
-- one email, and `complete_notification_job` — which only runs after the transport returns success —
-- is the only thing that can write `sent`.
--
-- TWO THINGS ARE ADDED, both additive:
--
--   1. An overload of each invite command taking `p_auth_action_url`, the Supabase Auth action link
--      minted server-side by `auth.admin.generateLink`. It is stamped onto the queued job exactly the
--      way `p_activation_token` already is, for exactly the same reason: the command cannot mint it
--      (it never sees auth's internals) and the caller that holds it must not keep it either.
--   2. `organizationName` in the payload. `templates.ts` has always read it; nothing ever wrote it, so
--      every invitation said "your team" / "your home" / "your portfolio" instead of naming the
--      organization doing the inviting. An invitation that cannot say who it is from is exactly the
--      shape of mail a recipient is trained to delete.
--
-- WHAT IS DELIBERATELY NOT HERE. `roleCode` stays a code. `templates.ts` maps it to a human, LOCALIZED
-- role name ("a property manager" / "gestor de propiedades"); pre-rendering a label in SQL would pick
-- one language at queue time and ship it to every recipient. The template already falls back to
-- generic wording for an unknown code, so a raw identifier can never reach a reader either way.
--
-- No property, unit, balance, document title, lease detail or internal id is added to any payload.
-- Resident and owner invitations get the organization name and nothing else about the relationship:
-- the household or portfolio context is not unambiguously derivable here, and an invitation is read
-- by someone who has not authenticated yet.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────

-- ── Staff ────────────────────────────────────────────────────────────────────────────────────────
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
  p_activation_token text,
  p_auth_action_url text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_invitation_id text;
  v_organization_name text;
begin
  -- The auth action URL becomes the CALL TO ACTION in an email, and this function is granted to
  -- `authenticated` — so without a guard any signed-in caller could put an arbitrary destination in
  -- front of an invited person, under Crecy branding, from a Crecy sending domain. That is a phishing
  -- page with our own reputation behind it.
  --
  -- The real authority is the route, which mints this from `auth.admin.generateLink` and never from
  -- user input. This is the second line: https only (so `javascript:` and `data:` cannot survive),
  -- bounded, and no whitespace or angle brackets to break out of the href it is rendered into.
  if p_auth_action_url is not null
     and (length(p_auth_action_url) not between 16 and 2000
          or p_auth_action_url !~ '^https://[^[:space:]<>"''\\]+$') then
    raise exception using errcode='23514',message='INVALID_AUTH_ACTION_URL';
  end if;

  -- The shipped 14-argument overload does the whole command: validation, authorization, the
  -- membership row, the invitation row, the audit and outbox trace, and the queued job. This one only
  -- enriches what it produced, so none of that behaviour is restated or can drift.
  v_result := public.invite_staff_member(
    p_organization_id, p_invited_user_id, p_email, p_role_code, p_property_ids,
    p_starts_at, p_ends_at, p_mfa_required, p_locale, p_token_hash, p_token_prefix,
    p_audit_reason, p_idempotency_key, p_activation_token
  );

  v_invitation_id := v_result->>'invitationId';
  if v_invitation_id is null then return v_result; end if;

  select o.display_name into v_organization_name
  from public.organizations o where o.id = p_organization_id;

  -- Only a job still waiting to be sent is touched. On an idempotent replay the invitation already
  -- exists and its job may be long terminal; writing a credential back into a row the scrub has
  -- already cleaned would resurrect it.
  update private.notification_jobs j
  set payload = j.payload
    || jsonb_build_object('mfaRequired', coalesce(p_mfa_required, false))
    || case when v_organization_name is null then '{}'::jsonb
            else jsonb_build_object('organizationName', v_organization_name) end
    || case when p_auth_action_url is null or length(trim(p_auth_action_url)) = 0 then '{}'::jsonb
            else jsonb_build_object('authActionUrl', trim(p_auth_action_url)) end
  where j.organization_id = p_organization_id
    and j.idempotency_key = 'staff-invitation:' || v_invitation_id
    and j.status = 'queued';

  return v_result;
end;
$$;
revoke all on function public.invite_staff_member(uuid,uuid,text,text,uuid[],timestamptz,timestamptz,boolean,text,text,text,text,text,text,text) from public,anon;
grant execute on function public.invite_staff_member(uuid,uuid,text,text,uuid[],timestamptz,timestamptz,boolean,text,text,text,text,text,text,text) to authenticated;

-- ── Resident and owner ───────────────────────────────────────────────────────────────────────────
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
  p_activation_token text,
  p_auth_action_url text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_invitation_id text;
  v_organization_name text;
begin
  -- The auth action URL becomes the CALL TO ACTION in an email, and this function is granted to
  -- `authenticated` — so without a guard any signed-in caller could put an arbitrary destination in
  -- front of an invited person, under Crecy branding, from a Crecy sending domain. That is a phishing
  -- page with our own reputation behind it.
  --
  -- The real authority is the route, which mints this from `auth.admin.generateLink` and never from
  -- user input. This is the second line: https only (so `javascript:` and `data:` cannot survive),
  -- bounded, and no whitespace or angle brackets to break out of the href it is rendered into.
  if p_auth_action_url is not null
     and (length(p_auth_action_url) not between 16 and 2000
          or p_auth_action_url !~ '^https://[^[:space:]<>"''\\]+$') then
    raise exception using errcode='23514',message='INVALID_AUTH_ACTION_URL';
  end if;

  v_result := public.invite_relationship_user(
    p_organization_id, p_invited_user_id, p_relationship_type, p_relationship_id,
    p_email, p_locale, p_redirect_surface, p_token_hash, p_token_prefix, p_idempotency_key,
    p_activation_token
  );

  v_invitation_id := v_result->>'invitationId';
  if v_invitation_id is null then return v_result; end if;

  select o.display_name into v_organization_name
  from public.organizations o where o.id = p_organization_id;

  update private.notification_jobs j
  set payload = j.payload
    || case when v_organization_name is null then '{}'::jsonb
            else jsonb_build_object('organizationName', v_organization_name) end
    || case when p_auth_action_url is null or length(trim(p_auth_action_url)) = 0 then '{}'::jsonb
            else jsonb_build_object('authActionUrl', trim(p_auth_action_url)) end
  where j.organization_id = p_organization_id
    and j.idempotency_key = 'relationship-invitation:' || v_invitation_id
    and j.status = 'queued';

  return v_result;
end;
$$;
revoke all on function public.invite_relationship_user(uuid,uuid,text,uuid,text,text,text,text,text,text,text,text) from public,anon;
grant execute on function public.invite_relationship_user(uuid,uuid,text,uuid,text,text,text,text,text,text,text,text) to authenticated;

-- ── Scrub every persisted credential, not just the first one ─────────────────────────────────────
-- The trigger removed `invitationToken` by name. `authActionUrl` is a second, independent credential:
-- the action link embeds a hashed auth token, so anyone holding the row could sign in as the invited
-- person. Naming one key and not the other is the failure mode this function exists to prevent, so it
-- now strips a LIST, and adding a credential to a payload means adding it here.
--
-- `failed` is deliberately absent from the trigger's state list and stays absent: a failed job is
-- retryable, and the worker needs the credential to build the same message on the next attempt. Only
-- `sent`, `dead_letter` and `canceled` are terminal — past those, the row can never send anything
-- again and has no business holding a live credential.
create or replace function private.scrub_invitation_token_on_terminal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_credential_keys constant text[] := array['invitationToken', 'authActionUrl'];
  v_payload jsonb := new.payload;
  v_key text;
  v_changed boolean := false;
begin
  foreach v_key in array v_credential_keys loop
    if v_payload ? v_key then
      v_payload := v_payload - v_key;
      v_changed := true;
    end if;
  end loop;

  if v_changed then
    update private.notification_jobs j
    set payload = v_payload
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
