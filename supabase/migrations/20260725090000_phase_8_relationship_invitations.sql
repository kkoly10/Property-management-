-- Phase 8: resident and owner relationship-user invitation and activation.
-- Mirrors the staff-invitation vertical (20260724134409_phase_8_staff_access.sql) but targets
-- public.user_relationships instead of organization_memberships. Without this slice no product
-- command ever creates a user_relationships row, so an invited resident/owner cannot reach their
-- portal (every resident/owner RLS read path requires an ACTIVE user_relationships row).
begin;

-- Only one pending relationship invitation may exist per (organization, relationship). A re-invite
-- supersedes the prior pending token, mirroring invitations_pending_staff_unique for staff.
create unique index invitations_pending_relationship_unique
  on public.invitations(organization_id,relationship_type,relationship_id)
  where invitation_type in ('resident_relationship','owner_relationship') and status='pending';

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
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_email text := lower(trim(coalesce(p_email,'')));
  v_invitation_type text;
  v_person public.people%rowtype;
  v_owner public.owner_entities%rowtype;
  v_target_email text;
  v_authorized boolean;
  v_existing_rel public.user_relationships%rowtype;
  v_relationship_exists boolean;
  v_relationship_row_id uuid;
  v_request_hash text;
  v_previous private.idempotency_records%rowtype;
  v_invitation_id uuid := gen_random_uuid();
  v_correlation_id uuid := gen_random_uuid();
  v_expires_at timestamptz;
  v_response jsonb;
begin
  if v_actor_id is null then
    raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED';
  end if;
  if length(trim(coalesce(p_idempotency_key,''))) not between 8 and 200 then
    raise exception using errcode='22023',message='INVALID_IDEMPOTENCY_KEY';
  end if;
  if p_relationship_type not in ('resident_person','owner_entity') then
    raise exception using errcode='22023',message='INVALID_RELATIONSHIP_TYPE';
  end if;
  if p_redirect_surface not in ('crecy_living','crecy_owner') then
    raise exception using errcode='22023',message='INVALID_REDIRECT_SURFACE';
  end if;
  if (p_relationship_type='resident_person' and p_redirect_surface<>'crecy_living')
     or (p_relationship_type='owner_entity' and p_redirect_surface<>'crecy_owner') then
    raise exception using errcode='22023',message='REDIRECT_SURFACE_MISMATCH';
  end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception using errcode='22023',message='INVALID_EMAIL';
  end if;
  if p_token_hash !~ '^[0-9a-f]{64}$'
     or length(trim(coalesce(p_token_prefix,''))) not between 6 and 16 then
    raise exception using errcode='22023',message='INVALID_INVITATION_TOKEN';
  end if;
  if p_locale not in ('en-US','es-MX','en-CA','fr-CA') then
    raise exception using errcode='22023',message='INVALID_LOCALE';
  end if;

  -- Resolve the relationship target, enforce the email/relationship match, and authorize the
  -- caller against a property they actually manage for this relationship.
  if p_relationship_type='resident_person' then
    v_invitation_type := 'resident_relationship';
    select * into v_person
    from public.people p
    where p.id=p_relationship_id and p.organization_id=p_organization_id and p.archived_at is null;
    if not found then
      raise exception using errcode='P0002',message='RELATIONSHIP_NOT_FOUND';
    end if;
    v_target_email := lower(trim(coalesce(v_person.email::text,'')));
    select exists (
      select 1
      from public.household_members hm
      join public.tenancies t
        on t.organization_id=hm.organization_id and t.household_id=hm.household_id
      where hm.organization_id=p_organization_id
        and hm.person_id=p_relationship_id
        and hm.starts_on<=current_date
        and (hm.ends_on is null or hm.ends_on>=current_date)
        and t.status in ('scheduled','active','notice_given','move_out_in_progress')
        and private.has_property_access(t.property_id,'resident.manage')
    ) into v_authorized;
  else
    v_invitation_type := 'owner_relationship';
    select * into v_owner
    from public.owner_entities o
    where o.id=p_relationship_id and o.organization_id=p_organization_id and o.status='active';
    if not found then
      raise exception using errcode='P0002',message='RELATIONSHIP_NOT_FOUND';
    end if;
    v_target_email := lower(trim(coalesce(v_owner.email::text,'')));
    select exists (
      select 1
      from public.ownership_interests oi
      where oi.organization_id=p_organization_id
        and oi.owner_entity_id=p_relationship_id
        and oi.effective_from<=current_date
        and (oi.effective_to is null or oi.effective_to>=current_date)
        and private.has_property_access(oi.property_id,'owner.manage')
    ) into v_authorized;
  end if;
  if not v_authorized then
    raise exception using errcode='42501',message='PROPERTY_SCOPE_DENIED';
  end if;
  if v_target_email='' or v_target_email<>v_email then
    raise exception using errcode='22023',message='EMAIL_RELATIONSHIP_MISMATCH';
  end if;

  -- The invited auth user must already exist (resolved/created by the route) and own this email.
  if not exists (
    select 1 from auth.users u
    where u.id=p_invited_user_id and lower(u.email)=v_email
  ) then
    raise exception using errcode='22023',message='INVITED_USER_EMAIL_MISMATCH';
  end if;

  v_request_hash := encode(sha256(convert_to(concat_ws(
    '|',p_organization_id,p_invited_user_id,p_relationship_type,p_relationship_id,
    v_email,p_locale,p_redirect_surface,p_token_hash
  ),'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(
    '|',p_organization_id,v_actor_id,'InviteRelationshipUser',trim(p_idempotency_key)
  ),0));

  select * into v_previous
  from private.idempotency_records r
  where r.organization_id=p_organization_id
    and r.actor_scope='user:'||v_actor_id::text
    and r.route='InviteRelationshipUser'
    and r.idempotency_key=trim(p_idempotency_key);
  if found then
    if v_previous.request_hash<>v_request_hash then
      raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT';
    end if;
    if v_previous.state='completed' then
      return v_previous.response_body||jsonb_build_object('idempotentReplay',true);
    end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;

  select * into v_existing_rel
  from public.user_relationships ur
  where ur.user_id=p_invited_user_id
    and ur.organization_id=p_organization_id
    and ur.relationship_type=p_relationship_type
    and ur.relationship_id=p_relationship_id
  for update;
  v_relationship_exists := found;
  if v_relationship_exists and v_existing_rel.status='active' then
    raise exception using errcode='23505',message='RELATIONSHIP_ALREADY_ACTIVE';
  end if;
  -- One active portal user per relationship: a person is one individual and an owner entity gets a
  -- single conversation keyed on the relationship (not the user), so a second active user for the
  -- same relationship would collide in private.sync_relationship_conversation() at activation.
  if exists (
    select 1 from public.user_relationships ur2
    where ur2.organization_id=p_organization_id
      and ur2.relationship_type=p_relationship_type
      and ur2.relationship_id=p_relationship_id
      and ur2.status='active'
      and ur2.user_id<>p_invited_user_id
  ) then
    raise exception using errcode='23505',message='RELATIONSHIP_ALREADY_ACTIVE';
  end if;

  v_expires_at := now()+interval '72 hours';
  insert into private.idempotency_records(
    organization_id,actor_user_id,actor_scope,route,idempotency_key,
    request_hash,expires_at
  ) values (
    p_organization_id,v_actor_id,'user:'||v_actor_id::text,
    'InviteRelationshipUser',trim(p_idempotency_key),v_request_hash,
    now()+interval '24 hours'
  );

  if v_relationship_exists then
    update public.user_relationships set status='invited' where id=v_existing_rel.id;
    v_relationship_row_id := v_existing_rel.id;
  else
    v_relationship_row_id := gen_random_uuid();
    insert into public.user_relationships(
      id,user_id,organization_id,relationship_type,relationship_id,status
    ) values (
      v_relationship_row_id,p_invited_user_id,p_organization_id,
      p_relationship_type,p_relationship_id,'invited'
    );
  end if;

  update public.invitations i
  set status='superseded',revoked_at=now()
  where i.organization_id=p_organization_id
    and i.invitation_type=v_invitation_type
    and i.relationship_type=p_relationship_type
    and i.relationship_id=p_relationship_id
    and i.status='pending';
  insert into public.invitations(
    id,organization_id,invitation_type,email,relationship_type,relationship_id,
    token_hash,token_prefix,locale,redirect_surface,status,expires_at,invited_by
  ) values (
    v_invitation_id,p_organization_id,v_invitation_type,v_email,p_relationship_type,p_relationship_id,
    p_token_hash,trim(p_token_prefix),p_locale,p_redirect_surface,'pending',v_expires_at,v_actor_id
  );

  insert into private.notification_jobs(
    organization_id,template_code,locale,channel,recipient_user_id,
    recipient_address,payload,idempotency_key
  ) values (
    p_organization_id,
    case when p_relationship_type='resident_person' then 'resident_invitation' else 'owner_invitation' end,
    p_locale,'email',p_invited_user_id,v_email,
    jsonb_build_object(
      'invitationId',v_invitation_id,
      'organizationId',p_organization_id,
      'relationshipType',p_relationship_type,
      'redirectSurface',p_redirect_surface,
      'tokenPrefix',trim(p_token_prefix),
      'expiresAt',v_expires_at
    ),
    'relationship-invitation:'||v_invitation_id::text
  );

  insert into audit.audit_events(
    organization_id,actor_user_id,actor_type,action_code,resource_type,
    resource_id,correlation_id,after_data
  ) values (
    p_organization_id,v_actor_id,'user','relationship.invited','user_relationship',
    v_relationship_row_id,v_correlation_id,jsonb_build_object(
      'invitationId',v_invitation_id,
      'relationshipType',p_relationship_type,
      'relationshipId',p_relationship_id,
      'redirectSurface',p_redirect_surface,
      'expiresAt',v_expires_at
    )
  );
  insert into private.outbox_events(
    organization_id,event_type,aggregate_type,aggregate_id,
    correlation_id,payload
  ) values
  (
    p_organization_id,'relationship.invited','user_relationship',
    v_relationship_row_id,v_correlation_id,jsonb_build_object(
      'invitationId',v_invitation_id,
      'relationshipType',p_relationship_type,
      'relationshipId',p_relationship_id,
      'redirectSurface',p_redirect_surface,
      'expiresAt',v_expires_at
    )
  ),
  (
    p_organization_id,'notification.requested','invitation',
    v_invitation_id,v_correlation_id,jsonb_build_object(
      'templateCode',
        case when p_relationship_type='resident_person' then 'resident_invitation' else 'owner_invitation' end,
      'recipientRelationship',p_relationship_type,
      'locale',p_locale,
      'channelPreference','email'
    )
  );

  v_response := jsonb_build_object(
    'invitationId',v_invitation_id,
    'relationshipType',p_relationship_type,
    'relationshipId',p_relationship_id,
    'redirectSurface',p_redirect_surface,
    'email',v_email,
    'status','invited',
    'expiresAt',v_expires_at,
    'deliveryStatus','queued'
  );
  update private.idempotency_records r
  set state='completed',response_status=201,response_body=v_response,
      resource_type='user_relationship',resource_id=v_relationship_row_id,
      completed_at=now()
  where r.organization_id=p_organization_id
    and r.actor_scope='user:'||v_actor_id::text
    and r.route='InviteRelationshipUser'
    and r.idempotency_key=trim(p_idempotency_key);
  return v_response;
end;
$$;

create or replace function public.accept_relationship_invitation(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_invitation public.invitations%rowtype;
  v_relationship public.user_relationships%rowtype;
  v_correlation_id uuid := gen_random_uuid();
begin
  if v_actor_id is null then
    raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED';
  end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='22023',message='INVALID_INVITATION_TOKEN';
  end if;
  select * into v_invitation
  from public.invitations i
  where i.token_hash=p_token_hash
    and i.invitation_type in ('resident_relationship','owner_relationship')
  for update;
  if not found then
    raise exception using errcode='P0002',message='INVITATION_NOT_FOUND';
  end if;
  select * into v_relationship
  from public.user_relationships ur
  where ur.organization_id=v_invitation.organization_id
    and ur.relationship_type=v_invitation.relationship_type
    and ur.relationship_id=v_invitation.relationship_id
    and ur.user_id=v_actor_id
  for update;
  if not found then
    raise exception using errcode='42501',message='INVITATION_RECIPIENT_MISMATCH';
  end if;
  if v_invitation.status='accepted' and v_relationship.status='active' then
    return jsonb_build_object(
      'relationshipType',v_relationship.relationship_type,
      'relationshipId',v_relationship.relationship_id,
      'organizationId',v_relationship.organization_id,
      'redirectSurface',v_invitation.redirect_surface,
      'status','active'
    );
  end if;
  if v_invitation.status<>'pending' then
    raise exception using errcode='23514',message='INVITATION_NOT_PENDING';
  end if;
  if v_invitation.expires_at<=now() then
    update public.invitations set status='expired' where id=v_invitation.id;
    raise exception using errcode='22023',message='INVITATION_EXPIRED';
  end if;
  if v_relationship.status<>'invited' then
    raise exception using errcode='23514',message='RELATIONSHIP_NOT_INVITED';
  end if;

  update public.invitations
  set status='accepted',accepted_at=now()
  where id=v_invitation.id;
  update public.user_relationships
  set status='active'
  where id=v_relationship.id;
  insert into audit.audit_events(
    organization_id,actor_user_id,actor_type,action_code,resource_type,
    resource_id,correlation_id,after_data
  ) values (
    v_relationship.organization_id,v_actor_id,'user','relationship.activated',
    'user_relationship',v_relationship.id,v_correlation_id,jsonb_build_object(
      'invitationId',v_invitation.id,
      'relationshipType',v_relationship.relationship_type,
      'relationshipId',v_relationship.relationship_id
    )
  );
  insert into private.outbox_events(
    organization_id,event_type,aggregate_type,aggregate_id,
    correlation_id,payload
  ) values (
    v_relationship.organization_id,'relationship.activated','user_relationship',
    v_relationship.id,v_correlation_id,jsonb_build_object(
      'invitationId',v_invitation.id,
      'relationshipType',v_relationship.relationship_type,
      'relationshipId',v_relationship.relationship_id
    )
  );
  return jsonb_build_object(
    'relationshipType',v_relationship.relationship_type,
    'relationshipId',v_relationship.relationship_id,
    'organizationId',v_relationship.organization_id,
    'redirectSurface',v_invitation.redirect_surface,
    'status','active'
  );
end;
$$;

create or replace function public.get_relationship_invitation_delivery_status(
  p_invitation_id uuid
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select j.status
  from private.notification_jobs j
  where j.idempotency_key='relationship-invitation:'||p_invitation_id::text
  limit 1
$$;

create or replace function public.mark_relationship_invitation_email_sent(
  p_invitation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.notification_jobs j
  set status='sent',attempts=attempts+1
  where j.idempotency_key='relationship-invitation:'||p_invitation_id::text
    and j.status in ('queued','failed');
  return found;
end;
$$;

revoke all on function public.invite_relationship_user(
  uuid,uuid,text,uuid,text,text,text,text,text,text
) from public,anon,authenticated,service_role;
revoke all on function public.accept_relationship_invitation(text)
  from public,anon,authenticated,service_role;
revoke all on function public.get_relationship_invitation_delivery_status(uuid)
  from public,anon,authenticated,service_role;
revoke all on function public.mark_relationship_invitation_email_sent(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.invite_relationship_user(
  uuid,uuid,text,uuid,text,text,text,text,text,text
) to authenticated;
grant execute on function public.accept_relationship_invitation(text) to authenticated;
grant execute on function public.get_relationship_invitation_delivery_status(uuid) to service_role;
grant execute on function public.mark_relationship_invitation_email_sent(uuid) to service_role;

commit;
