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
--   1. An overload of each invite command taking `p_defer_for_auth_token`, a BOOLEAN — not a
--      credential. When true it holds the queued job back briefly so the route can attach the auth
--      credential before the worker can claim it.
--
--      An earlier draft of this migration let the overload take the auth link itself as
--      `p_auth_action_url`. These functions are granted to `authenticated`, so any operator with
--      invite permission could have called them straight through PostgREST with a URL of their
--      choosing, and the Crecy worker would have sent that URL to the invited person under Crecy
--      branding from a Crecy sending domain. A regex proving "https and no angle brackets" proves
--      shape, never provenance. The credential therefore does not travel through an
--      operator-callable function at all: `public.attach_invitation_auth_token` below is
--      `service_role`-only, it takes an OPAQUE TOKEN HASH rather than a URL, and the worker builds
--      the link itself from its own origin. Nothing a caller supplies can decide where an
--      invitation points.
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
  p_defer_for_auth_token boolean
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
  -- `available_at` is the worker's claim gate (`status='queued' and available_at <= now()`). Holding
  -- it back is what removes the race: the command commits, and only THEN does the route attach the
  -- auth credential as `service_role`. Without the deferral a cron tick landing in that window would
  -- send an invitation with no credential in it — the dead-end link this whole slice exists to
  -- remove, reappearing rarely and unreproducibly.
  --
  -- The attach step sets `available_at` back to now(), so the normal path is not delayed at all. If
  -- the attach never happens, the invitation still goes out two minutes later carrying the bare
  -- acceptance link, which is the previous behaviour rather than a lost message.
  update private.notification_jobs j
  set payload = j.payload
    || jsonb_build_object('mfaRequired', coalesce(p_mfa_required, false))
    || case when v_organization_name is null then '{}'::jsonb
            else jsonb_build_object('organizationName', v_organization_name) end,
    available_at = case when coalesce(p_defer_for_auth_token, false)
                        then greatest(j.available_at, now() + interval '2 minutes')
                        else j.available_at end
  where j.organization_id = p_organization_id
    and j.idempotency_key = 'staff-invitation:' || v_invitation_id
    and j.status = 'queued';

  return v_result;
end;
$$;
revoke all on function public.invite_staff_member(uuid,uuid,text,text,uuid[],timestamptz,timestamptz,boolean,text,text,text,text,text,text,boolean) from public,anon;
grant execute on function public.invite_staff_member(uuid,uuid,text,text,uuid[],timestamptz,timestamptz,boolean,text,text,text,text,text,text,boolean) to authenticated;

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
  p_defer_for_auth_token boolean
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
  v_result := public.invite_relationship_user(
    p_organization_id, p_invited_user_id, p_relationship_type, p_relationship_id,
    p_email, p_locale, p_redirect_surface, p_token_hash, p_token_prefix, p_idempotency_key,
    p_activation_token
  );

  v_invitation_id := v_result->>'invitationId';
  if v_invitation_id is null then return v_result; end if;

  select o.display_name into v_organization_name
  from public.organizations o where o.id = p_organization_id;

  -- See the staff overload: the deferral is what lets the service-role attach step win the race
  -- against a cron tick, and the attach step clears it immediately.
  update private.notification_jobs j
  set payload = j.payload
    || case when v_organization_name is null then '{}'::jsonb
            else jsonb_build_object('organizationName', v_organization_name) end,
    available_at = case when coalesce(p_defer_for_auth_token, false)
                        then greatest(j.available_at, now() + interval '2 minutes')
                        else j.available_at end
  where j.organization_id = p_organization_id
    and j.idempotency_key = 'relationship-invitation:' || v_invitation_id
    and j.status = 'queued';

  return v_result;
end;
$$;
revoke all on function public.invite_relationship_user(uuid,uuid,text,uuid,text,text,text,text,text,text,text,boolean) from public,anon;
grant execute on function public.invite_relationship_user(uuid,uuid,text,uuid,text,text,text,text,text,text,text,boolean) to authenticated;


-- ── The credential, attached by the server and nobody else ───────────────────────────────────────
-- Granted to `service_role` ALONE. The invite commands above run as the operator, because they must
-- check that operator's permissions; this one runs only as the deployment itself, because what it
-- writes is a credential that signs somebody in.
--
-- It takes a TOKEN HASH, never a URL. The worker builds the link from its own configured origin, so
-- the destination of an invitation email is not an input to anything: the worst a malformed or
-- foreign hash can do is land the recipient on Crecy's own `/auth/confirm`, fail `verifyOtp`, and
-- redirect to the login page. There is no value here that can point an invitation off-site.
--
-- The update is bound on every dimension that could otherwise be substituted:
--
--   organization       a credential cannot be written across a tenant boundary
--   invitation id      via the job's idempotency key, which the command owns
--   template code      it must be an INVITATION email, not any job sharing that key shape
--   recipient address  the address the credential was minted for, case-insensitively
--   channel            email only
--   queued status      never a claimed, sent, or already-scrubbed job
--
-- The recipient binding is the one that matters most and is easiest to omit. A magic-link hash
-- authenticates exactly one identity; attaching it to a job addressed to somebody else would deliver a
-- working session for one person into another person's inbox.
create or replace function public.attach_invitation_auth_token(
  p_organization_id uuid,
  p_invitation_kind text,
  p_invitation_id uuid,
  p_recipient_address text,
  p_auth_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prefix text;
  v_templates text[];
  v_updated integer;
begin
  if p_organization_id is null or p_invitation_id is null then
    raise exception using errcode='23514',message='INVALID_INVITATION_REFERENCE';
  end if;
  if p_invitation_kind is null or p_invitation_kind not in ('staff','relationship') then
    raise exception using errcode='23514',message='INVALID_INVITATION_KIND';
  end if;
  -- The same shape `/auth/confirm` enforces before redeeming one: URL-safe, bounded. A value that
  -- could not possibly be redeemed is refused here rather than stored and mailed.
  if p_auth_token_hash is null
     or length(p_auth_token_hash) not between 16 and 512
     or p_auth_token_hash !~ '^[A-Za-z0-9_-]+$' then
    raise exception using errcode='23514',message='INVALID_AUTH_TOKEN_HASH';
  end if;

  if p_recipient_address is null or length(trim(p_recipient_address)) = 0 then
    raise exception using errcode='23514',message='INVALID_RECIPIENT_ADDRESS';
  end if;

  v_prefix := case p_invitation_kind
                when 'staff' then 'staff-invitation:'
                else 'relationship-invitation:' end;
  -- The template set this kind of invitation is allowed to be. Binding it means the credential cannot
  -- be attached to a job that merely shares an id-shaped key — it must be an invitation email.
  v_templates := case p_invitation_kind
                   when 'staff' then array['staff_invitation']
                   else array['resident_invitation','owner_invitation'] end;

  -- Only a job still waiting to be sent, and only within the stated organization. On an idempotent
  -- replay the invitation already exists and its job may be long terminal; writing a credential back
  -- into a row the scrub has already cleaned would resurrect it.
  --
  -- `available_at` is cleared here, which is what releases the job the overload deliberately held
  -- back. Attaching the credential and making the message sendable are one step on purpose: there is
  -- no ordering in which the worker can see one without the other.
  update private.notification_jobs j
  set payload = j.payload || jsonb_build_object('authTokenHash', p_auth_token_hash),
      available_at = now()
  where j.organization_id = p_organization_id
    and j.idempotency_key = v_prefix || p_invitation_id::text
    and j.template_code = any(v_templates)
    -- Bound to the address the caller says it minted the credential FOR. A magic-link hash
    -- authenticates one identity; attaching it to a job addressed to somebody else would mail a
    -- working session for one person to the inbox of another. `citext` is not in play on this column,
    -- so the comparison is explicitly case-insensitive the way an address is.
    and lower(j.recipient_address) = lower(trim(p_recipient_address))
    and j.channel = 'email'
    and j.status = 'queued';
  get diagnostics v_updated = row_count;

  -- Not an error. A job already claimed, already sent, or already scrubbed is a real state, and the
  -- caller has nothing useful to do about it; the invitation itself is unaffected. The count is
  -- returned so a caller that wants to know can tell.
  return jsonb_build_object('attached', v_updated > 0);
end;
$$;
revoke all on function public.attach_invitation_auth_token(uuid,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.attach_invitation_auth_token(uuid,text,uuid,text,text) to service_role;


-- ── The operator can see whether the invitation actually left ────────────────────────────────────
-- "Queued" is honest but it is not the end of the story, and an operator who cannot see the rest has
-- only traded a confident lie for a permanent shrug. The delivery-status readers were kept when the
-- mark-as-sent commands were retired, but nothing consumed them: they are `service_role`-only and take
-- a single invitation id with no tenant predicate, so they could not be handed to the browser.
--
-- This projects a COARSE state onto the existing staff workspace instead — same query, same
-- authorization, no extra round trip. The raw `last_error` deliberately does not travel: it carries
-- relay and provider diagnostics (`RELAY_UNAUTHORIZED`, `MAIL_PROVIDER_NOT_CONFIGURED`) that answer a
-- question the operator did not ask and cannot act on. What they need is whether it left, whether it
-- is still trying, and whether it has given up.
--
--   queued      accepted, not yet sent (including the brief hold while the credential is attached)
--   sending     a worker has it right now
--   sent        a mail transport accepted it — the only state that means "it went"
--   retrying    a delivery failed and the worker will try again on its backoff
--   undeliverable  dead-lettered: it will not be retried, and a new invitation is needed
--   canceled    suppressed before sending
--   unknown     no job row (an invitation predating the queue)
create or replace function private.notification_delivery_state(p_idempotency_key text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case j.status
           when 'queued' then 'queued'
           when 'processing' then 'sending'
           when 'sent' then 'sent'
           when 'failed' then 'retrying'
           when 'dead_letter' then 'undeliverable'
           when 'canceled' then 'canceled'
           else 'unknown'
         end
  from private.notification_jobs j
  where j.idempotency_key = p_idempotency_key
  limit 1
$$;
revoke all on function private.notification_delivery_state(text) from public,anon,authenticated;


-- The workspace projection gains one field. The function is replaced whole rather than patched,
-- because that is the only way SQL offers; everything but the `deliveryState` line is the shipped
-- definition from 20260724134409.
create or replace function public.get_staff_management_workspace(
  p_organization_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_organization_id uuid;
  v_plan_code text;
  v_staff_limit integer;
  v_staff_count integer;
begin
  if v_actor_id is null then
    raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED';
  end if;
  select o.id into v_organization_id
  from public.organizations o
  where (p_organization_id is null or o.id=p_organization_id)
    and private.has_org_permission(o.id,'organization.manage')
  order by o.created_at,o.id
  limit 1;
  if v_organization_id is null then
    return jsonb_build_object(
      'authenticatorLevel',coalesce(auth.jwt()->>'aal','aal1'),
      'organization',null,
      'members','[]'::jsonb,
      'invitations','[]'::jsonb,
      'roles','[]'::jsonb,
      'properties','[]'::jsonb,
      'staffSeatCount',0,
      'staffSeatLimit',null
    );
  end if;
  select s.plan_code into v_plan_code
  from public.organization_subscriptions s
  where s.organization_id=v_organization_id
    and s.status in ('trialing','active','past_due','restricted')
  order by s.created_at desc
  limit 1;
  select e.limit_value::integer into v_staff_limit
  from public.plan_entitlements e
  where e.plan_code=v_plan_code
    and e.feature_code='core.staff'
    and e.enabled;
  select count(*)::integer into v_staff_count
  from public.organization_memberships m
  where m.organization_id=v_organization_id
    and m.status in ('invited','active','suspended')
    and (m.ends_at is null or m.ends_at>now());

  return jsonb_build_object(
    'authenticatorLevel',coalesce(auth.jwt()->>'aal','aal1'),
    'organization',(
      select jsonb_build_object(
        'organizationId',o.id,
        'organizationName',o.display_name,
        'planCode',v_plan_code
      )
      from public.organizations o
      where o.id=v_organization_id
    ),
    'staffSeatCount',v_staff_count,
    'staffSeatLimit',v_staff_limit,
    'members',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'membershipId',m.id,
        'userId',m.user_id,
        'displayName',coalesce(p.display_name,u.email,'Invited staff member'),
        'email',u.email,
        'roleCode',m.role_code,
        'roleName',r.display_name,
        'status',m.status,
        'mfaRequired',m.mfa_required,
        'startsAt',m.starts_at,
        'endsAt',m.ends_at,
        'propertyIds',(
          select coalesce(jsonb_agg(s.property_id order by s.property_id),'[]'::jsonb)
          from public.membership_property_scopes s
          where s.membership_id=m.id
        ),
        'isCurrentUser',m.user_id=v_actor_id,
        'version',m.version
      ) order by
        case m.status when 'active' then 0 when 'invited' then 1
          when 'suspended' then 2 else 3 end,
        lower(coalesce(p.display_name,u.email,'')),m.created_at),'[]'::jsonb)
      from public.organization_memberships m
      join public.role_definitions r on r.code=m.role_code
      join auth.users u on u.id=m.user_id
      left join public.profiles p on p.user_id=m.user_id
      where m.organization_id=v_organization_id
    ),
    'invitations',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'invitationId',i.id,
        'membershipId',i.membership_id,
        'email',i.email,
        'status',case
          when i.status='pending' and i.expires_at<=now() then 'expired'
          else i.status
        end,
        'expiresAt',i.expires_at,
        'createdAt',i.created_at,
        -- Whether the invitation email actually left. See the migration that adds this helper: a
        -- coarse state only, never the relay's own error text.
        'deliveryState',coalesce(private.notification_delivery_state('staff-invitation:'||i.id::text),'unknown')
      ) order by i.created_at desc),'[]'::jsonb)
      from public.invitations i
      where i.organization_id=v_organization_id
        and i.invitation_type='organization_member'
    ),
    'roles',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'code',r.code,
        'displayName',r.display_name,
        'organizationWideAllowed',r.organization_wide_allowed,
        'sensitive',r.code in ('org_owner','org_admin','accountant')
      ) order by r.display_name),'[]'::jsonb)
      from public.role_definitions r
    ),
    'properties',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'propertyId',p.id,'propertyName',p.name
      ) order by lower(p.name),p.id),'[]'::jsonb)
      from public.properties p
      where p.organization_id=v_organization_id
        and p.archived_at is null
        and p.status<>'archived'
    )
  );
end;
$$;
revoke all on function public.get_staff_management_workspace(uuid) from public,anon;
grant execute on function public.get_staff_management_workspace(uuid) to authenticated;


-- Residents and owners are invited from their own directories, not from the team page, so the staff
-- workspace projection above reaches neither. This is the same coarse state for a RELATIONSHIP
-- invitation, keyed by the relationship the directory already has in hand.
--
-- Definer, because `private.notification_jobs` is not readable from the browser, and gated on the same
-- org permission the directories themselves require. `resident.read` and `owner.read` are deliberately
-- both accepted: one call serves both directories, and each row is already scoped to the caller's
-- organization, so the narrower question of which directory is asking adds no protection.
create or replace function public.list_relationship_invitation_delivery(
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rows jsonb;
begin
  if (select auth.uid()) is null then
    raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED';
  end if;
  if not (private.has_org_permission(p_organization_id, 'resident.read')
          or private.has_org_permission(p_organization_id, 'resident.manage')
          or private.has_org_permission(p_organization_id, 'owner.read')
          or private.has_org_permission(p_organization_id, 'owner.manage')) then
    raise exception using errcode='42501',message='ORGANIZATION_SCOPE_DENIED';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'relationshipId', i.relationship_id,
    'deliveryState', coalesce(private.notification_delivery_state('relationship-invitation:'||i.id::text),'unknown')
  ) order by i.created_at desc), '[]'::jsonb)
  into v_rows
  from public.invitations i
  where i.organization_id = p_organization_id
    and i.invitation_type in ('resident_relationship','owner_relationship')
    and i.status = 'pending'
    and i.relationship_id is not null;

  return v_rows;
end;
$$;
revoke all on function public.list_relationship_invitation_delivery(uuid) from public,anon;
grant execute on function public.list_relationship_invitation_delivery(uuid) to authenticated;

-- ── Scrub every persisted credential, not just the first one ─────────────────────────────────────
-- The trigger removed `invitationToken` by name. `authTokenHash` is a second, independent credential:
-- anyone holding it can redeem it at `/auth/confirm` and sign in as the invited person. Naming one key and not the other is the failure mode this function exists to prevent, so it
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
  v_credential_keys constant text[] := array['invitationToken', 'authTokenHash'];
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
