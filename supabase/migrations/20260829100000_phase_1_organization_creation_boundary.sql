-- v4.2 Batch A.1 — organization creation moves behind a server-only boundary, and the Growth trial
-- becomes the 30 days file 11 actually specifies.
--
-- (1) THE LEGAL GATE WAS BYPASSABLE.
--     A4 put the published-document gate in the Next server action. That is not a boundary while
--     public.create_organization remains executable by `authenticated` and accepts an arbitrary
--     p_terms_version: a signed-in browser could call the RPC directly with any string it liked —
--     "2026-07-20", "", "I agree" — and record a consent row against a document that was never
--     published, never shown, and in most cases does not exist. The gate has to sit where the WRITE
--     happens, not where the UI happens.
--
--     The implementation now lives in create_organization_as_actor, which is service_role only and
--     takes an explicit TRUSTED actor id. The Next server action derives that id from auth.getUser()
--     server-side; the browser never supplies it and never holds the service-role key.
--
--     public.create_organization is kept as a thin definer wrapper over the same implementation, so
--     there is exactly one body and no chance of the two drifting. Its `authenticated` grant is
--     removed in the CONTRACT release (supabase/migrations-contract), not here: the currently
--     deployed build still calls it from the browser, so revoking it now would break production
--     onboarding before the compatible build is live.
--
-- (2) THE GROWTH TRIAL WAS 14 DAYS, NOT 30.
--     File 11: "A 30-day no-card Growth trial is offered." The command provisioned 14 days in three
--     places — trial_ends_at, the initial current_period_end, and the response's trial.endsAt — and
--     onboarding advertised "Growth trial · 14 days". Every workspace ever created got half the trial
--     the pricing authority promises.
--
--     The length is now a single named function, so the runtime, the tests and any future billing
--     logic cannot disagree about it again.
--
-- Authority: no table, no policy. Counts unchanged.
begin;

-- ── The authoritative trial length ───────────────────────────────────────────────────────────────
-- One definition, referenced everywhere, so "how long is the Growth trial" has exactly one answer in
-- the database. File 11 is the authority; changing it is a pricing decision, not an implementation
-- detail, which is why it is named rather than inlined.
create or replace function private.growth_trial_length()
returns interval
language sql
immutable
set search_path = ''
as $$
  select interval '30 days'
$$;

-- ── create_organization_as_actor: the authoritative write ────────────────────────────────────────
-- service_role only, with an explicit trusted actor. Everything the browser command did is retained:
-- pre-organization actor-scoped idempotency, the organization, the owner membership, the Growth
-- trial, the consent record, audit, outbox, and the same response shape.
create or replace function public.create_organization_as_actor(
  p_actor_user_id uuid,
  p_display_name text,
  p_slug text,
  p_customer_path text,
  p_headquarters_country_code char(2),
  p_default_locale text,
  p_default_time_zone text,
  p_terms_version text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := p_actor_user_id;
  request_hash text;
  v_organization_id uuid;
  membership_id uuid;
  correlation_id uuid := gen_random_uuid();
  previous private.idempotency_records%rowtype;
  v_trial_ends_at timestamptz;
  response jsonb;
begin
  -- The caller is trusted to have authenticated the actor, but not to have invented one: the id must
  -- resolve to a real user. A caller that could pass an arbitrary uuid could otherwise create
  -- organizations owned by someone else.
  if actor_id is null then raise exception using errcode='28000',message='ACTOR_REQUIRED'; end if;
  if not exists (select 1 from auth.users u where u.id = actor_id) then
    raise exception using errcode='P0002',message='ACTOR_NOT_FOUND';
  end if;
  -- The consent binding is evidence. An empty or absent one is not a version, it is a blank line on a
  -- signature page, and it must never reach consent_records.
  if p_terms_version is null or length(trim(p_terms_version)) < 8 then
    raise exception using errcode='23514',message='CONSENT_VERSION_REQUIRED';
  end if;

  v_trial_ends_at := now() + private.growth_trial_length();

  request_hash := encode(sha256(convert_to(concat_ws('|',p_display_name,p_slug,p_customer_path,p_headquarters_country_code,p_default_locale,p_default_time_zone,p_terms_version),'UTF8')),'hex');
  select * into previous from private.idempotency_records r
    where r.organization_id is null and r.actor_user_id=actor_id and r.route='CreateOrganization' and r.idempotency_key=p_idempotency_key;
  if found then
    if previous.request_hash<>request_hash then raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT'; end if;
    if previous.state='completed' then return previous.response_body; end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;

  insert into private.idempotency_records(organization_id,actor_user_id,route,idempotency_key,request_hash,expires_at)
  values (null,actor_id,'CreateOrganization',p_idempotency_key,request_hash,now()+interval '24 hours');

  insert into public.organizations(display_name,slug,customer_path,headquarters_country_code,default_locale,default_time_zone,created_by)
  values (trim(p_display_name),lower(trim(p_slug)),p_customer_path,p_headquarters_country_code,p_default_locale,p_default_time_zone,actor_id)
  returning id into v_organization_id;

  insert into public.organization_memberships(organization_id,user_id,role_code,status,invited_by)
  values (v_organization_id,actor_id,'org_owner','active',actor_id)
  returning id into membership_id;

  insert into public.organization_subscriptions(organization_id,plan_code,country_price_book,status,trial_ends_at,current_period_start,current_period_end)
  values (v_organization_id,'growth',p_headquarters_country_code,'trialing',v_trial_ends_at,now(),v_trial_ends_at);

  insert into public.consent_records(user_id,organization_id,consent_type,purpose_code,legal_document_version,status,granted_at,locale,source_surface,evidence_hash)
  values (actor_id,v_organization_id,'terms_and_privacy','workspace_creation',p_terms_version,'granted',now(),p_default_locale,'onboarding.organization',encode(sha256(convert_to(concat(actor_id,p_terms_version,correlation_id),'UTF8')),'hex'));

  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
  values (v_organization_id,actor_id,'user','organization.created','organization',v_organization_id,correlation_id,jsonb_build_object('slug',lower(trim(p_slug)),'plan','growth'));

  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
  values (v_organization_id,'organization.created','organization',v_organization_id,correlation_id,jsonb_build_object('organizationId',v_organization_id,'actorUserId',actor_id));

  response := jsonb_build_object('organizationId',v_organization_id,'membershipId',membership_id,'roleCode','org_owner','trial',jsonb_build_object('planCode','growth','endsAt',v_trial_ends_at));
  update private.idempotency_records r set state='completed',response_status=201,response_body=response,resource_type='organization',resource_id=v_organization_id,completed_at=now()
    where r.organization_id is null and r.actor_user_id=actor_id and r.route='CreateOrganization' and r.idempotency_key=p_idempotency_key;
  return response;
end;
$$;
revoke all on function public.create_organization_as_actor(uuid,text,text,text,char(2),text,text,text,text) from public,anon,authenticated;
grant execute on function public.create_organization_as_actor(uuid,text,text,text,char(2),text,text,text,text) to service_role;

-- ── create_organization: the legacy browser surface, now a wrapper ───────────────────────────────
-- One implementation, so the trial length and the consent handling cannot drift between the two
-- entry points. The `authenticated` grant this still carries is removed by the contract release once
-- the build that uses the server boundary is deployed.
create or replace function public.create_organization(
  p_display_name text,
  p_slug text,
  p_customer_path text,
  p_headquarters_country_code char(2),
  p_default_locale text,
  p_default_time_zone text,
  p_terms_version text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  return public.create_organization_as_actor(
    actor_id, p_display_name, p_slug, p_customer_path, p_headquarters_country_code,
    p_default_locale, p_default_time_zone, p_terms_version, p_idempotency_key
  );
end;
$$;

commit;
